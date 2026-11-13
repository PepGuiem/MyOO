import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, StylistSignal } from '@prisma/client';
import { garmentTypeSummarySelect } from '../garment-types/garment-types.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AlternativesDto,
  GenerateOutfitsDto,
  StylistContextDto,
  StylistFeedbackDto,
} from './dto/stylist.dto';
import {
  Category,
  EngineItem,
  GenerateOptions,
  Preferences,
  SeasonKey,
  alternativesFor,
  analyzeWardrobe,
  generateOutfits,
  setKey,
} from './engine';
import {
  OCCASIONS,
  PURCHASE_PLATFORMS,
  SIGNAL_WEIGHTS,
  STYLE_TAGS,
  StyleTag,
  WEATHER,
} from './vocabulary';

/** Lo que necesita el frontend para dibujar cada prenda propuesta (sin pedirla aparte). */
const stylistItemSelect = {
  id: true,
  name: true,
  color: true,
  size: true,
  season: true,
  imageUrl: true,
  modelUrl: true,
  attributes: true,
  customization: true,
  styles: true,
  garmentType: { select: garmentTypeSummarySelect },
} satisfies Prisma.WardrobeItemSelect;

type StylistItem = Prisma.WardrobeItemGetPayload<{
  select: typeof stylistItemSelect;
}>;

/** Cuántas señales recientes se usan para personalizar. */
const FEEDBACK_WINDOW = 500;

@Injectable()
export class StylistService {
  constructor(private readonly prisma: PrismaService) {}

  /** Estilos, ocasiones, tiempo y plataformas de compra (para pintar los selectores). */
  vocabulary() {
    return {
      styles: Object.entries(STYLE_TAGS).map(([value, label]) => ({
        value,
        label,
      })),
      occasions: Object.entries(OCCASIONS).map(([value, o]) => ({
        value,
        label: o.label,
      })),
      weather: Object.entries(WEATHER).map(([value, w]) => ({
        value,
        label: w.label,
      })),
      purchasePlatforms: Object.entries(PURCHASE_PLATFORMS).map(
        ([value, label]) => ({ value, label }),
      ),
    };
  }

  async generate(userId: string, dto: GenerateOutfitsDto) {
    const { rows, pool } = await this.loadPool(userId, dto.wardrobeId);
    const locked = dto.lockedItemIds ?? [];
    const missing = locked.filter((id) => !pool.some((i) => i.id === id));
    if (missing.length)
      throw new BadRequestException(
        'lockedItemIds must be items of yours (in the chosen wardrobe)',
      );
    const prefs = await this.loadPreferences(userId);
    const outfits = generateOutfits(
      pool,
      {
        ...this.options(dto),
        count: dto.count ?? 3,
        seed: dto.seed ?? Math.floor(Math.random() * 2_147_483_647),
        lockedIds: locked,
        discover: dto.discover,
      },
      prefs,
    );
    return {
      outfits,
      items: this.itemMap(
        rows,
        outfits
          .flatMap((o) => o.items.map((i) => i.itemId))
          .concat(tipItemIds(outfits)),
      ),
    };
  }

  async alternatives(userId: string, dto: AlternativesDto) {
    if (!dto.itemIds.includes(dto.replaceItemId))
      throw new BadRequestException('replaceItemId must be one of itemIds');
    const { rows, pool } = await this.loadPool(userId, dto.wardrobeId);
    if (dto.itemIds.some((id) => !pool.some((i) => i.id === id))) {
      throw new BadRequestException('itemIds must be items of yours');
    }
    const prefs = await this.loadPreferences(userId);
    const alternatives = alternativesFor(
      pool,
      dto.itemIds,
      dto.replaceItemId,
      this.options(dto),
      prefs,
    );
    return {
      alternatives,
      items: this.itemMap(
        rows,
        alternatives.map((a) => a.itemId),
      ),
    };
  }

  async insights(userId: string, wardrobeId?: string) {
    const { pool } = await this.loadPool(userId, wardrobeId);
    const prefs = await this.loadPreferences(userId);
    return analyzeWardrobe(pool, prefs);
  }

  /** Guarda una señal. Las prendas tienen que ser del usuario. */
  async feedback(userId: string, dto: StylistFeedbackDto): Promise<void> {
    if (dto.itemIds.length) {
      const owned = await this.prisma.wardrobeItem.count({
        where: { userId, id: { in: dto.itemIds } },
      });
      if (owned !== dto.itemIds.length)
        throw new BadRequestException('itemIds must be items of yours');
    }
    const isTip =
      dto.signal === StylistSignal.ACCEPT_TIP ||
      dto.signal === StylistSignal.REJECT_TIP;
    if (isTip && !dto.tipCode)
      throw new BadRequestException('tipCode is required for tip signals');
    await this.prisma.stylistFeedback.create({
      data: {
        userId,
        signal: dto.signal,
        itemIds: dto.itemIds,
        tipCode: dto.tipCode ?? null,
        style: dto.style ?? null,
        occasion: dto.occasion ?? null,
      },
    });
  }

  // ------------------------------------------------------------------ apoyo
  private options(dto: StylistContextDto): GenerateOptions {
    return {
      style: dto.style,
      occasion: dto.occasion,
      weather: dto.weather,
      season: dto.season as SeasonKey | undefined,
      excludeIds: dto.excludeItemIds,
    };
  }

  private async loadPool(userId: string, wardrobeId?: string) {
    if (wardrobeId) {
      const w = await this.prisma.wardrobe.findFirst({
        where: { id: wardrobeId, userId },
        select: { id: true },
      });
      if (!w) throw new BadRequestException('wardrobeId does not exist');
    }
    const rows = await this.prisma.wardrobeItem.findMany({
      // Solo lo que tienes: la wishlist no entra en las propuestas.
      where: { userId, wardrobeId, wishlistStatus: null },
      select: stylistItemSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 1000,
    });
    return { rows, pool: rows.map(toEngineItem) };
  }

  /** Afinidades a partir de las últimas señales y de los outfits guardados. */
  async loadPreferences(userId: string): Promise<Preferences> {
    const [rows, usage] = await Promise.all([
      this.prisma.stylistFeedback.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: FEEDBACK_WINDOW,
        select: { signal: true, itemIds: true, tipCode: true, style: true },
      }),
      this.prisma.outfitItem.groupBy({
        by: ['wardrobeItemId'],
        where: { userId },
        _count: { _all: true },
      }),
    ]);
    const prefs: Preferences = {
      item: {},
      rejectedTips: {},
      styles: {},
      disliked: [],
      usage: {},
    };
    for (const u of usage) prefs.usage[u.wardrobeItemId] = u._count._all;
    for (const r of rows) {
      const w = SIGNAL_WEIGHTS[r.signal];
      if (
        r.signal === StylistSignal.REJECT_TIP ||
        r.signal === StylistSignal.ACCEPT_TIP
      ) {
        if (r.tipCode) {
          const cur = prefs.rejectedTips[r.tipCode] ?? 0;
          prefs.rejectedTips[r.tipCode] = Math.max(
            0,
            cur + (r.signal === StylistSignal.REJECT_TIP ? 1 : -1),
          );
        }
      } else {
        for (const id of r.itemIds) prefs.item[id] = (prefs.item[id] ?? 0) + w;
      }
      if (r.style) prefs.styles[r.style] = (prefs.styles[r.style] ?? 0) + w;
      if (r.signal === StylistSignal.DISLIKE && r.itemIds.length >= 2)
        prefs.disliked.push(setKey(r.itemIds));
    }
    return prefs;
  }

  private itemMap(rows: StylistItem[], ids: string[]) {
    const wanted = new Set(ids);
    return Object.fromEntries(
      rows.filter((r) => wanted.has(r.id)).map((r) => [r.id, r]),
    );
  }
}

function tipItemIds(outfits: ReturnType<typeof generateOutfits>): string[] {
  const out: string[] = [];
  for (const o of outfits)
    for (const t of o.tips) {
      if (t.action?.type === 'add') out.push(t.action.itemId);
      if (t.action?.type === 'swap') out.push(t.action.toItemId);
    }
  return out;
}

/** Fila de la base de datos → prenda del motor. */
export function toEngineItem(r: StylistItem): EngineItem {
  const custom = (r.customization ?? {}) as {
    pattern?: { kind?: string };
    options?: { pattern?: string };
  };
  const legacy = custom.options?.pattern;
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    category: r.garmentType.category as Category,
    modelKey: r.garmentType.modelKey,
    attributes: (r.attributes ?? {}) as Record<string, unknown>,
    styles: (r.styles ?? []).filter((s): s is StyleTag => s in STYLE_TAGS),
    season: r.season as SeasonKey,
    patterned:
      !!custom.pattern?.kind ||
      (!!legacy && legacy !== 'solid' && legacy !== 'none'),
  };
}
