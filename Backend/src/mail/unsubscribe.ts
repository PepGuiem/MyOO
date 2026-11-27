import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Enlace «Dejar de recibir estos avisos» del pie de cada aviso por correo.
 * Funciona sin iniciar sesión, así que va firmado (HMAC-SHA256 con una clave
 * derivada de JWT_SECRET): nadie puede fabricar el enlace de otra cuenta.
 * No caduca a propósito (un enlace para darse de baja tiene que funcionar
 * siempre) y solo puede APAGAR avisos, nunca encenderlos.
 */
export const NOTICE_KINDS = ['payments', 'chat'] as const;
export type NoticeKind = (typeof NOTICE_KINDS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function key(secret: string): Buffer {
  // Clave propia para este uso: una firma de baja nunca vale como JWT ni al revés.
  return createHmac('sha256', secret).update('myoo:mail-unsubscribe:v1').digest();
}

function sign(secret: string, userId: string, kind: NoticeKind): string {
  return createHmac('sha256', key(secret)).update(`${userId}.${kind}`).digest('base64url');
}

export function unsubscribeToken(secret: string, userId: string, kind: NoticeKind): string {
  return `${userId}.${kind}.${sign(secret, userId, kind)}`;
}

/** Devuelve la cuenta y el tipo de aviso si la firma es buena; si no, null. */
export function readUnsubscribeToken(
  secret: string,
  token: unknown,
): { userId: string; kind: NoticeKind } | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const [userId, kind, sig, ...rest] = token.split('.');
  if (rest.length || !userId || !kind || !sig) return null;
  if (!UUID.test(userId) || !(NOTICE_KINDS as readonly string[]).includes(kind)) return null;
  const expected = Buffer.from(sign(secret, userId, kind as NoticeKind));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { userId: userId.toLowerCase(), kind: kind as NoticeKind };
}
