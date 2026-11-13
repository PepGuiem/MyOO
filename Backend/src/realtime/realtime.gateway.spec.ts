import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/** Prueba de verdad: servidor HTTP + WebSocket reales en un puerto libre. */
describe('RealtimeGateway (WebSocket real)', () => {
  let server: Server;
  let gateway: RealtimeGateway;
  let realtime: RealtimeService;
  let base: string;

  beforeAll(async () => {
    server = createServer((_req, res) => res.end('ok'));
    realtime = new RealtimeService();
    const config = {
      get: (k: string) =>
        k === 'CORS_ORIGIN' ? 'http://localhost:5173' : 'http://localhost:5173',
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gateway = new RealtimeGateway({} as any, realtime, config as any);
    gateway.attach(server);
    await new Promise<void>((r) => server.listen(0, r));
    base = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/ws`;
  });

  afterAll(async () => {
    gateway.onApplicationShutdown();
    await new Promise((r) => server.close(r));
  });

  function open(
    url: string,
    origin?: string,
  ): Promise<{ ws: WebSocket; first: Promise<unknown> } | { status: number }> {
    return new Promise((resolve) => {
      const ws = new WebSocket(url, origin ? { origin } : {});
      const first = new Promise((r) =>
        ws.once('message', (d: Buffer) => r(JSON.parse(d.toString()))),
      );
      ws.once('open', () => resolve({ ws, first }));
      ws.once(
        'unexpected-response',
        (_req: unknown, res: { statusCode: number }) =>
          resolve({ status: res.statusCode }),
      );
    });
  }

  it('sin ticket o con uno inventado: 401', async () => {
    expect(await open(base)).toEqual({ status: 401 });
    expect(await open(`${base}?ticket=inventado`)).toEqual({ status: 401 });
  });

  it('desde otra web (Origin no permitido): 403', async () => {
    const { ticket } = realtime.issueTicket('u1', Date.now() + 60_000);
    expect(
      await open(`${base}?ticket=${ticket}`, 'https://evil.example'),
    ).toEqual({ status: 403 });
  });

  it('con ticket: conecta, recibe eventos y el ticket no se puede reutilizar', async () => {
    const { ticket } = realtime.issueTicket('u1', Date.now() + 60_000);
    const r = await open(`${base}?ticket=${ticket}`, 'http://localhost:5173');
    if (!('ws' in r)) throw new Error('no conectó');
    expect(await r.first).toEqual({ type: 'ready' });

    const next = new Promise((res) =>
      r.ws.once('message', (d: Buffer) => res(JSON.parse(d.toString()))),
    );
    realtime.emit(['u1'], { type: 'message', text: 'hola' });
    expect(await next).toEqual({ type: 'message', text: 'hola' });

    expect(await open(`${base}?ticket=${ticket}`)).toEqual({ status: 401 });
    r.ws.close();
  });

  it('lo que manda el navegador llega al módulo que lo atiende', async () => {
    const got = new Promise<[string, unknown]>((res) =>
      realtime.on('typing', (u, p) => res([u, p.conversationId])),
    );
    const { ticket } = realtime.issueTicket('u2', Date.now() + 60_000);
    const r = await open(`${base}?ticket=${ticket}`);
    if (!('ws' in r)) throw new Error('no conectó');
    await r.first;
    r.ws.send('esto no es json');
    r.ws.send(JSON.stringify({ type: 'typing', conversationId: 'c9' }));
    expect(await got).toEqual(['u2', 'c9']);
    r.ws.close();
  });

  it('otras rutas: 404', async () => {
    const { ticket } = realtime.issueTicket('u3', Date.now() + 60_000);
    expect(
      await open(
        `ws://127.0.0.1:${(server.address() as AddressInfo).port}/otra?ticket=${ticket}`,
      ),
    ).toEqual({ status: 404 });
  });
});
