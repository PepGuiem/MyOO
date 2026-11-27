import { createHmac, randomBytes } from 'node:crypto';

/**
 * Ayudas PURAS (sin red ni Nest) para hablar con Ably sin su SDK. Se prueban
 * en `ably.spec.ts`.
 *
 * Ably reparte los eventos en tiempo real por nosotros (Vercel no mantiene
 * conexiones abiertas). Cada usuario tiene su canal privado `user:<id>` y el
 * navegador solo puede ESCUCHAR el suyo.
 */

/** API REST de Ably (publicar y pedir tokens). */
export const ABLY_REST_URL = 'https://rest.ably.io';

/** Duración del token del navegador: 30 min (Ably admite hasta 1 h aquí). */
export const ABLY_TOKEN_TTL_MS = 30 * 60 * 1000;

/** Una clave de Ably: `appId.keyId:secret`. `keyName` es `appId.keyId`. */
export interface AblyKey {
  keyName: string;
  secret: string;
}

/**
 * Lee `ABLY_API_KEY`. Devuelve null si falta o no tiene el formato
 * `appId.keyId:secret` (así una clave mal copiada no tumba la app).
 */
export function parseAblyKey(raw: string | undefined | null): AblyKey | null {
  const value = raw?.trim();
  if (!value) return null;
  const m = /^([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+):([^\s:]+)$/.exec(value);
  if (!m) return null;
  return { keyName: m[1], secret: m[2] };
}

/** Canal privado de un usuario. */
export function userChannel(userId: string): string {
  return `user:${userId}`;
}

/**
 * Permisos del token: SOLO escuchar (`subscribe`) el canal propio. Con un
 * único canal y una única operación, `JSON.stringify` ya da la forma
 * canónica que pide Ably (sin espacios y ordenada).
 */
export function userCapability(userId: string): string {
  return JSON.stringify({ [userChannel(userId)]: ['subscribe'] });
}

/** Petición de token firmada (Ably la canjea por un token sin ver la clave). */
export interface SignedTokenRequest {
  keyName: string;
  ttl: number;
  capability: string;
  clientId: string;
  timestamp: number;
  nonce: string;
  mac: string;
}

/**
 * Firma una petición de token como indica la especificación de Ably:
 * HMAC-SHA256 (con el secreto de la clave) de
 * `keyName\n ttl\n capability\n clientId\n timestamp\n nonce\n`, en base64.
 * El secreto nunca sale del servidor: solo viaja la firma.
 */
export function signTokenRequest(
  key: AblyKey,
  params: {
    clientId: string;
    capability: string;
    ttl: number;
    timestamp?: number;
    nonce?: string;
  },
): SignedTokenRequest {
  const timestamp = params.timestamp ?? Date.now();
  const nonce = params.nonce ?? randomBytes(16).toString('hex');
  const text =
    [
      key.keyName,
      String(params.ttl),
      params.capability,
      params.clientId,
      String(timestamp),
      nonce,
    ].join('\n') + '\n';
  const mac = createHmac('sha256', key.secret)
    .update(text, 'utf8')
    .digest('base64');
  return {
    keyName: key.keyName,
    ttl: params.ttl,
    capability: params.capability,
    clientId: params.clientId,
    timestamp,
    nonce,
    mac,
  };
}

/** Token para un usuario: solo su canal, solo escuchar, `clientId` = su id. */
export function userTokenRequest(
  key: AblyKey,
  userId: string,
  now = Date.now(),
  nonce?: string,
): SignedTokenRequest {
  return signTokenRequest(key, {
    clientId: userId,
    capability: userCapability(userId),
    ttl: ABLY_TOKEN_TTL_MS,
    timestamp: now,
    nonce,
  });
}

/** Cabecera de autenticación básica con la clave (solo para publicar desde el servidor). */
export function basicAuthHeader(key: AblyKey): string {
  return `Basic ${Buffer.from(`${key.keyName}:${key.secret}`).toString('base64')}`;
}

/** Evento que viaja por Ably: solo el tipo y los ids (nunca el contenido). */
export type AblyEvent = { type: string } & Record<string, string>;

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= 100 ? v : null;
}

/** Id de un objeto `{ id }` (p. ej. el `user` de los eventos de seguidores). */
function idOf(v: unknown): string | null {
  return v && typeof v === 'object' ? str((v as { id?: unknown }).id) : null;
}

function dateStr(v: unknown): string | null {
  if (v instanceof Date)
    return Number.isNaN(v.getTime()) ? null : v.toISOString();
  return str(v);
}

/** Quita los campos vacíos (todos los valores son texto). */
function compact(e: Record<string, string | null>): AblyEvent | null {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(e)) if (v) out[k] = v;
  return typeof out.type === 'string' ? (out as AblyEvent) : null;
}

/**
 * Convierte un evento interno (el del WebSocket, que sí lleva el mensaje
 * entero) en el aviso pequeño que se publica en Ably. Lo que no esté en esta
 * lista NO se publica. El navegador pide luego el contenido a nuestra API,
 * que comprueba permisos.
 */
export function toAblyEvent(event: {
  type: string;
  [key: string]: unknown;
}): AblyEvent | null {
  switch (event.type) {
    case 'message': {
      const m = event.message as Record<string, unknown> | undefined;
      const conversationId = str(m?.conversationId);
      const messageId = str(m?.id);
      if (!conversationId || !messageId) return null;
      return compact({
        type: 'message',
        conversationId,
        messageId,
        senderId: idOf(m?.sender),
      });
    }
    case 'message_deleted':
      return need(event, ['conversationId', 'messageId']);
    case 'conversation':
      return need(event, ['conversationId']);
    case 'typing':
      return need(event, ['conversationId', 'userId']);
    case 'read': {
      const base = need(event, ['conversationId', 'userId']);
      if (!base) return null;
      return compact({ ...base, at: dateStr(event.at) });
    }
    case 'follow_request':
    case 'new_follower':
    case 'follow_accepted':
      return compact({ type: event.type, userId: idOf(event.user) });
    case 'notification':
      return compact({
        type: 'notification',
        notificationType: str(event.notificationType),
      });
    default:
      return null;
  }
}

/** Copia solo esos campos (texto); null si falta alguno. */
function need(
  event: Record<string, unknown>,
  fields: string[],
): AblyEvent | null {
  const out: Record<string, string> = { type: String(event.type) };
  for (const f of fields) {
    const v = str(event[f]);
    if (!v) return null;
    out[f] = v;
  }
  return out as AblyEvent;
}
