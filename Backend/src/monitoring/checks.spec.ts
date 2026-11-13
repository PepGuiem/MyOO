import { evaluateChecks, type CheckInput } from './checks';

const base: CheckInput = {
  dbOk: true,
  dbPingMs: 3,
  requests15: 500,
  s5xx15: 0,
  p95Ms15: 80,
  lagP99Ms: 15,
  heapUsedMb: 100,
  heapLimitMb: 2000,
  openReports: 0,
};

const level = (i: Partial<CheckInput>, key: string) =>
  evaluateChecks({ ...base, ...i }).checks.find((c) => c.key === key)!.level;

describe('evaluateChecks', () => {
  it('todo bien', () => {
    expect(evaluateChecks(base).level).toBe('ok');
  });

  it('la base de datos caída es crítica (y manda en el total)', () => {
    const r = evaluateChecks({ ...base, dbOk: false, dbPingMs: null });
    expect(r.level).toBe('critical');
    expect(r.checks[0]).toMatchObject({
      key: 'database',
      level: 'critical',
      detail: 'No responde',
    });
  });

  it('errores: por tasa con tráfico, por número sin tráfico', () => {
    expect(level({ s5xx15: 15 }, 'errors')).toBe('warning'); // 3 %
    expect(level({ s5xx15: 60 }, 'errors')).toBe('critical'); // 12 %
    expect(level({ requests15: 10, s5xx15: 2 }, 'errors')).toBe('ok');
    expect(level({ requests15: 10, s5xx15: 3 }, 'errors')).toBe('warning');
  });

  it('latencia, bucle de eventos, memoria y moderación', () => {
    expect(level({ p95Ms15: 2000 }, 'latency')).toBe('warning');
    expect(level({ p95Ms15: null }, 'latency')).toBe('ok');
    expect(level({ lagP99Ms: 1500 }, 'eventloop')).toBe('critical');
    expect(level({ heapUsedMb: 1800 }, 'memory')).toBe('warning');
    expect(level({ openReports: 12 }, 'moderation')).toBe('warning');
    expect(evaluateChecks({ ...base, openReports: 12 }).level).toBe('warning');
  });
});
