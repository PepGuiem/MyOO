import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Cliente mínimo de la API REST de Stripe (sin el SDK: son pocas llamadas y
 * así no hay dependencia nueva). Versión de API fija: las respuestas tienen
 * siempre la misma forma aunque la cuenta de Stripe use otra más nueva. Por
 * eso el webhook NO lee los datos del evento: vuelve a pedir el objeto aquí.
 */
export const STRIPE_API_VERSION = '2024-06-20';
const BASE = 'https://api.stripe.com/v1';

/** Dominios desde los que Stripe sirve las facturas a los clientes. */
export const STRIPE_INVOICE_HOSTS = ['invoice.stripe.com', 'pay.stripe.com'] as const;

/**
 * Enlace de factura que se puede guardar y enseñar: solo https y solo en los
 * dominios de facturas de Stripe (nada de credenciales, puertos ni otros
 * hosts). Cualquier otra cosa devuelve null y no se muestra el enlace.
 */
export function safeInvoiceUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 500) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!(STRIPE_INVOICE_HOSTS as readonly string[]).includes(url.hostname)) return null;
  return url.toString();
}

export class StripeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

type Param = string | number | boolean | null | undefined | Param[] | { [k: string]: Param };

/** Codifica parámetros anidados como los espera Stripe: a[b][0][c]=1. */
export function encodeForm(params: Record<string, Param>): string {
  const out: string[] = [];
  const walk = (key: string, value: Param) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${key}[${i}]`, v));
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(`${key}[${k}]`, v);
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  };
  for (const [k, v] of Object.entries(params)) walk(k, v);
  return out.join('&');
}

export class StripeClient {
  constructor(
    private readonly secretKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get<T>(path: string, params: Record<string, Param> = {}): Promise<T> {
    return this.request<T>('GET', path, params);
  }

  post<T>(
    path: string,
    params: Record<string, Param> = {},
    idempotencyKey?: string,
  ): Promise<T> {
    return this.request<T>('POST', path, params, idempotencyKey);
  }

  delete<T>(path: string, params: Record<string, Param> = {}): Promise<T> {
    return this.request<T>('DELETE', path, params);
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, Param>,
    idempotencyKey?: string,
  ): Promise<T> {
    const body = encodeForm(params);
    const url = method === 'POST' || !body ? `${BASE}${path}` : `${BASE}${path}?${body}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      'Stripe-Version': STRIPE_API_VERSION,
    };
    if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const res = await this.fetchImpl(url, {
      method,
      headers,
      body: method === 'POST' ? body : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    if (!res.ok) {
      // El mensaje de Stripe no lleva datos de tarjeta; no se reenvía tal cual al cliente.
      throw new StripeApiError(
        res.status,
        json.error?.message ?? `Stripe error ${res.status}`,
        json.error?.code,
      );
    }
    return json as T;
  }
}

/**
 * Comprueba la cabecera Stripe-Signature (t=…,v1=…) del webhook: HMAC-SHA256
 * de "t.cuerpo" con el secreto whsec_…, y que el evento no tenga más de 5 min.
 */
export function verifyStripeSignature(
  payload: Buffer | string,
  header: string | undefined,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!header) return false;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2).map((x) => x?.trim());
    if (k === 't' && v && /^\d+$/.test(v)) timestamp = Number(v);
    if (k === 'v1' && v) signatures.push(v);
  }
  if (timestamp === null || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(typeof payload === 'string' ? Buffer.from(payload) : payload)
    .digest();
  return signatures.some((s) => {
    if (!/^[0-9a-f]{64}$/i.test(s)) return false;
    const got = Buffer.from(s, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

// ---------------------------------------------------------------------------
// Formas (parciales) de los objetos de Stripe que usamos, en la versión fija.
// ---------------------------------------------------------------------------

export interface StripePrice {
  id: string;
  product: string;
  unit_amount: number | null;
  currency: string;
  recurring: { interval: 'day' | 'week' | 'month' | 'year' } | null;
}

export interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
  current_period_start: number | null;
  ended_at: number | null;
  canceled_at: number | null;
  trial_end: number | null;
  latest_invoice: string | null;
  metadata: Record<string, string>;
  items: { data: { id: string; price: StripePrice }[] };
}

export interface StripeInvoice {
  id: string;
  status: string | null;
  customer: string;
  subscription: string | null;
  currency: string;
  amount_paid: number;
  amount_due: number;
  attempt_count: number;
  charge: string | null;
  payment_intent: string | null;
  /** Página pública de la factura en Stripe (null en borradores). */
  hosted_invoice_url?: string | null;
  status_transitions: { paid_at: number | null };
  lines: {
    data: {
      price: StripePrice | null;
      period: { start: number; end: number };
      amount: number;
    }[];
  };
}

export interface StripeCharge {
  id: string;
  amount: number;
  amount_refunded: number;
  payment_intent: string | null;
  invoice: string | null;
  failure_message: string | null;
}

export interface StripeCheckoutSession {
  id: string;
  url: string | null;
  client_reference_id: string | null;
  customer: string | null;
  subscription: string | null;
  invoice: string | null;
  status: string | null;
}

export interface StripeEventPayload {
  id: string;
  type: string;
  livemode: boolean;
  data: {
    object: { id?: string; object?: string };
    /** Campos que han cambiado (solo en eventos *.updated). */
    previous_attributes?: Record<string, unknown>;
  };
}
