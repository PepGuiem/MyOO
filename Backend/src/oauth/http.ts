/**
 * Llamadas HTTP a los proveedores (Google, Apple, Instagram) con `fetch` de
 * Node, con tiempo máximo y sin seguir redirecciones.
 */

/** Error al hablar con un proveedor. El mensaje NO incluye tokens ni secretos. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Código de error que devolvió el proveedor (p. ej. "invalid_grant"). */
    readonly providerCode?: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Pide JSON. `label` sirve para el mensaje de error (nunca la URL: puede llevar tokens). */
export async function fetchJson<T>(
  fetchImpl: FetchLike,
  label: string,
  url: string,
  init: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ProviderError(`${label}: network error`);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const b = (body ?? {}) as Record<string, unknown>;
    const nested = (
      b.error && typeof b.error === 'object' ? b.error : null
    ) as Record<string, unknown> | null;
    const code =
      typeof b.error === 'string'
        ? b.error
        : typeof b.error_type === 'string'
          ? b.error_type
          : typeof nested?.type === 'string'
            ? nested.type
            : undefined;
    throw new ProviderError(
      `${label}: HTTP ${res.status}${code ? ` (${code})` : ''}`,
      res.status,
      code,
    );
  }
  return body as T;
}

/** Cuerpo application/x-www-form-urlencoded. */
export function form(fields: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  };
}
