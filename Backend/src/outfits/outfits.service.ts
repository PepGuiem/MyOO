import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LimitedResource,
  OutfitStyle,
  Prisma,
  RatingTrigger,
} from '@prisma/client';
import { paginate, toSkipTake } from '../common/pagination';
import { garmentTypeSummarySelect } from '../garment-types/garment-types.service';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOutfitDto } from './dto/create-outfit.dto';
import { ListOutfitsQueryDto } from './dto/list-outfits-query.dto';
import { OutfitItemInputDto } from './dto/outfit-item-input.dto';
import { UpdateOutfitDto } from './dto/update-outfit.dto';
import { RatingService } from './rating/rating.service';
import { validateStyling } from './styling';

export const outfitSelect = {
  id: true,
  name: true,
  description: true,
  occasion: true,
  season: true,
  isShared: true,
  hiddenByAdmin: true,
  style: true,
  isFavorite: true,
  ratingScore: true,
  ratingTier: true,
  ratedAt: true,
  sharedAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    orderBy: { position: 'asc' },
    select: {
      position: true,
      styling: true,
      wardrobeItem: {
        select: {
          id: true,
          name: true,
          color: true,
          size: true,
          season: true,
          imageUrl: true,
          modelUrl: true,
          customization: true,
          attributes: true,
          wardrobeId: true,
          garmentType: { select: garmentTypeSummarySelect },
          /** No null: es de la wishlist (todavía no la tienes). */
          wishlistStatus: true,
        },
      },
    },
  },
} satisfies Prisma.OutfitSelect;

interface NormalizedItem {
  wardrobeItemId: string;
  position: number;
  styling: Prisma.InputJsonValue;
}

@Injectable()
export class OutfitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly ratings: RatingService,
  ) {}

  /** Puntúa el outfit (OUTFIT RATING) y devuelve el outfit con la nota al día. */
  private async withRating<T extends { id: string }>(
    userId: string,
    outfit: T,
    trigger: RatingTrigger,
  ): Promise<T> {
    const r = await this.ratings.rateSafe(userId, outfit.id, trigger);
    return r ? { ...outfit, ...r } : outfit;
  }

  async findAll(userId: string, query: ListOutfitsQueryDto) {
    const where: Prisma.OutfitWhereInput = {
      userId,
      season: query.season,
      style: query.style,
      isFavorite: query.favorite === true ? true : undefined,
      items: query.itemId
        ? { some: { wardrobeItemId: query.itemId } }
        : undefined,
      name: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
    };
    const orderBy: Prisma.OutfitOrderByWithRelationInput[] =
      query.sort === 'name'
        ? [{ name: 'asc' }, { id: 'asc' }]
        : query.sort === 'score'
          ? [
              { ratingScore: { sort: 'desc', nulls: 'last' } },
              { createdAt: 'desc' },
              { id: 'asc' },
            ]
          : query.sort === 'old'
            ? [{ createdAt: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'asc' }];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.outfit.findMany({
        where,
        select: outfitSelect,
        orderBy,
        ...toSkipTake(query.page, query.pageSize),
      }),
      this.prisma.outfit.count({ where }),
    ]);
    // Outfits de antes de OUTFIT RATING: se puntúan la primera vez que salen.
    const rated = await this.ratings.backfill(userId, rows);
    return paginate(rated, total, query.page, query.pageSize);
  }

  /** Cifras para los filtros: total, favoritos y cuántos hay de cada estilo. */
  async summary(userId: string) {
    const [total, favorites, groups] = await this.prisma.$transaction([
      this.prisma.outfit.count({ where: { userId } }),
      this.prisma.outfit.count({ where: { userId, isFavorite: true } }),
      this.prisma.outfit.groupBy({
        by: ['style'],
        where: { userId },
        _count: { _all: true },
        orderBy: { style: 'asc' },
      }),
    ]);
    const byStyle = Object.fromEntries(
      Object.values(OutfitStyle).map((s) => [s, 0]),
    ) as Record<OutfitStyle, number>;
    let unstyled = 0;
    for (const g of groups) {
      const n = (g._count as { _all: number })._all;
      if (g.style) byStyle[g.style] = n;
      else unstyled = n;
    }
    return { total, favorites, byStyle, unstyled };
  }

  /**
   * Duplica un outfit (mismas prendas, estilo y forma de llevarlas). La copia
   * no se comparte ni es favorita. Cuenta para el límite del plan.
   */
  async duplicate(userId: string, id: string) {
    const copy = await this.prisma.$transaction(async (tx) => {
      const source = await tx.outfit.findFirst({
        where: { id, userId },
        select: {
          name: true,
          description: true,
          occasion: true,
          season: true,
          style: true,
          items: {
            select: { wardrobeItemId: true, position: true, styling: true },
          },
        },
      });
      if (!source) throw new NotFoundException('Outfit not found');
      await this.plans.assertCanCreate(tx, userId, LimitedResource.OUTFITS);
      const suffix = ' (copia)';
      const outfit = await tx.outfit.create({
        data: {
          userId,
          name: source.name.slice(0, 80 - suffix.length) + suffix,
          description: source.description,
          occasion: source.occasion,
          season: source.season,
          style: source.style,
        },
        select: { id: true },
      });
      if (source.items.length) {
        await tx.outfitItem.createMany({
          data: source.items.map((i) => ({
            userId,
            outfitId: outfit.id,
            wardrobeItemId: i.wardrobeItemId,
            position: i.position,
            styling: (i.styling ?? {}) as Prisma.InputJsonValue,
          })),
        });
      }
      return tx.outfit.findUniqueOrThrow({
        where: { id: outfit.id },
        select: outfitSelect,
      });
    });
    return this.withRating(userId, copy, RatingTrigger.CREATE);
  }

  async findOne(userId: string, id: string) {
    const outfit = await this.prisma.outfit.findFirst({
      where: { id, userId },
      select: outfitSelect,
    });
    if (!outfit) throw new NotFoundException('Outfit not found');
    return outfit;
  }

  async create(userId: string, dto: CreateOutfitDto) {
    const items = this.normalizeItems(dto.items);

    const created = await this.prisma.$transaction(async (tx) => {
      await this.plans.assertCanCreate(tx, userId, LimitedResource.OUTFITS);
      await this.assertItemsOwned(tx, userId, items);

      const outfit = await tx.outfit.create({
        data: {
          userId,
          name: dto.name,
          description: dto.description ?? null,
          occasion: dto.occasion ?? null,
          season: dto.season ?? null,
          isShared: dto.isShared ?? false,
          sharedAt: dto.isShared ? new Date() : null,
          style: dto.style ?? null,
          isFavorite: dto.isFavorite ?? false,
        },
        select: { id: true },
      });
      await tx.outfitItem.createMany({
        data: items.map((i) => ({ ...i, userId, outfitId: outfit.id })),
      });
      return tx.outfit.findUniqueOrThrow({
        where: { id: outfit.id },
        select: outfitSelect,
      });
    });
    // La nota se calcula fuera de la transacción: si falla, el outfit se guarda igual.
    return this.withRating(userId, created, RatingTrigger.CREATE);
  }

  async update(userId: string, id: string, dto: UpdateOutfitDto) {
    const items = dto.items ? this.normalizeItems(dto.items) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.outfit.findFirst({
        where: { id, userId },
        select: { id: true, isShared: true },
      });
      if (!existing) throw new NotFoundException('Outfit not found');

      await tx.outfit.update({
        where: { id_userId: { id, userId } },
        data: {
          name: dto.name ?? undefined,
          description: dto.description,
          occasion: dto.occasion,
          season: dto.season,
          isShared: dto.isShared,
          style: dto.style,
          isFavorite: dto.isFavorite,
          // Al compartirlo de nuevo sube al principio del perfil.
          sharedAt:
            dto.isShared === undefined || dto.isShared === existing.isShared
              ? undefined
              : dto.isShared
                ? new Date()
                : null,
        },
      });

      if (items) {
        // Reemplazo completo: borramos las asociaciones y creamos las nuevas
        // dentro de la MISMA transacción (si algo falla, no cambia nada).
        await this.assertItemsOwned(tx, userId, items);
        await tx.outfitItem.deleteMany({ where: { outfitId: id, userId } });
        await tx.outfitItem.createMany({
          data: items.map((i) => ({ ...i, userId, outfitId: id })),
        });
      }

      return tx.outfit.findUniqueOrThrow({
        where: { id },
        select: outfitSelect,
      });
    });
    // Solo se puntúa si cambia algo de lo que cuenta para la nota (y aun así,
    // el historial solo crece si cambia la huella).
    const affectsRating =
      dto.items !== undefined ||
      dto.style !== undefined ||
      dto.occasion !== undefined ||
      dto.season !== undefined;
    return affectsRating || updated.ratingScore === null
      ? this.withRating(userId, updated, RatingTrigger.UPDATE)
      : updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.outfit.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw new NotFoundException('Outfit not found');
  }

  /**
   * - Rechaza prendas repetidas (una prenda no puede estar 2 veces en el mismo outfit).
   * - Asigna `position` según el orden del array si no viene.
   */
  private normalizeItems(items: OutfitItemInputDto[]): NormalizedItem[] {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const item of items) {
      if (seen.has(item.wardrobeItemId)) duplicates.add(item.wardrobeItemId);
      seen.add(item.wardrobeItemId);
    }
    if (duplicates.size > 0) {
      throw new BadRequestException(
        `Duplicated wardrobe items in outfit: ${[...duplicates].join(', ')}`,
      );
    }
    return items.map((item, index) => ({
      wardrobeItemId: item.wardrobeItemId,
      position: item.position ?? index,
      styling: (item.styling ?? {}) as Prisma.InputJsonValue,
    }));
  }

  /**
   * Comprueba que TODAS las prendas existen y son del usuario.
   * (La base de datos también lo impide con claves foráneas compuestas;
   * esta comprobación da un mensaje de error más claro.)
   * También valida el estilo de cada prenda según su tipo (y lo deja limpio).
   */
  private async assertItemsOwned(
    tx: Prisma.TransactionClient,
    userId: string,
    items: NormalizedItem[],
  ): Promise<void> {
    const ids = items.map((i) => i.wardrobeItemId);
    const found = await tx.wardrobeItem.findMany({
      where: { id: { in: ids }, userId },
      select: { id: true, garmentType: { select: { modelKey: true } } },
    });
    if (found.length !== ids.length) {
      const foundIds = new Set(found.map((f) => f.id));
      const missing = ids.filter((i) => !foundIds.has(i));
      throw new BadRequestException(
        `Wardrobe items not found: ${missing.join(', ')}`,
      );
    }
    const modelKeys = new Map(found.map((f) => [f.id, f.garmentType.modelKey]));
    const errors: string[] = [];
    for (const item of items) {
      const result = validateStyling(
        item.styling,
        modelKeys.get(item.wardrobeItemId) ?? '',
      );
      if (result.ok) item.styling = result.value as Prisma.InputJsonValue;
      else
        errors.push(
          ...result.errors.map((e) => `${item.wardrobeItemId}: ${e}`),
        );
    }
    if (errors.length) throw new BadRequestException(errors);
  }
}
