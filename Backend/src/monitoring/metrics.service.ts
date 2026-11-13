import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { cpus } from 'node:os';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';
import { RealtimeService } from '../realtime/realtime.service';
import {
  addRequest,
  emptyTraffic,
  MinuteRing,
  percentile,
  RANGES,
  sumTraffic,
  type RangeKey,
  type SystemSample,
  type TrafficBucket,
} from './metrics';

/** Rutas que no se cuentan (el propio monitor se consulta cada pocos segundos). */
const IGNORED = /^\/api\/admin\/monitor\b/;
/** Ruta de las peticiones que no casan con ningún endpoint (404). */
export const UNMATCHED_ROUTE = '(sin ruta)';
const MAX_ROUTES = 300;
const MAX_ERRORS = 50;
const MB = 1024 * 1024;

export interface RecentError {
  at: string;
  method: string;
  route: string;
  status: number;
  /** Clase del error (p. ej. PrismaClientKnownRequestError). Nunca el mensaje ni datos. */
  error: string | null;
  ms: number;
}

/**
 * Métricas del proceso en memoria (se pierden al reiniciar):
 * - peticiones HTTP por minuto (24 h) y por ruta (última hora);
 * - últimos errores 5xx;
 * - memoria, CPU, retardo del event loop y conexiones WebSocket por minuto.
 *
 * Solo se guarda el PATRÓN de la ruta (`/api/ideas/:id`), nunca la URL real
 * (podría llevar tickets o datos), ni cuerpos, ni cabeceras, ni quién llama.
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  readonly startedAt = Date.now();
  private readonly traffic = new MinuteRing<TrafficBucket>(1440, emptyTraffic);
  private readonly routes = new Map<string, MinuteRing<TrafficBucket>>();
  private readonly errors: RecentError[] = [];
  private readonly system = new MinuteRing<SystemSample>(1440, () => ({
    rssMb: 0,
    heapUsedMb: 0,
    cpuPct: 0,
    lagP99Ms: 0,
    wsConnections: 0,
  }));
  private lag: IntervalHistogram | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastCpu = process.cpuUsage();
  private lastCpuAt = Date.now();
  private lastCpuPct = 0;
  private lastLagP99 = 0;

  constructor(private readonly realtime: RealtimeService) {}

  onModuleInit(): void {
    this.lag = monitorEventLoopDelay({ resolution: 20 });
    this.lag.enable();
    this.sample();
    // Una muestra del proceso cada 10 s; unref para no impedir que se cierre.
    this.timer = setInterval(() => this.sample(), 10_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.lag?.disable();
  }

  /** Lo llama el middleware al acabar cada respuesta. */
  record(
    method: string,
    route: string | null,
    status: number,
    ms: number,
    errorName?: string | null,
    now = Date.now(),
  ): void {
    const key = route ?? UNMATCHED_ROUTE;
    if (IGNORED.test(key)) return;
    addRequest(this.traffic.at(now), status, ms);

    const routeKey = `${method} ${key}`;
    let ring = this.routes.get(routeKey);
    if (!ring) {
      // Tope de rutas distintas por si algo genera claves raras.
      if (this.routes.size >= MAX_ROUTES)
        return this.recordError(method, key, status, ms, errorName, now);
      ring = new MinuteRing<TrafficBucket>(60, emptyTraffic);
      this.routes.set(routeKey, ring);
    }
    addRequest(ring.at(now), status, ms);
    this.recordError(method, key, status, ms, errorName, now);
  }

  private recordError(
    method: string,
    route: string,
    status: number,
    ms: number,
    errorName: string | null | undefined,
    now: number,
  ): void {
    if (status < 500) return;
    this.errors.unshift({
      at: new Date(now).toISOString(),
      method,
      route,
      status,
      error: errorName ?? null,
      ms: Math.round(ms),
    });
    if (this.errors.length > MAX_ERRORS) this.errors.length = MAX_ERRORS;
  }

  /** Serie de tráfico del intervalo, agrupada en puntos de `step` minutos. */
  trafficSeries(range: RangeKey, now = Date.now()) {
    const { minutes, step } = RANGES[range];
    const cells = this.traffic.range(now, minutes);
    const points: {
      t: string;
      requests: number;
      s4xx: number;
      s5xx: number;
      p50: number | null;
      p95: number | null;
    }[] = [];
    for (let i = 0; i < cells.length; i += step) {
      const chunk = cells.slice(i, i + step);
      const b = sumTraffic(chunk.map((c) => c.value));
      points.push({
        t: new Date(chunk[0].minute * 60_000).toISOString(),
        requests: b.requests,
        s4xx: b.s4xx,
        s5xx: b.s5xx,
        p50: percentile(b.latency, 0.5),
        p95: percentile(b.latency, 0.95),
      });
    }
    return { step, points };
  }

  /** Resumen de los últimos `minutes` minutos. */
  summary(minutes: number, now = Date.now()) {
    const b = sumTraffic(this.traffic.range(now, minutes).map((c) => c.value));
    return {
      requests: b.requests,
      perMinute: Math.round((b.requests / minutes) * 10) / 10,
      s2xx: b.s2xx,
      s3xx: b.s3xx,
      s4xx: b.s4xx,
      s5xx: b.s5xx,
      errorRate: b.requests ? b.s5xx / b.requests : 0,
      p50: percentile(b.latency, 0.5),
      p95: percentile(b.latency, 0.95),
      p99: percentile(b.latency, 0.99),
    };
  }

  /** Rutas de la última hora, de más a menos usadas. */
  topRoutes(limit = 15, now = Date.now()) {
    const out: {
      method: string;
      route: string;
      requests: number;
      s4xx: number;
      s5xx: number;
      p50: number | null;
      p95: number | null;
    }[] = [];
    for (const [key, ring] of this.routes) {
      const b = sumTraffic(ring.range(now, 60).map((c) => c.value));
      if (b.requests === 0) continue;
      const space = key.indexOf(' ');
      out.push({
        method: key.slice(0, space),
        route: key.slice(space + 1),
        requests: b.requests,
        s4xx: b.s4xx,
        s5xx: b.s5xx,
        p50: percentile(b.latency, 0.5),
        p95: percentile(b.latency, 0.95),
      });
    }
    return out
      .sort((a, b) => b.requests - a.requests || a.route.localeCompare(b.route))
      .slice(0, limit);
  }

  recentErrors(limit = 20): RecentError[] {
    return this.errors.slice(0, limit);
  }

  systemSeries(range: RangeKey, now = Date.now()) {
    const { minutes, step } = RANGES[range];
    const cells = this.system.range(now, minutes);
    const points: ({ t: string } & SystemSample)[] = [];
    for (let i = 0; i < cells.length; i += step) {
      const chunk = cells.slice(i, i + step);
      const vals = chunk
        .map((c) => c.value)
        .filter((v): v is SystemSample => !!v);
      const last = vals[vals.length - 1];
      points.push({
        t: new Date(chunk[0].minute * 60_000).toISOString(),
        rssMb: last?.rssMb ?? 0,
        heapUsedMb: last?.heapUsedMb ?? 0,
        // De la CPU y el retardo interesa el pico del punto.
        cpuPct: vals.length ? Math.max(...vals.map((v) => v.cpuPct)) : 0,
        lagP99Ms: vals.length ? Math.max(...vals.map((v) => v.lagP99Ms)) : 0,
        wsConnections: last?.wsConnections ?? 0,
      });
    }
    return { step, points, hasData: cells.some((c) => c.value) };
  }

  /** El proceso ahora mismo. */
  process() {
    const mem = process.memoryUsage();
    const heap = getHeapStatistics();
    return {
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
      startedAt: new Date(this.startedAt).toISOString(),
      node: process.version,
      platform: process.platform,
      env: process.env.NODE_ENV ?? 'development',
      version: process.env.npm_package_version ?? null,
      rssMb: round(mem.rss / MB),
      heapUsedMb: round(mem.heapUsed / MB),
      heapLimitMb: round(heap.heap_size_limit / MB),
      cpuPct: this.lastCpuPct,
      cpuCores: cpus().length,
      lagP99Ms: this.lastLagP99,
    };
  }

  private sample(now = Date.now()): void {
    const cpu = process.cpuUsage(this.lastCpu);
    const elapsedMs = Math.max(1, now - this.lastCpuAt);
    this.lastCpu = process.cpuUsage();
    this.lastCpuAt = now;
    // % de UN núcleo (100 % = un núcleo entero ocupado).
    this.lastCpuPct = round(((cpu.user + cpu.system) / 1000 / elapsedMs) * 100);
    if (this.lag) {
      this.lastLagP99 = round(this.lag.percentile(99) / 1e6);
      this.lag.reset();
    }
    const mem = process.memoryUsage();
    const s = this.system.at(now);
    s.rssMb = round(mem.rss / MB);
    s.heapUsedMb = round(mem.heapUsed / MB);
    s.cpuPct = Math.max(s.cpuPct, this.lastCpuPct);
    s.lagP99Ms = Math.max(s.lagP99Ms, this.lastLagP99);
    s.wsConnections = this.realtime.stats().connections;
  }
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
