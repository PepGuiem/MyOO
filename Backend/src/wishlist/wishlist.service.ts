import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LimitedResource,
  NotificationType,
  PriceSource,
  Prisma,
  WishlistStatus,
} from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { paginate, toSkipTake } from '../common/pagination';
import { sanitizeForModel } from '../customization/customization';
import { validateAttributes } from '../garment-types/attribute-schema';
import { GarmentTypesService } from '../garment-types/garment-types.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { wardrobeItemSelect } from '../wardrobe-items/wardrobe-items.service';
import {
  CreateWishlistItemDto,
  ListWishlistQueryDto,
  MoveToWardrobeDto,
  RecordPriceDto,
  UpdateBudgetDto,
  UpdateWishlistItemDto,
} from './dto/wishlist.dto';
import { PRICE_TRACKERS, PriceTracker } from './price-tracking';
import {
  CATEGORY_GARMENT,
  computeBudget,
  crossesTarget,
  priceTrend,
  toCents,
  WishCategory,
} from './wishlist.rules';

/** Artículos como máximo en la wishlist de una persona (no cuentan para el límite del armario). */
export const MAX_WISHLIST_ITEMS = 500;
/** Puntos de precio que se devuelven en la lista (para la mini gráfica). */
const PRICE_POINTS = 12;

const priceSelect = {
  id: true,
  price: true,
  currency: true,
  source: true,
  note: true,
  recordedAt: true,
} satisfies Prisma.WishlistPriceSelect;

export const wishlistSelect = {
  ...wardrobeItemSelect,
  wishlistCategory: true,
  currentPrice: true,
  targetPrice: true,
  trackPrice: true,
  photoAssetId: true,
  prices: {
    orderBy: { recordedAt: 'desc' },
    take: PRICE_POINTS,
    select: priceSelect,
  },
} satisfies Prisma.WardrobeItemSelect;

type WishRow = Prisma.WardrobeItemGetPayload<{ select: typeof wishlistSelect }>;

const isWish = {
  wishlistStatus: { not: null },
} satisfies Prisma.WardrobeItemWhereInput;

function view(row: WishRow) {
  const { prices, ...rest } = row;
  const points = [...prices].reverse();
  return {
    ...rest,
    prices: points,
    trend: priceTrend(
      points.map((p) => ({
        price: toCents(p.price)!,
        recordedAt: p.recordedAt,
      })),
    ),
  };
}

function today(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
}

/**
 * WISHLIST: prendas que quieres comprar. Son prendas (WardrobeItem) con
 * `wishlistStatus`, así que se ven en 3D y se pueden usar en outfits; el resto
 * de la app (armario, estilista, analítica, límites del plan) solo cuenta las
 * de `wishlistStatus = null`. Al comprarla, pasa al armario.
 */
@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly garmentTypes: GarmentTypesService,
    private readonly assets: AssetsService,
    private readonly plans: PlansService,
    private readonly notifications: NotificationsService,
    @Inject(PRICE_TRACKERS) private readonly trackers: PriceTracker[],
  ) {}

  async list(userId: string, q: ListWishlistQueryDto) {
    const where: Prisma.WardrobeItemWhereInput = {
      userId,
      wishlistStatus: q.status ?? { not: null },
      wishlistCategory: q.category,
      OR: q.search
        ? [
            { name: { contains: q.search, mode: 'insensitive' } },
            { storeName: { contains: q.search, mode: 'insensitive' } },
            { attributes: { path: ['brand'], string_contains: q.search } },
          ]
        : undefined,
    };
    const orderBy: Prisma.WardrobeItemOrderByWithRelationInput[] =
      q.sort === 'price_asc'
        ? [{ currentPrice: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
        : q.sort === 'price_desc'
          ? [{ currentPrice: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
          : q.sort === 'name'
            ? [{ name: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'asc' }];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.wardrobeItem.findMany({
        where,
        select: wishlistSelect,
        orderBy,
        ...toSkipTake(q.page, q.pageSize),
      }),
      this.prisma.wardrobeItem.count({ where }),
    ]);
    return paginate(rows.map(view), total, q.page, q.pageSize);
  }

  async findOne(userId: string, id: string) {
    const row = await this.prisma.wardrobeItem.findFirst({
      where: { id, userId, ...isWish },
      select: wishlistSelect,
    });
    if (!row) throw new NotFoundException('Wishlist item not found');
    return view(row);
  }

  async prices(userId: string, id: string) {
    await this.assertWish(userId, id);
    return this.prisma.wishlistPrice.findMany({
      where: { itemId: id, userId },
      orderBy: { recordedAt: 'asc' },
      select: priceSelect,
    });
  }

  private async assertWish(userId: string, id: string) {
    const row = await this.prisma.wardrobeItem.findFirst({
      where: { id, userId, ...isWish },
      select: {
        id: true,
        currentPrice: true,
        targetPrice: true,
        currency: true,
        name: true,
        garmentTypeId: true,
        attributes: true,
        customization: true,
        wardrobeId: true,
        photoAssetId: true,
        wishlistCategory: true,
      },
    });
    if (!row) throw new NotFoundException('Wishlist item not found');
    return row;
  }

  /** Armario donde irá al comprarlo: el que digas, o el primero (si no hay ninguno, se crea). */
  /** Armario de destino: el pedido, el primero o uno nuevo («Mi armario»). */
  async wardrobeFor(
    tx: Prisma.TransactionClient,
    userId: string,
    wardrobeId?: string,
  ): Promise<string> {
    if (wardrobeId) {
      const w = await tx.wardrobe.findFirst({
        where: { id: wardrobeId, userId },
        select: { id: true },
      });
      if (!w) throw new BadRequestException('wardrobeId does not exist');
      return w.id;
    }
    const first = await tx.wardrobe.findFirst({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (first) return first.id;
    await this.plans.assertCanCreate(tx, userId, LimitedResource.WARDROBES);
    const created = await tx.wardrobe.create({
      data: { userId, name: 'Mi armario' },
      select: { id: true },
    });
    return created.id;
  }

  private async garmentTypeFor(
    category: WishCategory,
    garmentTypeId?: string,
  ): Promise<string> {
    if (garmentTypeId) return garmentTypeId;
    const code = CATEGORY_GARMENT[category];
    if (!code)
      throw new BadRequestException(
        'garmentTypeId is required for category OTHER',
      );
    const t = await this.prisma.garmentType.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!t)
      throw new BadRequestException(
        `Garment type ${code} is missing (run the seed)`,
      );
    return t.id;
  }

  /** Atributos: la marca (y la capucha para sudaderas), validados con el esquema del tipo. */
  private async attributesFor(
    garmentTypeId: string,
    base: Record<string, unknown>,
    brand: string | null | undefined,
    hoodie: boolean,
  ) {
    const schema = await this.garmentTypes.getSchemaOrThrow(garmentTypeId);
    const next: Record<string, unknown> = { ...base };
    if (brand !== undefined) {
      if (brand === null) delete next.brand;
      else next.brand = brand;
    }
    if (hoodie && next.neckline === undefined) {
      const withHood = validateAttributes(schema, {
        ...next,
        neckline: 'hoodie',
      });
      if (withHood.ok) return withHood.value;
    }
    const r = validateAttributes(schema, next);
    if (!r.ok) throw new BadRequestException(r.errors);
    return r.value;
  }

  /**
   * `hooks` deja a otros módulos (SNEAKER COLLECTION) hacer algo dentro de la
   * misma transacción: antes de crear (comprobar duplicados) y después (crear
   * su ficha). Si algo falla, no se guarda nada.
   */
  async create(
    userId: string,
    dto: CreateWishlistItemDto,
    hooks: {
      before?: (tx: Prisma.TransactionClient) => Promise<void>;
      after?: (tx: Prisma.TransactionClient, itemId: string) => Promise<void>;
    } = {},
  ) {
    if (!dto.category) throw new BadRequestException('category is required');
    if (!dto.color) throw new BadRequestException('color is required');
    const count = await this.prisma.wardrobeItem.count({
      where: { userId, ...isWish },
    });
    if (count >= MAX_WISHLIST_ITEMS)
      throw new BadRequestException(
        `Your wishlist can have at most ${MAX_WISHLIST_ITEMS} items`,
      );
    if (dto.photoAssetId)
      await this.assets.assertOwned(userId, [dto.photoAssetId]);
    const garmentTypeId = await this.garmentTypeFor(
      dto.category,
      dto.garmentTypeId,
    );
    const attributes = await this.attributesFor(
      garmentTypeId,
      {},
      dto.brand ?? undefined,
      dto.category === 'HOODIES',
    );
    const currency = dto.currency ?? (await this.settings(userId)).currency;

    const id = await this.prisma.$transaction(async (tx) => {
      await hooks.before?.(tx);
      const wardrobeId = await this.wardrobeFor(tx, userId, dto.wardrobeId);
      const item = await tx.wardrobeItem.create({
        data: {
          userId,
          wardrobeId,
          garmentTypeId,
          name: dto.name,
          color: dto.color!,
          size: dto.size ?? null,
          notes: dto.notes ?? null,
          imageUrl: dto.imageUrl ?? null,
          productUrl: dto.productUrl ?? null,
          storeName: dto.storeName ?? null,
          attributes: attributes as Prisma.InputJsonObject,
          wishlistStatus: dto.status ?? WishlistStatus.WANT,
          wishlistCategory: dto.category,
          currentPrice: dto.price ?? null,
          currency: dto.price !== undefined ? currency : (dto.currency ?? null),
          targetPrice: dto.targetPrice ?? null,
          trackPrice: dto.trackPrice ?? false,
          photoAssetId: dto.photoAssetId ?? null,
        },
        select: { id: true },
      });
      if (dto.price !== undefined) {
        await tx.wishlistPrice.create({
          data: {
            userId,
            itemId: item.id,
            price: dto.price,
            currency,
            source: PriceSource.MANUAL,
            note: 'Precio al añadirlo',
          },
        });
      }
      await hooks.after?.(tx, item.id);
      return item.id;
    });
    return this.findOne(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateWishlistItemDto) {
    const existing = await this.assertWish(userId, id);
    if (dto.photoAssetId)
      await this.assets.assertOwned(userId, [dto.photoAssetId]);
    // Si cambias de categoría sin elegir modelo, se usa el de la nueva categoría.
    const categoryChanged =
      dto.category !== undefined && dto.category !== existing.wishlistCategory;
    const garmentTypeId =
      dto.garmentTypeId ??
      (categoryChanged
        ? await this.garmentTypeFor(dto.category!, undefined)
        : existing.garmentTypeId);
    const typeChanged = garmentTypeId !== existing.garmentTypeId;
    const attributes =
      dto.brand !== undefined || typeChanged
        ? await this.attributesFor(
            garmentTypeId,
            typeChanged ? {} : (existing.attributes as Record<string, unknown>),
            dto.brand === undefined
              ? ((existing.attributes as Record<string, unknown>)?.brand as
                  string | undefined)
              : dto.brand,
            typeChanged &&
              (dto.category ?? existing.wishlistCategory) === 'HOODIES',
          )
        : undefined;
    let customization: Prisma.InputJsonObject | undefined;
    if (typeChanged) {
      const modelKey =
        await this.garmentTypes.getModelKeyOrThrow(garmentTypeId);
      customization = sanitizeForModel(
        existing.customization,
        modelKey,
      ) as Prisma.InputJsonObject;
    }
    if (dto.wardrobeId && dto.wardrobeId !== existing.wardrobeId) {
      const w = await this.prisma.wardrobe.findFirst({
        where: { id: dto.wardrobeId, userId },
        select: { id: true },
      });
      if (!w) throw new BadRequestException('wardrobeId does not exist');
    }
    await this.prisma.wardrobeItem.update({
      where: { id_userId: { id, userId } },
      data: {
        name: dto.name,
        wishlistCategory: dto.category,
        garmentTypeId: typeChanged ? garmentTypeId : undefined,
        color: dto.color,
        size: dto.size,
        productUrl: dto.productUrl,
        storeName: dto.storeName,
        notes: dto.notes,
        photoAssetId: dto.photoAssetId,
        imageUrl: dto.imageUrl,
        wishlistStatus: dto.status,
        targetPrice: dto.targetPrice,
        trackPrice: dto.trackPrice,
        wardrobeId: dto.wardrobeId,
        attributes: attributes as Prisma.InputJsonObject | undefined,
        customization,
      },
    });
    // La foto anterior, si ya no la usa nada, se borra del almacenamiento.
    if (
      dto.photoAssetId !== undefined &&
      existing.photoAssetId &&
      existing.photoAssetId !== dto.photoAssetId
    ) {
      await this.assets.removeIfUnused(userId, existing.photoAssetId);
    }
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.assertWish(userId, id);
    const { count } = await this.prisma.wardrobeItem.deleteMany({
      where: { id, userId, ...isWish },
    });
    if (!count) throw new NotFoundException('Wishlist item not found');
    if (existing.photoAssetId)
      await this.assets.removeIfUnused(userId, existing.photoAssetId);
  }

  /**
   * Apunta un precio (a mano o desde un servicio de seguimiento). Se guarda en
   * el historial y pasa a ser el precio actual. Si baja del precio objetivo,
   * avisa en la campanita (una vez por bajada).
   */
  async recordPrice(
    userId: string,
    id: string,
    dto: RecordPriceDto,
    source: PriceSource = PriceSource.MANUAL,
  ) {
    const item = await this.assertWish(userId, id);
    const currency =
      dto.currency ?? item.currency ?? (await this.settings(userId)).currency;
    if (
      item.currency &&
      item.currentPrice !== null &&
      currency !== item.currency
    ) {
      throw new BadRequestException(`This item is priced in ${item.currency}`);
    }
    await this.prisma.$transaction([
      this.prisma.wishlistPrice.create({
        data: {
          userId,
          itemId: id,
          price: dto.price,
          currency,
          source,
          note: dto.note ?? null,
        },
      }),
      this.prisma.wardrobeItem.update({
        where: { id_userId: { id, userId } },
        data: { currentPrice: dto.price, currency },
      }),
    ]);
    if (
      crossesTarget(
        toCents(item.currentPrice),
        toCents(dto.price)!,
        toCents(item.targetPrice),
      )
    ) {
      await this.notifications.notify([userId], {
        type: NotificationType.PRICE_DROP,
        title: `«${item.name}» ha bajado a ${dto.price.toFixed(2)} ${currency}`,
        body: `Tu precio objetivo era ${Number(item.targetPrice).toFixed(2)} ${currency}.`,
        link: '/wishlist',
      });
    }
    return this.findOne(userId, id);
  }

  /** Borra un precio apuntado por error; el actual pasa a ser el último que quede. */
  async removePrice(userId: string, id: string, priceId: string) {
    await this.assertWish(userId, id);
    const { count } = await this.prisma.wishlistPrice.deleteMany({
      where: { id: priceId, itemId: id, userId },
    });
    if (!count) throw new NotFoundException('Price not found');
    const last = await this.prisma.wishlistPrice.findFirst({
      where: { itemId: id, userId },
      orderBy: { recordedAt: 'desc' },
      select: { price: true, currency: true },
    });
    await this.prisma.wardrobeItem.update({
      where: { id_userId: { id, userId } },
      data: {
        currentPrice: last?.price ?? null,
        currency: last?.currency ?? undefined,
      },
    });
    return this.findOne(userId, id);
  }

  /**
   * Comprado: pasa al armario (cuenta para el límite de prendas del plan). Se
   * queda con su 3D, su personalización, sus outfits y su historial de precios.
   */
  async moveToWardrobe(userId: string, id: string, dto: MoveToWardrobeDto) {
    const item = await this.assertWish(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await this.plans.assertCanCreate(
        tx,
        userId,
        LimitedResource.WARDROBE_ITEMS,
      );
      const wardrobeId = dto.wardrobeId
        ? await this.wardrobeFor(tx, userId, dto.wardrobeId)
        : item.wardrobeId;
      await tx.wardrobeItem.update({
        where: { id_userId: { id, userId } },
        data: {
          wardrobeId,
          wishlistStatus: null,
          fromWishlistAt: new Date(),
          purchasePrice: dto.purchasePrice ?? item.currentPrice ?? null,
          currency:
            item.currency ??
            (dto.purchasePrice !== undefined ? 'EUR' : undefined),
          purchaseDate: dto.purchaseDate
            ? new Date(`${dto.purchaseDate}T00:00:00Z`)
            : today(),
          storeName: dto.storeName,
          targetPrice: null,
          trackPrice: false,
        },
      });
    });
    return this.prisma.wardrobeItem.findUniqueOrThrow({
      where: { id },
      select: wardrobeItemSelect,
    });
  }

  private async settings(userId: string) {
    const s = await this.prisma.wishlistSettings.findUnique({
      where: { userId },
    });
    return {
      budget: s?.budget ?? null,
      saved: s?.saved ?? new Prisma.Decimal(0),
      currency: s?.currency ?? 'EUR',
    };
  }

  async updateBudget(userId: string, dto: UpdateBudgetDto) {
    await this.prisma.wishlistSettings.upsert({
      where: { userId },
      create: {
        userId,
        budget: dto.budget ?? null,
        saved: dto.saved ?? 0,
        currency: dto.currency ?? 'EUR',
      },
      update: { budget: dto.budget, saved: dto.saved, currency: dto.currency },
    });
    return this.summary(userId);
  }

  /** Presupuesto: valor de lo pendiente, comprados, objetivo y lo que falta. */
  async summary(userId: string) {
    const [settings, items, moved] = await Promise.all([
      this.settings(userId),
      this.prisma.wardrobeItem.findMany({
        where: { userId, ...isWish },
        select: {
          wishlistStatus: true,
          wishlistCategory: true,
          currentPrice: true,
          purchasePrice: true,
          currency: true,
        },
      }),
      this.prisma.wardrobeItem.findMany({
        where: { userId, wishlistStatus: null, fromWishlistAt: { not: null } },
        select: { purchasePrice: true, currency: true },
      }),
    ]);
    return {
      ...computeBudget(
        items.map((i) => ({
          status: i.wishlistStatus!,
          category: i.wishlistCategory,
          currentPrice: toCents(i.currentPrice),
          purchasePrice: toCents(i.purchasePrice),
          currency: i.currency,
        })),
        moved.map((m) => ({
          purchasePrice: toCents(m.purchasePrice),
          currency: m.currency,
        })),
        {
          budget: toCents(settings.budget),
          saved: toCents(settings.saved) ?? 0,
          currency: settings.currency,
        },
      ),
      trackers: this.trackers.length,
    };
  }

  /**
   * Pide el precio a los servicios de seguimiento para los artículos marcados.
   * Sin servicios configurados no hace nada (y lo dice): no se inventan precios.
   */
  async refreshTracked(userId: string) {
    const items = await this.prisma.wardrobeItem.findMany({
      where: { userId, ...isWish, trackPrice: true, productUrl: { not: null } },
      select: { id: true, productUrl: true, currentPrice: true },
    });
    let updated = 0;
    let unsupported = 0;
    for (const it of items) {
      const tracker = this.trackers.find((t) => t.supports(it.productUrl!));
      if (!tracker) {
        unsupported++;
        continue;
      }
      const p = await tracker.fetchPrice(it.productUrl!);
      if (!p) continue;
      if (toCents(it.currentPrice) === Math.round(p.price * 100)) continue;
      await this.recordPrice(
        userId,
        it.id,
        {
          price: p.price,
          currency: p.currency,
          note: `Seguimiento: ${tracker.id}`,
        },
        PriceSource.TRACKER,
      );
      updated++;
    }
    return {
      trackers: this.trackers.length,
      tracked: items.length,
      updated,
      unsupported,
    };
  }
}
