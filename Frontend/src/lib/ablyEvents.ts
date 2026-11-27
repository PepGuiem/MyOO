import type { NotificationType, RealtimeEvent } from '../api/types';

/** Conexión de solo lectura de Ably (Server-Sent Events, sin SDK). */
export function ablySseUrl(channel: string, token: string): string {
  return `https://realtime.ably.io/sse?channels=${encodeURIComponent(channel)}&v=1.2&accessToken=${encodeURIComponent(token)}`;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= 100 ? v : null;
}

/**
 * Convierte lo que llega por Ably en un evento de la web. Ably envuelve cada
 * mensaje (`{ channel, name, data: "<json>" }`) y nuestro backend solo manda
 * el tipo y los ids: el contenido se pide luego a la API (que comprueba
 * permisos). Lo que no se reconoce se ignora.
 */
export function parseAblyEvent(raw: string): RealtimeEvent | null {
  let data: unknown;
  try {
    const envelope = JSON.parse(raw) as unknown;
    data = envelope && typeof envelope === 'object' && 'data' in envelope ? (envelope as { data: unknown }).data : envelope;
    if (typeof data === 'string') data = JSON.parse(data) as unknown;
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const e = data as Record<string, unknown>;
  const conversationId = str(e.conversationId);
  const userId = str(e.userId);
  const type = e.type;
  switch (type) {
    case 'message': {
      const messageId = str(e.messageId);
      if (!conversationId || !messageId) return null;
      return { type: 'message_ref', conversationId, messageId, senderId: str(e.senderId) };
    }
    case 'message_deleted': {
      const messageId = str(e.messageId);
      return conversationId && messageId ? { type: 'message_deleted', conversationId, messageId } : null;
    }
    case 'read': {
      const at = str(e.at);
      return conversationId && userId && at ? { type: 'read', conversationId, userId, at } : null;
    }
    case 'typing':
      return conversationId && userId ? { type: 'typing', conversationId, userId } : null;
    case 'conversation':
      return conversationId ? { type: 'conversation', conversationId } : null;
    case 'follow_request':
    case 'new_follower':
    case 'follow_accepted':
      return { type, user: null, ...(userId ? { userId } : {}) };
    case 'notification': {
      const notificationType = str(e.notificationType);
      return notificationType ? { type: 'notification', notificationType: notificationType as NotificationType } : null;
    }
    default:
      return null;
  }
}
