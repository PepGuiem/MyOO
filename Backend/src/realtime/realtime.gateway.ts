import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { AppConfig } from '../config/env.validation';
import { RealtimeService } from './realtime.service';

/** Ruta del WebSocket (bajo el mismo prefijo /api que el resto). */
export const WS_PATH = '/api/ws';
/** Tamaño máximo de un mensaje del navegador (solo manda cosas pequeñas). */
const MAX_PAYLOAD = 4 * 1024;
/** Cada cuánto se comprueba que la conexión sigue viva. */
const HEARTBEAT_MS = 30_000;
/** Mensajes del navegador por conexión y por 10 s (el resto se ignoran). */
const MAX_CLIENT_MESSAGES = 40;

type LiveSocket = WebSocket & { isAlive?: boolean };

/**
 * Servidor WebSocket con la librería `ws`, colgado del mismo servidor HTTP
 * que la API (mismo puerto). Solo hace de "tubería":
 *  1. Al abrir: comprueba el origen (que sea la web de MyOO) y el ticket.
 *  2. Registra la conexión en RealtimeService.
 *  3. Lo que llega del navegador (JSON pequeño) se pasa a RealtimeService.dispatch.
 *  4. Ping cada 30 s; si no contesta, se corta. Al caducar la sesión, se cierra.
 */
@Injectable()
export class RealtimeGateway
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private wss?: WebSocketServer;
  private heartbeat?: NodeJS.Timeout;
  private server?: Server;
  private readonly allowedOrigins: Set<string>;
  private readonly onUpgrade = (
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => this.upgrade(req, socket, head);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly realtime: RealtimeService,
    config: ConfigService<AppConfig, true>,
  ) {
    const origins = [
      ...config.get('CORS_ORIGIN', { infer: true }).split(','),
      config.get('FRONTEND_URL', { infer: true }),
    ];
    this.allowedOrigins = new Set(origins.map((o) => o.trim()).filter(Boolean));
  }

  onApplicationBootstrap(): void {
    const server = this.adapterHost.httpAdapter?.getHttpServer() as
      Server | undefined;
    if (!server) return;
    this.attach(server);
  }

  /** Separado para poder probarlo con un servidor HTTP cualquiera. */
  attach(server: Server): void {
    this.server = server;
    this.wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
    server.on('upgrade', this.onUpgrade);
    this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  onApplicationShutdown(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.server?.off('upgrade', this.onUpgrade);
    for (const c of this.wss?.clients ?? []) c.terminate();
    this.wss?.close();
  }

  private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const reject = (status: number, text: string) => {
      socket.write(
        `HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
      socket.destroy();
    };
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== WS_PATH) {
      // No es nuestro. Si nadie más atiende WebSockets en este servidor, se corta.
      if (this.server && this.server.listenerCount('upgrade') <= 1)
        reject(404, 'Not Found');
      return;
    }

    // Un navegador SIEMPRE manda Origin: así otra web no puede abrir el
    // WebSocket con tu sesión. Sin Origin (apps, pruebas) decide el ticket.
    const origin = req.headers.origin;
    if (origin && !this.allowedOrigins.has(origin))
      return reject(403, 'Forbidden');

    const session = this.realtime.consumeTicket(
      url.searchParams.get('ticket') ?? '',
    );
    if (!session) return reject(401, 'Unauthorized');

    this.wss!.handleUpgrade(req, socket, head, (ws: WebSocket) =>
      this.connected(ws as LiveSocket, session.userId, session.sessionEndsAt),
    );
  }

  private connected(
    ws: LiveSocket,
    userId: string,
    sessionEndsAt: number,
  ): void {
    if (!this.realtime.add(userId, ws)) {
      ws.close(4008, 'too many connections');
      return;
    }
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));

    // La conexión no dura más que el token de sesión con el que se abrió.
    const left = sessionEndsAt - Date.now();
    const expiry = setTimeout(
      () => ws.close(4001, 'session expired'),
      Math.max(1000, Math.min(left, 2 ** 31 - 1)),
    );

    let windowStart = Date.now();
    let count = 0;
    ws.on(
      'message',
      (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
        if (isBinary) return;
        const now = Date.now();
        if (now - windowStart > 10_000) {
          windowStart = now;
          count = 0;
        }
        if (++count > MAX_CLIENT_MESSAGES) return;
        let payload: unknown;
        try {
          payload = JSON.parse(
            Buffer.isBuffer(data)
              ? data.toString('utf8')
              : Array.isArray(data)
                ? Buffer.concat(data).toString('utf8')
                : Buffer.from(data).toString('utf8'),
          );
        } catch {
          return;
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload))
          return;
        const p = payload as Record<string, unknown>;
        if (p.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
          return;
        }
        void this.realtime
          .dispatch(userId, p)
          .catch((err: unknown) =>
            this.logger.warn(
              `Evento del cliente: ${err instanceof Error ? err.message : 'error'}`,
            ),
          );
      },
    );

    ws.on('close', () => {
      clearTimeout(expiry);
      this.realtime.remove(userId, ws);
    });
    ws.on('error', () => ws.terminate());
    ws.send(JSON.stringify({ type: 'ready' }));
  }

  private ping(): void {
    for (const c of (this.wss?.clients ?? new Set()) as Set<LiveSocket>) {
      if (c.isAlive === false) {
        c.terminate();
        continue;
      }
      c.isAlive = false;
      c.ping();
    }
  }
}
