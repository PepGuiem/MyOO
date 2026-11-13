/** Estado de cada comprobación del monitor (y del conjunto: la peor). */
export type Level = 'ok' | 'warning' | 'critical';

export interface Check {
  key: string;
  label: string;
  level: Level;
  detail: string;
}

export interface CheckInput {
  dbOk: boolean;
  dbPingMs: number | null;
  /** Peticiones y errores 5xx de los últimos 15 minutos. */
  requests15: number;
  s5xx15: number;
  p95Ms15: number | null;
  lagP99Ms: number;
  heapUsedMb: number;
  heapLimitMb: number;
  openReports: number;
}

/** Umbrales (cambiarlos aquí). */
export const THRESHOLDS = {
  dbPingWarnMs: 250,
  errorRateWarn: 0.02,
  errorRateCritical: 0.1,
  /** Con menos peticiones que esto la tasa de error no dice nada. */
  minRequestsForRate: 20,
  p95WarnMs: 1500,
  p95CriticalMs: 4000,
  lagWarnMs: 200,
  lagCriticalMs: 1000,
  heapWarn: 0.85,
  heapCritical: 0.95,
  openReportsWarn: 10,
} as const;

const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)} %`;

export function evaluateChecks(i: CheckInput): {
  level: Level;
  checks: Check[];
} {
  const t = THRESHOLDS;
  const checks: Check[] = [];

  checks.push(
    !i.dbOk
      ? {
          key: 'database',
          label: 'Base de datos',
          level: 'critical',
          detail: 'No responde',
        }
      : i.dbPingMs !== null && i.dbPingMs > t.dbPingWarnMs
        ? {
            key: 'database',
            label: 'Base de datos',
            level: 'warning',
            detail: `Lenta: ${Math.round(i.dbPingMs)} ms`,
          }
        : {
            key: 'database',
            label: 'Base de datos',
            level: 'ok',
            detail: `Responde en ${Math.round(i.dbPingMs ?? 0)} ms`,
          },
  );

  if (i.requests15 < t.minRequestsForRate) {
    checks.push({
      key: 'errors',
      label: 'Errores del servidor',
      level: i.s5xx15 >= 3 ? 'warning' : 'ok',
      detail: i.s5xx15
        ? `${i.s5xx15} en 15 min (poco tráfico)`
        : 'Ninguno en 15 min',
    });
  } else {
    const rate = i.s5xx15 / i.requests15;
    checks.push({
      key: 'errors',
      label: 'Errores del servidor',
      level:
        rate >= t.errorRateCritical
          ? 'critical'
          : rate >= t.errorRateWarn
            ? 'warning'
            : 'ok',
      detail: `${pct(rate)} de las peticiones en 15 min`,
    });
  }

  const p95 = i.p95Ms15;
  checks.push({
    key: 'latency',
    label: 'Tiempo de respuesta',
    level:
      p95 === null
        ? 'ok'
        : p95 >= t.p95CriticalMs
          ? 'critical'
          : p95 >= t.p95WarnMs
            ? 'warning'
            : 'ok',
    detail:
      p95 === null
        ? 'Sin peticiones en 15 min'
        : `p95 de ${Math.round(p95)} ms en 15 min`,
  });

  checks.push({
    key: 'eventloop',
    label: 'Bucle de eventos',
    level:
      i.lagP99Ms >= t.lagCriticalMs
        ? 'critical'
        : i.lagP99Ms >= t.lagWarnMs
          ? 'warning'
          : 'ok',
    detail: `Retardo p99 de ${Math.round(i.lagP99Ms)} ms`,
  });

  const heap = i.heapLimitMb ? i.heapUsedMb / i.heapLimitMb : 0;
  checks.push({
    key: 'memory',
    label: 'Memoria',
    level:
      heap >= t.heapCritical
        ? 'critical'
        : heap >= t.heapWarn
          ? 'warning'
          : 'ok',
    detail: `${pct(heap)} del máximo de Node`,
  });

  checks.push({
    key: 'moderation',
    label: 'Moderación',
    level: i.openReports >= t.openReportsWarn ? 'warning' : 'ok',
    detail:
      i.openReports === 0
        ? 'Sin denuncias pendientes'
        : `${i.openReports} ${i.openReports === 1 ? 'denuncia pendiente' : 'denuncias pendientes'}`,
  });

  const order: Level[] = ['ok', 'warning', 'critical'];
  const level = checks.reduce<Level>(
    (worst, c) =>
      order.indexOf(c.level) > order.indexOf(worst) ? c.level : worst,
    'ok',
  );
  return { level, checks };
}
