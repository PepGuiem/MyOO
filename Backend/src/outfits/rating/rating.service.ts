import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OutfitStyle, Prisma, RatingTrigger, Season } from '@prisma/client';
import { createHash } from 'node:crypto';
import { garmentTypeSummarySelect } from '../../garment-types/garment-types.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Category, SeasonKey } from '../../stylist/engine';
import { STYLE_TAGS } from '../../stylist/vocabulary';
import { OutfitItemInputDto } from '../dto/outfit-item-input.dto';
import { validateStyling } from '../styling';
import {
  OUTFIT_RATING_ENGINE,
  RATING_CATEGORIES,
  RatingEngine,
  RatingInput,
  RatingItem,
  RatingResult,
} from './rating.types';

/** Lo que el motor necesita de cada prenda. */
const ratingItemSelect = {
  id: true,
  name: true,
  color: true,
  season: true,
  attributes: true,
  customization: true,
  styles: true,
  garmentType: { select: garmentTypeSummarySelect },
} satisfies Prisma.WardrobeItemSelect;

type RatingRow = Prisma.WardrobeItemGetPayload<{
  select: typeof ratingItemSelect;
}>;

/** Columnas del historial que se devuelven (sin la huella). */
const historySelect = {
  id: true,
  total: true,
  colors: true,
  style: true,
  balance: true,
  details: true,
  tier: true,
  engine: true,
  trigger: true,
  createdAt: true,
} satisfies Prisma.OutfitRatingSelect;

/** Máximo de prendas del armario que se prueban para los consejos. */
const POOL_LIMIT = 600;

export function toRatingItem(r: RatingRow, styling: unknown): RatingItem {
  const custom = (r.customization ?? {}) as {
    colors?: Record<string, unknown>;
    details?: unknown[];
    pattern?: { kind?: string };
    options?: { pattern?: string };
  };
  const legacy = custom.options?.pattern;
  const st =
    styling && typeof styling === 'object' && !Array.isArray(styling)
      ? Object.fromEntries(
          Object.entries(styling as Record<string, unknown>).filter(
            (e): e is [string, string] => typeof e[1] === 'string',
          ),
        )
      : {};
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    category: r.garmentType.category as Category,
    modelKey: r.garmentType.modelKey,
    attributes: (r.attributes ?? {}) as Record<string, unknown>,
    styles: (r.styles ?? []).filter((s) => s in STYLE_TAGS),
    season: r.season as SeasonKey,
    patterned:
      !!custom.pattern?.kind ||
      (!!legacy && legacy !== 'solid' && legacy !== 'none'),
    styling: st,
    detailColors: Object.values(custom.colors ?? {}).filter(
      (c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c),
    ),
    details: Array.isArray(custom.details) ? custom.details.length : 0,
  };
}

/** Huella estable de lo que se puntúa (si no cambia, la nota tampoco). */
export function fingerprintOf(engine: string, input: RatingInput): string {
  const items = [...input.items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((i) => [
      i.id,
      i.color.toLowerCase(),
      i.modelKey,
      i.season,
      i.attributes,
      i.styles,
      i.styling,
      i.detailColors,
      i.details,
      i.patterned,
    ]);
  const data = JSON.stringify(
    [
      engine,
      input.style ?? null,
      input.occasion ?? null,
      input.season ?? null,
      items,
    ],
    (_k, v: unknown) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
              a.localeCompare(b),
            ),
          )
        : v,
  );
  return createHash('sha256').update(data).digest('hex');
}

export interface PreviewInput {
  items: OutfitItemInputDto[];
  style?: OutfitStyle | null;
  occasion?: string | null;
  season?: Season | null;
}

/**
 * OUTFIT RATING: calcula la nota con el motor activo, la guarda en el
 * historial y la copia en el outfit (para las fichas y para ordenar).
 */
@Injectable()
export class RatingService {
  private readonly log = new Logger(RatingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OUTFIT_RATING_ENGINE) private readonly engine: RatingEngine,
  ) {}

  /** Monta la entrada del motor para un outfit guardado (o null si no existe). */
  private async inputFor(
    userId: string,
    outfitId: string,
  ): Promise<RatingInput | null> {
    const outfit = await this.prisma.outfit.findFirst({
      where: { id: outfitId, userId },
      select: {
        style: true,
        occasion: true,
        season: true,
        items: {
          orderBy: { position: 'asc' },
          select: { styling: true, wardrobeItem: { select: ratingItemSelect } },
        },
      },
    });
    if (!outfit) return null;
    return {
      items: outfit.items.map((i) => toRatingItem(i.wardrobeItem, i.styling)),
      style: outfit.style,
      occasion: outfit.occasion,
      season: outfit.season as SeasonKey | null,
    };
  }

  private async pool(userId: string): Promise<RatingItem[]> {
    const rows = await this.prisma.wardrobeItem.findMany({
      // Los consejos proponen prendas que ya tienes (no las de la wishlist).
      where: { userId, wishlistStatus: null },
      select: ratingItemSelect,
      orderBy: { createdAt: 'desc' },
      take: POOL_LIMIT,
    });
    return rows.map((r) => toRatingItem(r, {}));
  }

  /**
   * Calcula y guarda la nota. Solo añade una fila al historial si ha cambiado
   * lo puntuado (o el motor); si no, devuelve la última.
   */
  async rate(userId: string, outfitId: string, trigger: RatingTrigger) {
    const input = await this.inputFor(userId, outfitId);
    if (!input) throw new NotFoundException('Outfit not found');
    const fingerprint = fingerprintOf(this.engine.id, input);
    const last = await this.prisma.outfitRating.findFirst({
      where: { outfitId, userId },
      orderBy: { createdAt: 'desc' },
      select: { ...historySelect, fingerprint: true, report: true },
    });
    const result = await this.engine.rate(input, await this.pool(userId));
    if (last && last.fingerprint === fingerprint) {
      // Lo puntuado no ha cambiado: misma nota (los consejos se recalculan
      // porque dependen del resto del armario).
      return {
        rating: this.view(last, result),
        result,
        changed: false,
        stale: false,
      };
    }
    const now = new Date();
    const [row] = await this.prisma.$transaction([
      this.prisma.outfitRating.create({
        data: {
          userId,
          outfitId,
          total: result.total,
          colors: result.categories.colors.score,
          style: result.categories.style.score,
          balance: result.categories.balance.score,
          details: result.categories.details.score,
          tier: result.tier,
          engine: result.engine,
          trigger,
          fingerprint,
          report: result as unknown as Prisma.InputJsonValue,
          createdAt: now,
        },
        select: historySelect,
      }),
      this.prisma.outfit.update({
        where: { id_userId: { id: outfitId, userId } },
        data: {
          ratingScore: result.total,
          ratingTier: result.tier,
          ratedAt: now,
        },
        select: { id: true },
      }),
    ]);
    return {
      rating: this.view(row, result),
      result,
      changed: true,
      stale: false,
    };
  }

  /**
   * Igual que `rate`, pero un fallo no rompe el guardado del outfit (la nota
   * se puede recalcular luego).
   */
  async rateSafe(userId: string, outfitId: string, trigger: RatingTrigger) {
    try {
      const r = await this.rate(userId, outfitId, trigger);
      return {
        ratingScore: r.rating.total,
        ratingTier: r.rating.tier,
        ratedAt: r.rating.createdAt,
      };
    } catch (err) {
      this.log.warn(`No se pudo puntuar el outfit ${outfitId}: ${String(err)}`);
      return null;
    }
  }

  /**
   * Última nota guardada y si está desactualizada (p. ej. porque se cambió
   * el color de una prenda). Si el outfit no tiene nota, la calcula.
   */
  async current(userId: string, outfitId: string) {
    const input = await this.inputFor(userId, outfitId);
    if (!input) throw new NotFoundException('Outfit not found');
    const last = await this.prisma.outfitRating.findFirst({
      where: { outfitId, userId },
      orderBy: { createdAt: 'desc' },
      select: { ...historySelect, fingerprint: true, report: true },
    });
    if (!last) return this.rate(userId, outfitId, RatingTrigger.BACKFILL);
    const stale = last.fingerprint !== fingerprintOf(this.engine.id, input);
    // Al día: se recalcula para que los consejos usen el armario de ahora
    // (la nota es la misma: mismo motor y misma huella). Desactualizada: se
    // enseña la guardada y el frontend ofrece recalcular.
    const result = stale
      ? (last.report as unknown as RatingResult)
      : await this.engine.rate(input, await this.pool(userId));
    return { rating: this.view(last, result), result, changed: false, stale };
  }

  async history(userId: string, outfitId: string, limit = 20) {
    const owned = await this.prisma.outfit.count({
      where: { id: outfitId, userId },
    });
    if (!owned) throw new NotFoundException('Outfit not found');
    return this.prisma.outfitRating.findMany({
      where: { outfitId, userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: historySelect,
    });
  }

  /** Nota de una combinación sin guardar (el editor la pide mientras eliges). */
  async preview(userId: string, dto: PreviewInput): Promise<RatingResult> {
    const ids = dto.items.map((i) => i.wardrobeItemId);
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Duplicated wardrobe items');
    const rows = await this.prisma.wardrobeItem.findMany({
      where: { id: { in: ids }, userId },
      select: ratingItemSelect,
    });
    if (rows.length !== ids.length)
      throw new BadRequestException('Wardrobe items not found');
    const byId = new Map(rows.map((r) => [r.id, r]));
    const errors: string[] = [];
    const items = dto.items.map((i) => {
      const row = byId.get(i.wardrobeItemId)!;
      const v = validateStyling(i.styling ?? {}, row.garmentType.modelKey);
      if (!v.ok)
        errors.push(...v.errors.map((e) => `${i.wardrobeItemId}: ${e}`));
      return toRatingItem(row, v.ok ? v.value : {});
    });
    if (errors.length) throw new BadRequestException(errors);
    return this.engine.rate(
      {
        items,
        style: dto.style ?? null,
        occasion: dto.occasion ?? null,
        season: (dto.season as SeasonKey | null) ?? null,
      },
      await this.pool(userId),
    );
  }

  /** Compara las notas de varios outfits tuyos (2 a 4): quién gana cada categoría. */
  async compare(userId: string, ids: string[]) {
    const unique = [...new Set(ids)];
    if (unique.length < 2)
      throw new BadRequestException('Choose at least 2 different outfits');
    const outfits = await this.prisma.outfit.findMany({
      where: { userId, id: { in: unique } },
      select: { id: true, name: true, style: true },
    });
    if (outfits.length !== unique.length)
      throw new NotFoundException('Outfit not found');
    const rows: {
      id: string;
      name: string;
      style: OutfitStyle | null;
      rating: ReturnType<RatingService['view']>;
      stale: boolean;
      comments: string[];
    }[] = [];
    for (const id of unique) {
      const o = outfits.find((x) => x.id === id)!;
      const r = await this.current(userId, id);
      rows.push({
        id,
        name: o.name,
        style: o.style,
        rating: r.rating,
        stale: r.stale,
        comments: r.result.comments.slice(0, 2),
      });
    }
    const winners = Object.fromEntries(
      [...RATING_CATEGORIES, 'total' as const].map((c) => {
        const best = Math.max(...rows.map((r) => r.rating[c]));
        return [c, rows.filter((r) => r.rating[c] === best).map((r) => r.id)];
      }),
    ) as Record<(typeof RATING_CATEGORIES)[number] | 'total', string[]>;
    return { outfits: rows, winners };
  }

  /** Puntúa los outfits de una lista que aún no tienen nota (outfits antiguos). */
  async backfill<T extends { id: string; ratingScore: number | null }>(
    userId: string,
    rows: T[],
  ): Promise<T[]> {
    const out: T[] = [];
    for (const row of rows) {
      if (row.ratingScore !== null) {
        out.push(row);
        continue;
      }
      const r = await this.rateSafe(userId, row.id, RatingTrigger.BACKFILL);
      out.push(r ? { ...row, ...r } : row);
    }
    return out;
  }

  private view(
    row: Prisma.OutfitRatingGetPayload<{ select: typeof historySelect }>,
    result: RatingResult,
  ) {
    return {
      id: row.id,
      total: row.total,
      colors: row.colors,
      style: row.style,
      balance: row.balance,
      details: row.details,
      tier: row.tier,
      engine: row.engine,
      trigger: row.trigger,
      createdAt: row.createdAt,
      report: result,
    };
  }
}
