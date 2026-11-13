import { emptyHistogram, MinuteRing, observe, percentile } from './metrics';
import { MetricsService, UNMATCHED_ROUTE } from './metrics.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
const realtime = {
  stats: () => ({
    users: 2,
    connections: 3,
    pendingTickets: 0,
    eventsSent: 0,
    eventsReceived: 0,
  }),
} as any;
const T0 = Date.parse('2026-11-12T10:00:00Z');

describe('histograma de latencia', () => {
  it('sin datos no hay percentil', () => {
    expect(percentile(emptyHistogram(), 0.95)).toBeNull();
  });

  it('el percentil cae en la cubeta correcta', () => {
    const h = emptyHistogram();
    for (let i = 0; i < 90; i++) observe(h, 8); // cubeta 5–10
    for (let i = 0; i < 10; i++) observe(h, 900); // cubeta 750–1000
    const p50 = percentile(h, 0.5)!;
    const p95 = percentile(h, 0.95)!;
    expect(p50).toBeGreaterThan(5);
    expect(p50).toBeLessThanOrEqual(10);
    expect(p95).toBeGreaterThan(750);
    expect(p95).toBeLessThanOrEqual(1000);
  });

  it('más de 5 s devuelve el límite inferior de la última cubeta', () => {
    const h = emptyHistogram();
    observe(h, 60_000);
    expect(percentile(h, 0.99)).toBe(5000);
  });
});

describe('MinuteRing', () => {
  it('guarda por minuto y olvida lo de hace más de su tamaño', () => {
    const ring = new MinuteRing<{ n: number }>(5, () => ({ n: 0 }));
    ring.at(T0).n++;
    ring.at(T0 + 30_000).n++; // mismo minuto
    ring.at(T0 + 60_000).n++;
    expect(ring.range(T0 + 60_000, 3).map((c) => c.value?.n ?? 0)).toEqual([
      0, 2, 1,
    ]);
    // 5 minutos después el hueco se reutiliza y lo viejo desaparece.
    ring.at(T0 + 5 * 60_000).n += 7;
    expect(ring.peek(MinuteRing.minuteOf(T0))).toBeUndefined();
    expect(ring.peek(MinuteRing.minuteOf(T0 + 5 * 60_000))?.n).toBe(7);
  });
});

describe('MetricsService', () => {
  function svc() {
    return new MetricsService(realtime);
  }

  it('cuenta peticiones, códigos y latencia por minuto', () => {
    const m = svc();
    m.record('GET', '/api/ideas', 200, 12, null, T0);
    m.record('GET', '/api/ideas', 200, 20, null, T0 + 1000);
    m.record('POST', '/api/ideas', 400, 5, null, T0 + 2000);
    m.record('GET', '/api/ideas/:id', 500, 30, 'TypeError', T0 + 61_000);
    const s = m.summary(60, T0 + 61_000);
    expect(s).toMatchObject({
      requests: 4,
      s2xx: 2,
      s4xx: 1,
      s5xx: 1,
      errorRate: 0.25,
    });
    const series = m.trafficSeries('1h', T0 + 61_000);
    expect(series.points).toHaveLength(60);
    expect(series.points.slice(-2).map((p) => p.requests)).toEqual([3, 1]);
    expect(series.points[59].s5xx).toBe(1);
  });

  it('agrupa en puntos de 5 minutos para 6 h', () => {
    const m = svc();
    for (let i = 0; i < 5; i++)
      m.record('GET', '/api/x', 200, 10, null, T0 + i * 60_000);
    const s = m.trafficSeries('6h', T0 + 4 * 60_000);
    expect(s.step).toBe(5);
    expect(s.points).toHaveLength(72);
    expect(s.points.reduce((a, p) => a + p.requests, 0)).toBe(5);
  });

  it('no cuenta el propio monitor; las rutas desconocidas van juntas', () => {
    const m = svc();
    m.record('GET', '/api/admin/monitor/live', 200, 5, null, T0);
    m.record('GET', null, 404, 2, null, T0);
    m.record('GET', null, 404, 2, null, T0);
    expect(m.summary(5, T0).requests).toBe(2);
    expect(m.topRoutes(10, T0)).toEqual([
      expect.objectContaining({
        method: 'GET',
        route: UNMATCHED_ROUTE,
        requests: 2,
        s4xx: 2,
      }),
    ]);
  });

  it('rutas de la última hora ordenadas por uso', () => {
    const m = svc();
    m.record('GET', '/api/a', 200, 5, null, T0);
    m.record('GET', '/api/b', 200, 5, null, T0);
    m.record('GET', '/api/b', 500, 5, 'Error', T0);
    expect(m.topRoutes(10, T0).map((r) => r.route)).toEqual([
      '/api/b',
      '/api/a',
    ]);
    // Pasada una hora ya no salen.
    expect(m.topRoutes(10, T0 + 61 * 60_000)).toEqual([]);
  });

  it('guarda los últimos 5xx (sin la URL real ni mensajes)', () => {
    const m = svc();
    m.record('GET', '/api/x', 404, 3, null, T0);
    m.record(
      'POST',
      '/api/outfits',
      503,
      40.6,
      'PrismaClientInitializationError',
      T0,
    );
    const errs = m.recentErrors();
    expect(errs).toEqual([
      {
        at: new Date(T0).toISOString(),
        method: 'POST',
        route: '/api/outfits',
        status: 503,
        error: 'PrismaClientInitializationError',
        ms: 41,
      },
    ]);
  });

  it('describe el proceso', () => {
    const p = svc().process();
    expect(p.node).toBe(process.version);
    expect(p.rssMb).toBeGreaterThan(0);
    expect(p.heapLimitMb).toBeGreaterThan(p.heapUsedMb);
  });
});
