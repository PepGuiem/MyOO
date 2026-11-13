import { MAX_CONNECTIONS_PER_USER, RealtimeService } from './realtime.service';

function fakeConn(open = true) {
  const sent: string[] = [];
  const conn = {
    readyState: open ? 1 : 3,
    send: (d: string) => sent.push(d),
    close: () => undefined,
  };
  return { conn, sent };
}

describe('RealtimeService', () => {
  it('un ticket vale una sola vez', () => {
    const rt = new RealtimeService();
    const { ticket } = rt.issueTicket('u1', Date.now() + 60_000);
    expect(rt.consumeTicket(ticket)?.userId).toBe('u1');
    expect(rt.consumeTicket(ticket)).toBeNull();
    expect(rt.consumeTicket('inventado')).toBeNull();
  });

  it('un ticket caducado no vale', () => {
    const rt = new RealtimeService();
    const now = Date.now();
    const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
    const { ticket } = rt.issueTicket('u1', now + 60_000);
    spy.mockReturnValue(now + 31_000);
    expect(rt.consumeTicket(ticket)).toBeNull();
    spy.mockRestore();
  });

  it('envía los eventos solo a las conexiones abiertas de esos usuarios', () => {
    const rt = new RealtimeService();
    const a1 = fakeConn();
    const a2 = fakeConn();
    const closed = fakeConn(false);
    const b = fakeConn();
    rt.add('a', a1.conn);
    rt.add('a', a2.conn);
    rt.add('a', closed.conn);
    rt.add('b', b.conn);
    rt.emit(['a', 'a'], { type: 'hola' });
    expect(a1.sent).toEqual(['{"type":"hola"}']);
    expect(a2.sent).toHaveLength(1);
    expect(closed.sent).toHaveLength(0);
    expect(b.sent).toHaveLength(0);
  });

  it('limita las conexiones por usuario', () => {
    const rt = new RealtimeService();
    for (let i = 0; i < MAX_CONNECTIONS_PER_USER; i++)
      expect(rt.add('a', fakeConn().conn)).toBe(true);
    expect(rt.add('a', fakeConn().conn)).toBe(false);
  });

  it('pasa los mensajes del navegador al módulo que los atiende', async () => {
    const rt = new RealtimeService();
    const seen: string[] = [];
    rt.on('typing', (userId, p) => {
      seen.push(`${userId}:${String(p.conversationId)}`);
    });
    await rt.dispatch('u1', { type: 'typing', conversationId: 'c1' });
    await rt.dispatch('u1', { type: 'desconocido' });
    expect(seen).toEqual(['u1:c1']);
  });
});
