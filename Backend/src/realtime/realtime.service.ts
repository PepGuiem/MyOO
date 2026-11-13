import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

/** Lo que el servidor manda por el WebSocket: `{ type, ...datos }`. */
export interface ServerEvent {
  type: string;
  [key: string]: unknown;
}

/** Lo mínimo de una conexión que usa este servicio (un WebSocket de `ws`). */
export interface ClientConnection {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** Un mensaje que llega del navegador por el WebSocket. */
export type ClientEventHandler = (
  userId: string,
  payload: Record<string, unknown>,
) => void | Promise<void>;

const OPEN = 1;
/** Un ticket vale 30 segundos y una sola vez. */
const TICKET_TTL_MS = 30_000;
/** Conexiones abiertas a la vez por usuario (pestañas, móvil...). */
export const MAX_CONNECTIONS_PER_USER = 6;

/**
 * Tiempo real: quién está conectado y cómo hacerle llegar un evento.
 *
 * - El navegador no puede mandar la cabecera Authorization al abrir un
 *   WebSocket. Por eso primero pide, con su token, un TICKET de un solo uso
 *   (POST /api/realtime/ticket) y abre `/api/ws?ticket=...`. El ticket caduca
 *   en 30 s; aquí solo se guarda su hash.
 * - Todo vive en la memoria de ESTE proceso: con varias instancias del
 *   backend haría falta un intermediario (p. ej. Redis pub/sub).
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly connections = new Map<string, Set<ClientConnection>>();
  private readonly tickets = new Map<
    string,
    { userId: string; expiresAt: number; sessionEndsAt: number }
  >();
  private readonly handlers = new Map<string, ClientEventHandler>();
  /** Contadores desde que arrancó el proceso (para el monitor). */
  private eventsSent = 0;
  private eventsReceived = 0;

  // --- Tickets -------------------------------------------------------------

  /** `sessionEndsAt`: cuándo caduca el token de sesión (la conexión se cierra entonces). */
  issueTicket(
    userId: string,
    sessionEndsAt: number,
  ): { ticket: string; expiresIn: number } {
    this.sweepTickets();
    const ticket = randomBytes(32).toString('base64url');
    this.tickets.set(hash(ticket), {
      userId,
      expiresAt: Date.now() + TICKET_TTL_MS,
      sessionEndsAt,
    });
    return { ticket, expiresIn: TICKET_TTL_MS / 1000 };
  }

  /** Gasta un ticket: devuelve el usuario si era válido (y ya no vuelve a valer). */
  consumeTicket(
    ticket: string,
  ): { userId: string; sessionEndsAt: number } | null {
    if (!ticket || ticket.length > 100) return null;
    const key = hash(ticket);
    const t = this.tickets.get(key);
    this.tickets.delete(key);
    if (!t || t.expiresAt < Date.now()) return null;
    return { userId: t.userId, sessionEndsAt: t.sessionEndsAt };
  }

  private sweepTickets(): void {
    const now = Date.now();
    for (const [k, t] of this.tickets)
      if (t.expiresAt < now) this.tickets.delete(k);
  }

  // --- Conexiones ------------------------------------------------------------

  /** Registra una conexión. false si el usuario ya tiene demasiadas abiertas. */
  add(userId: string, conn: ClientConnection): boolean {
    let set = this.connections.get(userId);
    if (!set) {
      set = new Set();
      this.connections.set(userId, set);
    }
    if (set.size >= MAX_CONNECTIONS_PER_USER) return false;
    set.add(conn);
    return true;
  }

  remove(userId: string, conn: ClientConnection): void {
    const set = this.connections.get(userId);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) this.connections.delete(userId);
  }

  /** Cifras para el monitor: usuarios conectados, conexiones y eventos. */
  stats(): {
    users: number;
    connections: number;
    pendingTickets: number;
    eventsSent: number;
    eventsReceived: number;
  } {
    let connections = 0;
    for (const set of this.connections.values()) connections += set.size;
    return {
      users: this.connections.size,
      connections,
      pendingTickets: this.tickets.size,
      eventsSent: this.eventsSent,
      eventsReceived: this.eventsReceived,
    };
  }

  isOnline(userId: string): boolean {
    return this.connections.has(userId);
  }

  /** Cierra todas las conexiones de un usuario (p. ej. al borrar la cuenta). */
  disconnect(userId: string, code = 4000, reason = 'closed'): void {
    for (const c of this.connections.get(userId) ?? []) c.close(code, reason);
    this.connections.delete(userId);
  }

  /** Envía un evento a todas las conexiones de esos usuarios. */
  emit(userIds: Iterable<string>, event: ServerEvent): void {
    const data = JSON.stringify(event);
    for (const id of new Set(userIds)) {
      for (const c of this.connections.get(id) ?? []) {
        if (c.readyState !== OPEN) continue;
        try {
          c.send(data);
          this.eventsSent++;
        } catch {
          this.logger.warn('No se pudo enviar un evento');
        }
      }
    }
  }

  // --- Mensajes del navegador ----------------------------------------------

  /** Los módulos registran qué hacer con cada tipo de mensaje (p. ej. el chat, "typing"). */
  on(type: string, handler: ClientEventHandler): void {
    this.handlers.set(type, handler);
  }

  async dispatch(
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    this.eventsReceived++;
    const type = typeof payload.type === 'string' ? payload.type : '';
    const handler = this.handlers.get(type);
    if (handler) await handler(userId, payload);
  }
}

function hash(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}
