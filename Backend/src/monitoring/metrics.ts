/**
 * Piezas puras (sin Nest ni base de datos) de las métricas del monitor:
 * histogramas de latencia y un "anillo" de cubetas por minuto que guarda las
 * últimas 24 horas en memoria con un tamaño fijo.
 */

/** Límites superiores (ms) de las cubetas del histograma de latencia. */
export const LATENCY_BOUNDS = [
  5,
  10,
  25,
  50,
  100,
  200,
  350,
  500,
  750,
  1000,
  2000,
  5000,
  Infinity,
] as const;

export function emptyHistogram(): number[] {
  return LATENCY_BOUNDS.map(() => 0);
}

export function observe(hist: number[], ms: number): void {
  const i = LATENCY_BOUNDS.findIndex((b) => ms <= b);
  hist[i === -1 ? hist.length - 1 : i]++;
}

export function mergeInto(target: number[], source: number[]): void {
  for (let i = 0; i < target.length; i++) target[i] += source[i] ?? 0;
}

/**
 * Percentil aproximado (0–1) a partir del histograma, interpolando dentro de
 * la cubeta. La última cubeta (más de 5 s) devuelve su límite inferior.
 */
export function percentile(hist: number[], q: number): number | null {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const target = Math.max(1, Math.ceil(q * total));
  let seen = 0;
  for (let i = 0; i < hist.length; i++) {
    if (hist[i] === 0) continue;
    if (seen + hist[i] >= target) {
      const lo = i === 0 ? 0 : LATENCY_BOUNDS[i - 1];
      const hi = LATENCY_BOUNDS[i];
      if (!Number.isFinite(hi)) return lo;
      const frac = (target - seen) / hist[i];
      return Math.round((lo + (hi - lo) * frac) * 10) / 10;
    }
    seen += hist[i];
  }
  return null;
}

/**
 * Cubetas de un minuto en un array circular. Cada hueco recuerda de qué
 * minuto es: si al leerlo no coincide, es que está vacío (de hace un día).
 */
export class MinuteRing<T> {
  private readonly stamps: number[];
  private readonly slots: (T | undefined)[];

  constructor(
    readonly size: number,
    private readonly create: () => T,
  ) {
    this.stamps = new Array<number>(size).fill(-1);
    this.slots = new Array<T | undefined>(size);
  }

  static minuteOf(ts: number): number {
    return Math.floor(ts / 60_000);
  }

  /** La cubeta del minuto de `ts` (se crea si no existe). */
  at(ts: number): T {
    const m = MinuteRing.minuteOf(ts);
    const i = m % this.size;
    if (this.stamps[i] !== m || this.slots[i] === undefined) {
      this.stamps[i] = m;
      this.slots[i] = this.create();
    }
    return this.slots[i] as T;
  }

  /** La cubeta de ese minuto si existe (sin crearla). */
  peek(minute: number): T | undefined {
    const i = ((minute % this.size) + this.size) % this.size;
    return this.stamps[i] === minute ? this.slots[i] : undefined;
  }

  /** Los últimos `minutes` minutos hasta `now` incluido, del más antiguo al más nuevo. */
  range(
    now: number,
    minutes: number,
  ): { minute: number; value: T | undefined }[] {
    const last = MinuteRing.minuteOf(now);
    const n = Math.min(minutes, this.size);
    const out: { minute: number; value: T | undefined }[] = [];
    for (let m = last - n + 1; m <= last; m++)
      out.push({ minute: m, value: this.peek(m) });
    return out;
  }
}

/** Lo que se guarda de las peticiones HTTP de un minuto. */
export interface TrafficBucket {
  requests: number;
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
  latency: number[];
}

export function emptyTraffic(): TrafficBucket {
  return {
    requests: 0,
    s2xx: 0,
    s3xx: 0,
    s4xx: 0,
    s5xx: 0,
    latency: emptyHistogram(),
  };
}

export function addRequest(b: TrafficBucket, status: number, ms: number): void {
  b.requests++;
  if (status >= 500) b.s5xx++;
  else if (status >= 400) b.s4xx++;
  else if (status >= 300) b.s3xx++;
  else b.s2xx++;
  observe(b.latency, ms);
}

/** Suma varias cubetas en una. */
export function sumTraffic(
  buckets: (TrafficBucket | undefined)[],
): TrafficBucket {
  const acc = emptyTraffic();
  for (const b of buckets) {
    if (!b) continue;
    acc.requests += b.requests;
    acc.s2xx += b.s2xx;
    acc.s3xx += b.s3xx;
    acc.s4xx += b.s4xx;
    acc.s5xx += b.s5xx;
    mergeInto(acc.latency, b.latency);
  }
  return acc;
}

/** Muestra del proceso guardada por minuto (la última del minuto y el pico de retardo). */
export interface SystemSample {
  rssMb: number;
  heapUsedMb: number;
  cpuPct: number;
  lagP99Ms: number;
  wsConnections: number;
}

/** Intervalos que se pueden pedir: minutos totales y tamaño de cada punto. */
export const RANGES = {
  '1h': { minutes: 60, step: 1 },
  '6h': { minutes: 360, step: 5 },
  '24h': { minutes: 1440, step: 15 },
} as const;
export type RangeKey = keyof typeof RANGES;
