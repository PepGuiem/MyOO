import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/env.validation';
import type { MailContent } from './templates';

const RESEND_URL = 'https://api.resend.com/emails';
/** Si Resend no responde en este tiempo, se da el correo por no enviado. */
const SEND_TIMEOUT_MS = 8000;

/** «MyOO <hola@dominio.com>» o «hola@dominio.com». */
const FROM_FORMAT = /^(?:[^<>@\r\n]{1,80} <[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/;

export type MailProblem = 'missing' | 'invalid_from';

/** Lo que hay que enviar: a quién, el contenido y, en avisos, el enlace de baja. */
export interface OutgoingMail extends MailContent {
  to: string;
  /** Enlace de baja en un clic (cabecera List-Unsubscribe, la usa Gmail). */
  oneClickUnsubscribeUrl?: string;
  /** Para que Resend no repita el mismo correo si se reintenta. */
  idempotencyKey?: string;
}

/** Forma del cuerpo que espera `POST https://api.resend.com/emails`. */
export function resendPayload(from: string, mail: OutgoingMail): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    from,
    to: [mail.to],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  };
  if (mail.oneClickUnsubscribeUrl) {
    payload.headers = {
      'List-Unsubscribe': `<${mail.oneClickUnsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }
  return payload;
}

/**
 * Envío de correos con Resend, sin SDK (una sola llamada REST con `fetch`,
 * como Stripe en billing/stripe.client.ts). Opcional:
 * - Sin RESEND_API_KEY y EMAIL_FROM (o con un remitente mal escrito) está
 *   apagado: `enabled` es false, `send` no hace nada y la web oculta lo que
 *   depende del correo.
 * - Nunca lanza errores: si Resend falla devuelve false y lo apunta en el log
 *   (sin la clave ni el contenido del correo).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly apiKey: string | null;
  private readonly from: string | null;
  readonly problem: MailProblem | null;
  /** Origen público de la web, para los enlaces y el logo de los correos. */
  readonly frontendUrl: string;
  /** URL pública de la API (para la baja en un clic). */
  readonly publicApiUrl: string;

  /** Se puede cambiar en los tests (no se inyecta: Nest no sabría resolverlo). */
  fetchImpl: typeof fetch = (input, init) => fetch(input, init);

  constructor(config: ConfigService<AppConfig, true>) {
    const key = config.get('RESEND_API_KEY', { infer: true })?.trim() || null;
    const from = config.get('EMAIL_FROM', { infer: true })?.trim() || null;
    this.frontendUrl = config.get('FRONTEND_URL', { infer: true });
    this.publicApiUrl = config.get('OAUTH_PUBLIC_API_URL', { infer: true });
    if (!key || !from) this.problem = 'missing';
    else if (!FROM_FORMAT.test(from)) this.problem = 'invalid_from';
    else this.problem = null;
    if (this.problem === 'invalid_from') {
      this.logger.warn('EMAIL_FROM no tiene el formato «Nombre <correo@dominio>»: correo apagado');
    }
    this.apiKey = this.problem ? null : key;
    this.from = this.problem ? null : from;
  }

  get enabled(): boolean {
    return this.problem === null;
  }

  /** Envía un correo. true si Resend lo ha aceptado. */
  async send(mail: OutgoingMail): Promise<boolean> {
    if (!this.apiKey || !this.from) return false;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (mail.idempotencyKey) headers['Idempotency-Key'] = mail.idempotencyKey.slice(0, 256);
    try {
      const res = await this.fetchImpl(RESEND_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(resendPayload(this.from, mail)),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) {
        // Solo el código y el nombre del error de Resend (p. ej. validation_error).
        let name = '';
        try {
          const body = (await res.json()) as { name?: unknown };
          if (typeof body.name === 'string') name = ` ${body.name.slice(0, 60)}`;
        } catch {
          /* sin cuerpo */
        }
        this.logger.warn(`Resend respondió ${res.status}${name}: correo no enviado`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(
        `No se pudo hablar con Resend (${err instanceof Error ? err.name : 'error'}): correo no enviado`,
      );
      return false;
    }
  }
}
