import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { outfitSelect } from '../outfits/outfits.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  addDays,
  computeStats,
  dayKey,
  diffDays,
  findRepeats,
  parseDay,
  RepeatFlag,
  SeasonKey,
  suggestOutfits,
} from './calendar.rules';
import {
  CreateCalendarEntryDto,
  UpdateCalendarEntryDto,
} from './dto/calendar.dto';

/** Máximo de días que se piden de una vez (6 semanas de la vista mensual + margen). */
const MAX_RANGE_DAYS = 62;
/** Outfits como máximo en un mismo día. */
export const MAX_ENTRIES_PER_DAY = 4;
/** Hasta dónde se puede planificar (atrás y adelante). */
const MAX_YEARS = 3;
/** Margen alrededor del rango pedido para detectar repeticiones. */
const REPEAT_MARGIN = 30;

const entrySelect = {
  id: true,
  date: true,
  note: true,
  eventName: true,
  eventKind: true,
  wornAt: true,
  createdAt: true,
  outfitId: true,
  outfit: { select: outfitSelect },
} satisfies Prisma.CalendarEntrySelect;

type EntryRow = Prisma.CalendarEntryGetPayload<{ select: typeof entrySelect }>;

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  /** Comprueba «YYYY-MM-DD», que exista y que esté dentro de lo planificable. */
  private day(s: string, field = 'date'): Date {
    const d = parseDay(s);
    if (!d) throw new BadRequestException(`${field} is not a valid day`);
    const years = Math.abs(diffDays(dayKey(new Date()), s)) / 365;
    if (years > MAX_YEARS)
      throw new BadRequestException(`${field} is too far from today`);
    return d;
  }

  /**
   * Solo se puede marcar como usado un día que ya ha llegado. El servidor no
   * sabe tu zona horaria: se admite hasta «mañana» en UTC.
   */
  private assertWearable(date: string) {
    if (diffDays(dayKey(new Date()), date) > 1) {
      throw new BadRequestException('You cannot mark a future day as worn');
    }
  }

  private async assertOutfit(userId: string, outfitId: string) {
    const n = await this.prisma.outfit.count({
      where: { id: outfitId, userId },
    });
    if (!n) throw new BadRequestException('Outfit not found');
  }

  private async assertRoom(userId: string, date: Date, exceptId?: string) {
    const n = await this.prisma.calendarEntry.count({
      where: { userId, date, id: exceptId ? { not: exceptId } : undefined },
    });
    if (n >= MAX_ENTRIES_PER_DAY) {
      throw new BadRequestException(
        `A day can have at most ${MAX_ENTRIES_PER_DAY} outfits`,
      );
    }
  }

  private view(row: EntryRow, repeat: RepeatFlag | null) {
    return {
      id: row.id,
      date: dayKey(row.date),
      note: row.note,
      eventName: row.eventName,
      eventKind: row.eventKind,
      worn: row.wornAt !== null,
      wornAt: row.wornAt,
      createdAt: row.createdAt,
      outfit: row.outfit,
      repeat,
    };
  }

  /** Repeticiones de unas filas mirando también los días de alrededor. */
  private async repeatsFor(
    userId: string,
    from: string,
    to: string,
    outfitIds: string[],
  ) {
    if (!outfitIds.length) return new Map<string, RepeatFlag>();
    const uses = await this.prisma.calendarEntry.findMany({
      where: {
        userId,
        outfitId: { in: [...new Set(outfitIds)] },
        date: {
          gte: parseDay(addDays(from, -REPEAT_MARGIN))!,
          lte: parseDay(addDays(to, REPEAT_MARGIN))!,
        },
      },
      select: { id: true, outfitId: true, date: true },
    });
    return findRepeats(
      uses.map((u) => ({
        id: u.id,
        outfitId: u.outfitId,
        date: dayKey(u.date),
      })),
    );
  }

  /** Días entre `from` y `to` (incluidos), con el outfit completo para la vista previa. */
  async list(userId: string, from: string, to: string) {
    const a = this.day(from, 'from');
    const b = this.day(to, 'to');
    const span = diffDays(from, to);
    if (span < 0) throw new BadRequestException('from must be before to');
    if (span > MAX_RANGE_DAYS)
      throw new BadRequestException(`At most ${MAX_RANGE_DAYS} days at once`);
    const rows = await this.prisma.calendarEntry.findMany({
      where: { userId, date: { gte: a, lte: b } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: entrySelect,
    });
    const repeats = await this.repeatsFor(
      userId,
      from,
      to,
      rows.map((r) => r.outfitId),
    );
    return rows.map((r) => this.view(r, repeats.get(r.id) ?? null));
  }

  private async one(userId: string, id: string) {
    const row = await this.prisma.calendarEntry.findFirst({
      where: { id, userId },
      select: entrySelect,
    });
    if (!row) throw new NotFoundException('Calendar entry not found');
    const key = dayKey(row.date);
    const repeats = await this.repeatsFor(userId, key, key, [row.outfitId]);
    return this.view(row, repeats.get(row.id) ?? null);
  }

  async create(userId: string, dto: CreateCalendarEntryDto) {
    const date = this.day(dto.date);
    if (dto.worn) this.assertWearable(dto.date);
    await this.assertOutfit(userId, dto.outfitId);
    await this.assertRoom(userId, date);
    const row = await this.prisma.calendarEntry.create({
      data: {
        userId,
        outfitId: dto.outfitId,
        date,
        note: dto.note ?? null,
        eventName: dto.eventName ?? null,
        eventKind: dto.eventKind ?? null,
        wornAt: dto.worn ? new Date() : null,
      },
      select: { id: true },
    });
    return this.one(userId, row.id);
  }

  async update(userId: string, id: string, dto: UpdateCalendarEntryDto) {
    const existing = await this.prisma.calendarEntry.findFirst({
      where: { id, userId },
      select: { date: true, wornAt: true },
    });
    if (!existing) throw new NotFoundException('Calendar entry not found');
    const date = dto.date !== undefined ? this.day(dto.date) : undefined;
    const finalKey = dto.date ?? dayKey(existing.date);
    if (dto.worn === true) this.assertWearable(finalKey);
    if (dto.outfitId) await this.assertOutfit(userId, dto.outfitId);
    if (date && dayKey(date) !== dayKey(existing.date))
      await this.assertRoom(userId, date, id);
    // Al pasarlo a un día futuro deja de estar «usado».
    const movedToFuture =
      dto.date !== undefined && diffDays(dayKey(new Date()), dto.date) > 1;
    await this.prisma.calendarEntry.update({
      where: { id },
      data: {
        date,
        outfitId: dto.outfitId,
        note: dto.note,
        eventName: dto.eventName,
        eventKind: dto.eventKind,
        wornAt:
          dto.worn === true
            ? (existing.wornAt ?? new Date())
            : dto.worn === false || movedToFuture
              ? null
              : undefined,
      },
    });
    return this.one(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.calendarEntry.deleteMany({
      where: { id, userId },
    });
    if (!count) throw new NotFoundException('Calendar entry not found');
  }

  /** Outfits recomendados para un día (los que no usas, con buena nota y de la estación). */
  async suggestions(userId: string, date: string, limit = 6) {
    this.day(date);
    const outfits = await this.prisma.outfit.findMany({
      where: { userId },
      select: { id: true, season: true, ratingScore: true, isFavorite: true },
      orderBy: { createdAt: 'desc' },
      take: 400,
    });
    if (!outfits.length) return [];
    const ids = outfits.map((o) => o.id);
    const [worn, near] = await Promise.all([
      this.prisma.calendarEntry.groupBy({
        by: ['outfitId'],
        where: { userId, outfitId: { in: ids }, wornAt: { not: null } },
        _max: { date: true },
        orderBy: { outfitId: 'asc' },
      }),
      this.prisma.calendarEntry.findMany({
        where: {
          userId,
          outfitId: { in: ids },
          date: {
            gte: parseDay(addDays(date, -14))!,
            lte: parseDay(addDays(date, 14))!,
          },
        },
        select: { outfitId: true, date: true },
      }),
    ]);
    const lastWorn = new Map(
      worn.map((w) => [w.outfitId, w._max?.date ? dayKey(w._max.date) : null]),
    );
    const planned = new Map<string, string[]>();
    for (const n of near)
      planned.set(n.outfitId, [
        ...(planned.get(n.outfitId) ?? []),
        dayKey(n.date),
      ]);
    const picks = suggestOutfits(
      outfits.map((o) => ({
        id: o.id,
        season: o.season as SeasonKey | null,
        ratingScore: o.ratingScore,
        isFavorite: o.isFavorite,
        lastWorn: lastWorn.get(o.id) ?? null,
        planned: planned.get(o.id) ?? [],
      })),
      date,
      limit,
    );
    const full = await this.prisma.outfit.findMany({
      where: { userId, id: { in: picks.map((p) => p.id) } },
      select: outfitSelect,
    });
    const byId = new Map(full.map((o) => [o.id, o]));
    return picks
      .filter((p) => byId.has(p.id))
      .map((p) => ({
        outfit: byId.get(p.id)!,
        reasons: p.reasons,
        lastWorn: lastWorn.get(p.id) ?? null,
      }));
  }

  /**
   * Panel lateral: estadísticas, avisos de repetición, lo próximo (7 días),
   * eventos (60 días) y outfits sin estrenar.
   */
  async insights(userId: string, today: string) {
    this.day(today, 'today');
    const [entries, outfits] = await Promise.all([
      this.prisma.calendarEntry.findMany({
        where: { userId },
        select: {
          id: true,
          outfitId: true,
          date: true,
          wornAt: true,
          outfit: { select: { style: true } },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.outfit.findMany({
        where: { userId },
        select: { id: true, name: true, style: true },
      }),
    ]);
    const stats = computeStats(
      entries.map((e) => ({
        outfitId: e.outfitId,
        date: dayKey(e.date),
        worn: e.wornAt !== null,
        style: e.outfit.style,
      })),
      outfits.map((o) => o.id),
      today,
    );
    const name = new Map(outfits.map((o) => [o.id, o]));

    // Repeticiones en el mes de alrededor de hoy.
    const near = entries.filter(
      (e) => Math.abs(diffDays(today, dayKey(e.date))) <= 30,
    );
    const flags = findRepeats(
      near.map((e) => ({
        id: e.id,
        outfitId: e.outfitId,
        date: dayKey(e.date),
      })),
    );
    const worst = new Map<
      string,
      {
        outfitId: string;
        name: string;
        text: string;
        level: 'warn' | 'high';
        dates: string[];
      }
    >();
    for (const e of near) {
      const f = flags.get(e.id);
      if (!f) continue;
      const cur = worst.get(e.outfitId);
      const dates = near
        .filter((x) => x.outfitId === e.outfitId)
        .map((x) => dayKey(x.date));
      if (!cur || (f.level === 'high' && cur.level !== 'high')) {
        worst.set(e.outfitId, {
          outfitId: e.outfitId,
          name: name.get(e.outfitId)?.name ?? '',
          text: f.text,
          level: f.level,
          dates,
        });
      }
    }

    const upcomingRows = await this.prisma.calendarEntry.findMany({
      where: {
        userId,
        OR: [
          {
            date: { gte: parseDay(today)!, lte: parseDay(addDays(today, 6))! },
          },
          {
            date: { gte: parseDay(today)!, lte: parseDay(addDays(today, 60))! },
            eventName: { not: null },
          },
        ],
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: entrySelect,
    });
    const upcoming = upcomingRows.map((r) => this.view(r, null));

    return {
      stats: {
        ...stats,
        topWorn: stats.topWorn.map((t) => ({
          ...t,
          name: name.get(t.outfitId)?.name ?? '',
          style: name.get(t.outfitId)?.style ?? null,
        })),
      },
      repeats: [...worst.values()],
      upcoming: upcoming.filter((u) => diffDays(today, u.date) <= 6),
      events: upcoming.filter((u) => u.eventName),
    };
  }
}
