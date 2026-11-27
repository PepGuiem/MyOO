import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/env.validation';
import {
  ABLY_REST_URL,
  type AblyKey,
  basicAuthHeader,
  parseAblyKey,
  toAblyEvent,
  userChannel,
  userTokenRequest,
} from './ably';

/** Tiempo máximo de cada llamada a Ably: si tarda más, se sigue sin él. */
const ABLY_TIMEOUT_MS = 3000;
/** Canales que se publican a la vez (p. ej. un aviso a muchas cuentas). */
const PUBLISH_CONCURRENCY = 10;

/** Token del navegador: solo puede escuchar su canal. */
export interface AblyBrowserToken {
  token: string;
  /** Cuándo caduca, en milisegundos desde 1970 (reloj de Ably). */
  expires: number;
  /** Segundos que le quedan (así no depende del reloj del navegador). */
  expiresIn: number;
  channel: string;
}

/**
 * Tiempo real con Ably (opcional). Sin `ABLY_API_KEY` no hace nada y la web
 * sigue como siempre (WebSocket en local y consultas periódicas en Vercel).
 *
 * - `publish`: avisa a cada usuario en su canal `user:<id>` por la API REST
 *   (sin SDK). Si Ably falla, se anota en el log y se sigue: el mensaje ya
 *   está guardado y el navegador lo verá en su próxima consulta.
 * - `requestToken`: pide a Ably un token corto que solo deja ESCUCHAR el
 *   canal propio. La clave nunca sale del servidor.
 */
@Injectable()
export class AblyService {
  private readonly logger = new Logger('Ably');
  private readonly key: AblyKey | null;
  /** Contadores desde que arrancó el proceso (para el log y el monitor). */
  private published = 0;
  private failed = 0;

  constructor(config: ConfigService<AppConfig, true>) {
    const raw = config.get('ABLY_API_KEY', { infer: true });
    this.key = parseAblyKey(raw);
    if (raw?.trim() && !this.key) {
      this.logger.warn(
        'ABLY_API_KEY ignorada (formato esperado appId.keyId:secret)',
      );
    }
  }

  get enabled(): boolean {
    return this.key !== null;
  }

  stats(): { enabled: boolean; published: number; failed: number } {
    return {
      enabled: this.enabled,
      published: this.published,
      failed: this.failed,
    };
  }

  /** Publica el aviso (solo tipo e ids) en el canal de cada usuario. Nunca lanza errores. */
  async publish(
    userIds: Iterable<string>,
    event: { type: string; [key: string]: unknown },
  ): Promise<void> {
    const key = this.key;
    if (!key) return;
    const slim = toAblyEvent(event);
    if (!slim) return;
    const ids = [...new Set(userIds)].filter(Boolean);
    const body = JSON.stringify({
      name: slim.type,
      data: JSON.stringify(slim),
    });
    let errors = 0;
    for (let i = 0; i < ids.length; i += PUBLISH_CONCURRENCY) {
      const results = await Promise.allSettled(
        ids
          .slice(i, i + PUBLISH_CONCURRENCY)
          .map((id) => this.post(key, userChannel(id), body)),
      );
      errors += results.filter((r) => r.status === 'rejected').length;
    }
    this.published += ids.length - errors;
    this.failed += errors;
    if (errors > 0) {
      this.logger.warn(
        `No se pudo publicar "${slim.type}" en ${errors} de ${ids.length} canales`,
      );
    }
  }

  private async post(key: AblyKey, channel: string, body: string) {
    const res = await fetch(
      `${ABLY_REST_URL}/channels/${encodeURIComponent(channel)}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(key),
          'Content-Type': 'application/json',
        },
        body,
        signal: AbortSignal.timeout(ABLY_TIMEOUT_MS),
      },
    );
    if (!res.ok) throw new Error(`Ably ${res.status}`);
  }

  /**
   * Token para el navegador de `userId`: se firma aquí una petición de
   * token (HMAC con el secreto) y Ably la canjea por el token. Lanza un
   * error si Ably no está configurado o no responde bien.
   */
  async requestToken(userId: string): Promise<AblyBrowserToken> {
    const key = this.key;
    if (!key) throw new Error('Ably is not configured');
    const request = userTokenRequest(key, userId);
    const res = await fetch(
      `${ABLY_REST_URL}/keys/${encodeURIComponent(key.keyName)}/requestToken`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(ABLY_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      this.logger.warn(`Ably no ha dado el token (${res.status})`);
      throw new Error(`Ably ${res.status}`);
    }
    const details = (await res.json()) as {
      token?: unknown;
      expires?: unknown;
    };
    if (
      typeof details.token !== 'string' ||
      typeof details.expires !== 'number'
    )
      throw new Error('Unexpected token response from Ably');
    return {
      token: details.token,
      expires: details.expires,
      expiresIn: Math.max(0, Math.floor((details.expires - Date.now()) / 1000)),
      channel: userChannel(userId),
    };
  }
}
