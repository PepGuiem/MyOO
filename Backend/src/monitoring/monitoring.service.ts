import { Injectable } from '@nestjs/common';
import { Prisma, ReportStatus } from '@prisma/client';
import { notBannedWhere } from '../common/ban';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { toBrief, userBriefSelect } from '../social/user-brief';
import { dayKey, REPORT_TZ } from './activity.service';
import { evaluateChecks } from './checks';
import { type RangeKey } from './metrics';
import { MetricsService } from './metrics.service';

/**
 * Series diarias del monitor. Tabla y columna salen de esta lista cerrada
 * (nunca de la petición), así que se pueden poner en el SQL sin riesgo.
 */
const DAILY = {
  signups: { table: 'User', label: 'Altas' },
  outfits: { table: 'Outfit', label: 'Outfits creados' },
  items: { table: 'WardrobeItem', label: 'Prendas añadidas' },
  messages: { table: 'Message', label: 'Mensajes' },
  ideas: { table: 'Idea', label: 'Ideas' },
  reports: { table: 'Report', label: 'Denuncias' },
} as const;
type DailyKey = keyof typeof DAILY;

/** Las fechas (AAAA-MM-DD) de los últimos `days` días, del más antiguo a hoy. */
export function lastDays(days: number, now = new Date()): string[] {
  const today = dayKey(now);
  const base = Date.parse(`${today}T12:00:00Z`);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--)
    out.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

/** "2026-11-12 08:30:00" en UTC: así se guardan las fechas de Prisma (timestamp sin zona). */
export function utcStamp(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Lo que cambia cada pocos segundos: estado, tráfico, proceso y tiempo real. */
  async live(range: RangeKey) {
    const [db, openReports] = await Promise.all([
      this.ping(),
      this.prisma.report
        .count({ where: { status: ReportStatus.OPEN } })
        .catch(() => 0),
    ]);
    const proc = this.metrics.process();
    const last15 = this.metrics.summary(15);
    const status = evaluateChecks({
      dbOk: db.ok,
      dbPingMs: db.ms,
      requests15: last15.requests,
      s5xx15: last15.s5xx,
      p95Ms15: last15.p95,
      lagP99Ms: proc.lagP99Ms,
      heapUsedMb: proc.heapUsedMb,
      heapLimitMb: proc.heapLimitMb,
      openReports,
    });
    return {
      now: new Date().toISOString(),
      range,
      status,
      process: proc,
      database: db,
      realtime: this.realtime.stats(),
      summary: {
        last5: this.metrics.summary(5),
        last60: this.metrics.summary(60),
      },
      traffic: this.metrics.trafficSeries(range),
      system: this.metrics.systemSeries(range),
      routes: this.metrics.topRoutes(15),
      errors: this.metrics.recentErrors(20),
    };
  }

  /** Base de datos: versión, tamaño, conexiones y tablas más grandes. */
  async database() {
    const ping = await this.ping();
    if (!ping.ok)
      return {
        ...ping,
        version: null,
        sizeBytes: null,
        connections: null,
        tables: [],
      };
    const [version, size, conns, tables] = await Promise.all([
      this.prisma.$queryRaw<{ server_version: string }[]>`SHOW server_version`,
      this.prisma.$queryRaw<
        { size: bigint }[]
      >`SELECT pg_database_size(current_database()) AS size`,
      this.prisma.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database()`,
      this.prisma.$queryRaw<{ name: string; rows: bigint; bytes: bigint }[]>`
        SELECT relname AS name, n_live_tup AS rows, pg_total_relation_size(relid) AS bytes
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 20`,
    ]);
    return {
      ...ping,
      version: version[0]?.server_version ?? null,
      sizeBytes: Number(size[0]?.size ?? 0),
      connections: Number(conns[0]?.n ?? 0),
      tables: tables.map((t) => ({
        name: t.name,
        rows: Number(t.rows),
        bytes: Number(t.bytes),
      })),
    };
  }

  /** Uso de la app: totales, activos y series diarias. */
  async activity(days: number, now = new Date()) {
    const keys = lastDays(days, now);
    const since = new Date(Date.parse(`${keys[0]}T00:00:00Z`) - 86_400_000);
    const [series, active, totals] = await Promise.all([
      Promise.all(
        (Object.keys(DAILY) as DailyKey[]).map(
          async (k) => [k, await this.daily(DAILY[k].table, since)] as const,
        ),
      ),
      this.activeUsers(keys, now),
      this.totals(),
    ]);
    const daily: Record<
      string,
      { label: string; total: number; points: { day: string; value: number }[] }
    > = {};
    daily.active = {
      label: 'Activos',
      total: 0,
      points: keys.map((d) => ({ day: d, value: active.byDay.get(d) ?? 0 })),
    };
    for (const [k, map] of series) {
      const points = keys.map((d) => ({ day: d, value: map.get(d) ?? 0 }));
      daily[k] = {
        label: DAILY[k].label,
        total: points.reduce((a, p) => a + p.value, 0),
        points,
      };
    }
    daily.active.total = active.inRange;
    return {
      days,
      tz: REPORT_TZ,
      active: {
        dau: active.dau,
        wau: active.wau,
        mau: active.mau,
        online: this.realtime.stats().users,
      },
      totals,
      daily,
    };
  }

  /** Lo último que ha pasado (altas, denuncias, ideas, novedades y acciones de admin). */
  async feed(limit = 30) {
    const take = 12;
    const [users, reports, ideas, releases, actions] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        select: { ...userBriefSelect, createdAt: true },
      }),
      this.prisma.report.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, targetType: true, reason: true, createdAt: true },
      }),
      this.prisma.idea.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          title: true,
          createdAt: true,
          author: { select: userBriefSelect },
        },
      }),
      this.prisma.release.findMany({
        where: { publishedAt: { not: null } },
        orderBy: { publishedAt: 'desc' },
        take: 5,
        select: { id: true, title: true, publishedAt: true },
      }),
      this.prisma.adminAction.findMany({
        orderBy: { createdAt: 'desc' },
        take,
        select: { id: true, action: true, createdAt: true, adminId: true },
      }),
    ]);
    const adminIds = [
      ...new Set(actions.map((a) => a.adminId).filter((x): x is string => !!x)),
    ];
    const admins = adminIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: userBriefSelect,
        })
      : [];
    const adminById = new Map(admins.map((a) => [a.id, toBrief(a)]));
    type Item = {
      id: string;
      kind: 'signup' | 'report' | 'idea' | 'release' | 'admin';
      at: Date;
      title: string;
      user: ReturnType<typeof toBrief> | null;
      meta?: string;
    };
    const items: Item[] = [
      ...users.map((u): Item => ({
        id: `u-${u.id}`,
        kind: 'signup',
        at: u.createdAt,
        title: 'Nueva cuenta',
        user: toBrief(u),
      })),
      ...reports.map((r): Item => ({
        id: `r-${r.id}`,
        kind: 'report',
        at: r.createdAt,
        title: 'Nueva denuncia',
        user: null,
        meta: `${r.targetType}:${r.reason}`,
      })),
      ...ideas.map((i): Item => ({
        id: `i-${i.id}`,
        kind: 'idea',
        at: i.createdAt,
        title: i.title,
        user: i.author ? toBrief(i.author) : null,
        meta: i.id,
      })),
      ...releases.map((r): Item => ({
        id: `n-${r.id}`,
        kind: 'release',
        at: r.publishedAt!,
        title: r.title,
        user: null,
      })),
      ...actions.map((a): Item => ({
        id: `a-${a.id}`,
        kind: 'admin',
        at: a.createdAt,
        title: a.action,
        user: a.adminId ? (adminById.get(a.adminId) ?? null) : null,
      })),
    ];
    return items
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit)
      .map((i) => ({ ...i, at: i.at.toISOString() }));
  }

  // --------------------------------------------------------------- ayudas

  private async ping(): Promise<{ ok: boolean; ms: number | null }> {
    const start = process.hrtime.bigint();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        ok: true,
        ms:
          Math.round((Number(process.hrtime.bigint() - start) / 1e6) * 10) / 10,
      };
    } catch {
      return { ok: false, ms: null };
    }
  }

  /** Cuántas filas se crearon cada día (en la zona horaria del informe). */
  private async daily(
    table: string,
    since: Date,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ day: string; n: number }[]>`
      SELECT to_char((t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${REPORT_TZ}, 'YYYY-MM-DD') AS day, count(*)::int AS n
      FROM ${Prisma.raw(`"${table}"`)} t
      WHERE t."createdAt" >= ${utcStamp(since)}::timestamp
      GROUP BY 1`;
    return new Map(rows.map((r) => [r.day, Number(r.n)]));
  }

  private async activeUsers(keys: string[], now: Date) {
    const today = dayKey(now);
    // Fechas como texto AAAA-MM-DD y ::date en el SQL: sin conversiones de zona horaria.
    const back = (n: number) =>
      new Date(Date.parse(`${today}T12:00:00Z`) - n * 86_400_000)
        .toISOString()
        .slice(0, 10);
    const first = keys[0];
    const [byDayRows, dau, wau, mau, inRange] = await Promise.all([
      this.prisma.$queryRaw<{ day: string; n: number }[]>`
        SELECT to_char(day, 'YYYY-MM-DD') AS day, count(*)::int AS n FROM "DailyActive" WHERE day >= ${first}::date GROUP BY 1`,
      this.distinctActive(back(0)),
      this.distinctActive(back(6)),
      this.distinctActive(back(29)),
      this.distinctActive(first),
    ]);
    return {
      byDay: new Map(byDayRows.map((r) => [r.day, Number(r.n)])),
      dau,
      wau,
      mau,
      inRange,
    };
  }

  private async distinctActive(since: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<
      { n: number }[]
    >`SELECT count(DISTINCT "userId")::int AS n FROM "DailyActive" WHERE day >= ${since}::date`;
    return Number(rows[0]?.n ?? 0);
  }

  private async totals() {
    const now = new Date();
    const [
      users,
      banned,
      wardrobes,
      items,
      outfits,
      sharedOutfits,
      conversations,
      messages,
      follows,
      ideas,
      openReports,
      assets,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { NOT: notBannedWhere(now) } }),
      this.prisma.wardrobe.count(),
      this.prisma.wardrobeItem.count(),
      this.prisma.outfit.count(),
      this.prisma.outfit.count({
        where: { isShared: true, hiddenByAdmin: false },
      }),
      this.prisma.conversation.count(),
      this.prisma.message.count({ where: { deletedAt: null } }),
      this.prisma.follow.count({ where: { status: 'ACCEPTED' } }),
      this.prisma.idea.count(),
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.asset.aggregate({
        _count: { _all: true },
        _sum: { sizeBytes: true },
      }),
    ]);
    return {
      users,
      banned,
      wardrobes,
      items,
      outfits,
      sharedOutfits,
      conversations,
      messages,
      follows,
      ideas,
      openReports,
      assets: assets._count._all,
      assetBytes: assets._sum.sizeBytes ?? 0,
    };
  }
}
