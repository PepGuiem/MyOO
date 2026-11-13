import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LimitedResource, Prisma, SneakerBrand } from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { paginate, toSkipTake } from '../common/pagination';
import { validateAttributes } from '../garment-types/attribute-schema';
import { GarmentTypesService } from '../garment-types/garment-types.service';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { colorName } from '../stylist/engine';
import { wardrobeItemSelect } from '../wardrobe-items/wardrobe-items.service';
import { WishlistService } from '../wishlist/wishlist.service';
import {
  CreateSneakerDto,
  ListSneakersQueryDto,
  SneakerCardDto,
  UpdateSneakerDto,
} from './dto/sneakers.dto';
import {
  brandLabel,
  normalize,
  sameSneaker,
  SneakerIdentity,
  sneakerStats,
  usageOf,
  UsageInput,
} from './sneakers.rules';

type Scope = 'owned' | 'wish';
type Tx = Prisma.TransactionClient;

const ownedWhere = {
  wishlistStatus: null,
} satisfies Prisma.WardrobeItemWhereInput;
const wishWhere = {
  wishlistStatus: { not: null },
} satisfies Prisma.WardrobeItemWhereInput;
const scopeWhere = (scope: Scope) =>
  scope === 'wish' ? wishWhere : ownedWhere;

export const sneakerSelect = {
  ...wardrobeItemSelect,
  currentPrice: true,
  targetPrice: true,
} satisfies Prisma.WardrobeItemSelect;

type SneakerRow = Prisma.WardrobeItemGetPayload<{
  select: typeof sneakerSelect;
}>;

const toCents = (v: { toString(): string } | null) =>
  v === null ? null : Math.round(Number(v.toString()) * 100);

/**
 * SNEAKER COLLECTION. Cada zapatilla es una prenda (WardrobeItem) con su
 * ficha (SneakerDetails): así sirve para outfits, calendario y 3D. Si la
 * prenda está en la wishlist (`wishlistStatus` no null), es un par que
 * quieres conseguir; si no, es tuyo. Todo va filtrado por el usuario.
 */
@Injectable()
export class SneakersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly garmentTypes: GarmentTypesService,
    private readonly assets: AssetsService,
    private readonly wishlist: WishlistService,
  ) {}

  // --- Lectura -------------------------------------------------------------

  async list(userId: string, q: ListSneakersQueryDto) {
    const search = q.search?.trim();
    const where: Prisma.WardrobeItemWhereInput = {
      userId,
      ...scopeWhere(q.scope ?? 'owned'),
      size: q.size ? { equals: q.size, mode: 'insensitive' } : undefined,
      sneaker: {
        is: {
          brand: q.brand,
          condition: q.condition,
          ...(search
            ? {
                OR: [
                  { model: { contains: search, mode: 'insensitive' } },
                  { colorway: { contains: search, mode: 'insensitive' } },
                  { brandName: { contains: search, mode: 'insensitive' } },
                  { item: { name: { contains: search, mode: 'insensitive' } } },
                ],
              }
            : {}),
        },
      },
    };
    const orderBy: Prisma.WardrobeItemOrderByWithRelationInput[] =
      q.sort === 'name'
        ? [{ sneaker: { model: 'asc' } }, { id: 'asc' }]
        : q.sort === 'brand'
          ? [
              { sneaker: { brand: 'asc' } },
              { sneaker: { model: 'asc' } },
              { id: 'asc' },
            ]
          : q.sort === 'old'
            ? [{ createdAt: 'asc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'asc' }];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.wardrobeItem.findMany({
        where,
        select: sneakerSelect,
        orderBy,
        ...toSkipTake(q.page, q.pageSize),
      }),
      this.prisma.wardrobeItem.count({ where }),
    ]);
    const usage = usageOf(
      rows.map((r) => r.id),
      await this.usageInput(userId),
    );
    return paginate(
      rows.map((r) => this.view(r, usage)),
      total,
      q.page,
      q.pageSize,
    );
  }

  async findOne(userId: string, id: string) {
    const row = await this.prisma.wardrobeItem.findFirst({
      where: { id, userId, sneaker: { isNot: null } },
      select: sneakerSelect,
    });
    if (!row) throw new NotFoundException('Sneaker not found');
    return this.view(row, usageOf([row.id], await this.usageInput(userId)));
  }

  /** Zapatillas del armario que todavía no tienen ficha de colección. */
  async candidates(userId: string) {
    return this.prisma.wardrobeItem.findMany({
      where: {
        userId,
        ...ownedWhere,
        sneaker: { is: null },
        garmentType: { code: 'SNEAKERS' },
      },
      select: wardrobeItemSelect,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Dashboard de la colección (solo tus pares; la wishlist va aparte). */
  async stats(userId: string) {
    const [owned, wish, usage] = await Promise.all([
      this.prisma.wardrobeItem.findMany({
        where: { userId, ...ownedWhere, sneaker: { isNot: null } },
        select: {
          id: true,
          name: true,
          color: true,
          size: true,
          purchasePrice: true,
          currency: true,
          createdAt: true,
          sneaker: {
            select: {
              brand: true,
              brandName: true,
              model: true,
              colorway: true,
              condition: true,
              wearCount: true,
            },
          },
        },
      }),
      this.prisma.wardrobeItem.findMany({
        where: { userId, ...wishWhere, sneaker: { isNot: null } },
        select: { currentPrice: true, currency: true },
      }),
      this.usageInput(userId),
    ]);
    const value = new Map<string, number>();
    for (const w of wish) {
      if (w.currentPrice === null) continue;
      const cur = w.currency ?? 'EUR';
      value.set(cur, (value.get(cur) ?? 0) + toCents(w.currentPrice)!);
    }
    return sneakerStats(
      owned.map((o) => ({
        id: o.id,
        name: o.name,
        color: o.color,
        size: o.size,
        purchasePrice: toCents(o.purchasePrice),
        currency: o.currency,
        createdAt: o.createdAt,
        ...o.sneaker!,
      })),
      usage,
      {
        count: wish.length,
        value: [...value.entries()].map(([currency, total]) => ({
          currency,
          total: total / 100,
        })),
      },
    );
  }

  // --- Escritura -----------------------------------------------------------

  async create(userId: string, dto: CreateSneakerDto) {
    const card = this.requireCard(dto);
    const scope: Scope = dto.scope ?? 'owned';
    if (dto.photoAssetId)
      await this.assets.assertOwned(userId, [dto.photoAssetId]);
    const garmentTypeId = await this.footwearType(dto.garmentTypeId);
    const name = this.nameFor(card);
    const color = dto.color ?? '#F2F2F0';

    if (scope === 'wish') {
      const item = await this.wishlist.create(
        userId,
        {
          name,
          category: 'SNEAKERS',
          garmentTypeId,
          color,
          brand: brandLabel(card.brand, card.brandName),
          size: dto.size ?? null,
          notes: dto.notes ?? null,
          photoAssetId: dto.photoAssetId ?? null,
          imageUrl: dto.imageUrl ?? null,
          productUrl: dto.productUrl ?? null,
          storeName: dto.storeName ?? null,
          status: dto.wishStatus,
          price: dto.price,
          currency: dto.currency,
          targetPrice: dto.targetPrice ?? null,
          wardrobeId: dto.wardrobeId,
        },
        {
          before: (tx) =>
            this.guard(
              tx,
              userId,
              { ...card, size: dto.size },
              'wish',
              null,
              dto.allowDuplicate,
            ),
          after: (tx, itemId) => this.createCard(tx, userId, itemId, card, 0),
        },
      );
      return this.findOne(userId, item.id);
    }

    const attributes = await this.attributesFor(
      garmentTypeId,
      {},
      brandLabel(card.brand, card.brandName),
    );
    const id = await this.prisma.$transaction(async (tx) => {
      await this.guard(
        tx,
        userId,
        { ...card, size: dto.size },
        'owned',
        null,
        dto.allowDuplicate,
      );
      await this.plans.assertCanCreate(
        tx,
        userId,
        LimitedResource.WARDROBE_ITEMS,
      );
      const wardrobeId = await this.wishlist.wardrobeFor(
        tx,
        userId,
        dto.wardrobeId,
      );
      const item = await tx.wardrobeItem.create({
        data: {
          userId,
          wardrobeId,
          garmentTypeId,
          name,
          color,
          size: dto.size ?? null,
          notes: dto.notes ?? null,
          imageUrl: dto.imageUrl ?? null,
          photoAssetId: dto.photoAssetId ?? null,
          storeName: dto.storeName ?? null,
          purchasePrice: dto.purchasePrice ?? null,
          currency:
            dto.purchasePrice != null
              ? (dto.currency ?? 'EUR')
              : (dto.currency ?? null),
          purchaseDate: this.date(dto.purchaseDate),
          attributes: attributes as Prisma.InputJsonObject,
        },
        select: { id: true },
      });
      await this.createCard(tx, userId, item.id, card, dto.wearCount ?? 0);
      return item.id;
    });
    return this.findOne(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateSneakerDto) {
    const existing = await this.prisma.wardrobeItem.findFirst({
      where: { id, userId, sneaker: { isNot: null } },
      select: {
        id: true,
        size: true,
        attributes: true,
        garmentTypeId: true,
        photoAssetId: true,
        wishlistStatus: true,
        sneaker: {
          select: { brand: true, brandName: true, model: true, colorway: true },
        },
      },
    });
    if (!existing) throw new NotFoundException('Sneaker not found');
    if (dto.photoAssetId)
      await this.assets.assertOwned(userId, [dto.photoAssetId]);
    const before = existing.sneaker!;
    const next: SneakerIdentity = {
      brand: dto.brand ?? before.brand,
      brandName: dto.brandName !== undefined ? dto.brandName : before.brandName,
      model: dto.model ?? before.model,
      colorway: dto.colorway !== undefined ? dto.colorway : before.colorway,
      size: dto.size !== undefined ? dto.size : existing.size,
    };
    if (next.brand === 'OTHER' && !next.brandName)
      throw new BadRequestException(
        'brandName is required when brand is OTHER',
      );
    const identityChanged = !sameSneaker(next, {
      ...before,
      size: existing.size,
    });
    const labelChanged =
      next.brand !== before.brand ||
      next.brandName !== before.brandName ||
      next.model !== before.model;
    const garmentTypeId = dto.garmentTypeId
      ? await this.footwearType(dto.garmentTypeId)
      : existing.garmentTypeId;
    const attributes =
      labelChanged || garmentTypeId !== existing.garmentTypeId
        ? await this.attributesFor(
            garmentTypeId,
            garmentTypeId === existing.garmentTypeId
              ? (existing.attributes as Record<string, unknown>)
              : {},
            brandLabel(next.brand, next.brandName),
          )
        : undefined;
    const scope: Scope = existing.wishlistStatus ? 'wish' : 'owned';

    await this.prisma.$transaction(async (tx) => {
      if (identityChanged)
        await this.guard(tx, userId, next, scope, id, dto.allowDuplicate);
      await tx.wardrobeItem.update({
        where: { id_userId: { id, userId } },
        data: {
          name: labelChanged
            ? this.nameFor(next as Required<SneakerIdentity>)
            : undefined,
          garmentTypeId:
            garmentTypeId !== existing.garmentTypeId
              ? garmentTypeId
              : undefined,
          attributes: attributes as Prisma.InputJsonObject | undefined,
          color: dto.color,
          size: dto.size,
          notes: dto.notes,
          imageUrl: dto.imageUrl,
          photoAssetId: dto.photoAssetId,
          storeName: dto.storeName,
          // Compra: solo para los pares que ya son tuyos.
          purchasePrice: scope === 'owned' ? dto.purchasePrice : undefined,
          currency: scope === 'owned' ? dto.currency : undefined,
          purchaseDate:
            scope === 'owned' && dto.purchaseDate !== undefined
              ? this.date(dto.purchaseDate)
              : undefined,
        },
      });
      await tx.sneakerDetails.update({
        where: { itemId_userId: { itemId: id, userId } },
        data: {
          brand: dto.brand,
          brandName: next.brand === 'OTHER' ? next.brandName : null,
          model: dto.model,
          colorway: dto.colorway,
          condition: dto.condition,
          wearCount: dto.wearCount,
        },
      });
    });
    if (
      dto.photoAssetId !== undefined &&
      existing.photoAssetId &&
      existing.photoAssetId !== dto.photoAssetId
    ) {
      await this.assets.removeIfUnused(userId, existing.photoAssetId);
    }
    return this.findOne(userId, id);
  }

  /**
   * Borra el par (la prenda, con su ficha; los outfits lo pierden). Con
   * `keepItem`, solo quita la ficha: la prenda sigue en tu armario.
   */
  async remove(userId: string, id: string, keepItem = false): Promise<void> {
    const existing = await this.prisma.wardrobeItem.findFirst({
      where: { id, userId, sneaker: { isNot: null } },
      select: { photoAssetId: true },
    });
    if (!existing) throw new NotFoundException('Sneaker not found');
    if (keepItem) {
      await this.prisma.sneakerDetails.deleteMany({
        where: { itemId: id, userId },
      });
      return;
    }
    await this.prisma.wardrobeItem.deleteMany({ where: { id, userId } });
    if (existing.photoAssetId)
      await this.assets.removeIfUnused(userId, existing.photoAssetId);
  }

  /** +1 / -1 uso apuntado a mano (nunca baja de 0). Solo pares que tienes. */
  async wear(userId: string, id: string, delta: 1 | -1) {
    const where = { itemId: id, userId, item: ownedWhere };
    const { count } =
      delta > 0
        ? await this.prisma.sneakerDetails.updateMany({
            where,
            data: { wearCount: { increment: 1 } },
          })
        : await this.prisma.sneakerDetails.updateMany({
            where: { ...where, wearCount: { gt: 0 } },
            data: { wearCount: { decrement: 1 } },
          });
    if (!count) {
      const exists = await this.prisma.sneakerDetails.count({ where });
      if (!exists) throw new NotFoundException('Sneaker not found');
    }
    return this.findOne(userId, id);
  }

  /** Añade la ficha a unas zapatillas que ya estaban en tu armario (sin crear otra prenda). */
  async adopt(userId: string, itemId: string, dto: SneakerCardDto) {
    const card = this.requireCard(dto);
    const item = await this.prisma.wardrobeItem.findFirst({
      where: { id: itemId, userId, ...ownedWhere },
      select: {
        id: true,
        size: true,
        attributes: true,
        garmentTypeId: true,
        garmentType: { select: { category: true } },
        sneaker: { select: { itemId: true } },
      },
    });
    if (!item) throw new NotFoundException('Wardrobe item not found');
    if (item.garmentType.category !== 'FOOTWEAR')
      throw new BadRequestException(
        'Only footwear can join the sneaker collection',
      );
    if (item.sneaker)
      throw new ConflictException({
        message: 'This item is already in your collection',
        code: 'already_in_collection',
      });
    const attributes = await this.attributesFor(
      item.garmentTypeId,
      item.attributes as Record<string, unknown>,
      brandLabel(card.brand, card.brandName),
    );
    await this.prisma.$transaction(async (tx) => {
      await this.guard(
        tx,
        userId,
        { ...card, size: item.size },
        'owned',
        itemId,
        dto.allowDuplicate,
      );
      await tx.wardrobeItem.update({
        where: { id_userId: { id: itemId, userId } },
        data: { attributes: attributes as Prisma.InputJsonObject },
      });
      await this.createCard(tx, userId, itemId, card, dto.wearCount ?? 0);
    });
    return this.findOne(userId, itemId);
  }

  // --- Ayudas --------------------------------------------------------------

  private view(row: SneakerRow, usage: ReturnType<typeof usageOf>) {
    const u = usage.get(row.id) ?? { calendar: 0, outfits: 0, partners: 0 };
    const s = row.sneaker!;
    return {
      ...row,
      sneaker: { ...s, brandLabel: brandLabel(s.brand, s.brandName) },
      colorName: colorName(row.color),
      uses: {
        manual: s.wearCount,
        calendar: u.calendar,
        total: s.wearCount + u.calendar,
      },
      outfitCount: u.outfits,
      partners: u.partners,
    };
  }

  /** Outfits guardados y días del calendario marcados como usados. */
  private async usageInput(userId: string): Promise<UsageInput> {
    const [outfits, worn] = await Promise.all([
      this.prisma.outfit.findMany({
        where: { userId },
        select: { id: true, items: { select: { wardrobeItemId: true } } },
      }),
      this.prisma.calendarEntry.findMany({
        where: { userId, wornAt: { not: null } },
        select: { outfitId: true, date: true },
      }),
    ]);
    return {
      outfits: outfits.map((o) => ({
        id: o.id,
        itemIds: o.items.map((i) => i.wardrobeItemId),
      })),
      worn: worn.map((w) => ({
        outfitId: w.outfitId,
        date: w.date.toISOString().slice(0, 10),
      })),
    };
  }

  /**
   * Evita duplicados sin querer. Bloquea (en la transacción) a ese usuario
   * para que dos peticiones a la vez (doble clic) no pasen las dos, y busca
   * un par con la misma marca, modelo, colorway y talla. Si lo hay, 409 con
   * los pares parecidos, salvo que se pida guardarlo igualmente.
   */
  private async guard(
    tx: Tx,
    userId: string,
    card: SneakerIdentity,
    scope: Scope,
    excludeId: string | null,
    allowDuplicate?: boolean,
  ) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sneakers:${userId}`}))`;
    if (allowDuplicate) return;
    const same = await tx.wardrobeItem.findMany({
      where: {
        userId,
        id: excludeId ? { not: excludeId } : undefined,
        sneaker: { is: { brand: card.brand } },
      },
      select: {
        id: true,
        name: true,
        size: true,
        wishlistStatus: true,
        sneaker: {
          select: { brand: true, brandName: true, model: true, colorway: true },
        },
      },
    });
    const dupes = same.filter((s) =>
      sameSneaker({ ...s.sneaker!, size: s.size }, card),
    );
    // Mismo sitio (colección o wishlist), o quieres un par que ya tienes.
    const blocking = dupes.filter((d) =>
      scope === 'owned' ? d.wishlistStatus === null : true,
    );
    if (blocking.length) {
      throw new ConflictException({
        message:
          scope === 'wish' && blocking.some((d) => d.wishlistStatus === null)
            ? 'You already own this pair'
            : 'This pair is already saved',
        code: 'duplicate_sneaker',
        duplicates: blocking.map((d) => ({
          id: d.id,
          name: d.name,
          size: d.size,
          scope: d.wishlistStatus ? 'wish' : 'owned',
        })),
      });
    }
  }

  private createCard(
    tx: Tx,
    userId: string,
    itemId: string,
    card: Required<Pick<SneakerCardDto, 'brand' | 'model'>> & SneakerCardDto,
    wearCount: number,
  ) {
    return tx.sneakerDetails
      .create({
        data: {
          itemId,
          userId,
          brand: card.brand,
          brandName: card.brand === 'OTHER' ? (card.brandName ?? null) : null,
          model: card.model,
          colorway: card.colorway ?? null,
          condition: card.condition ?? 'GOOD',
          wearCount,
        },
      })
      .then(() => undefined);
  }

  private requireCard<T extends SneakerCardDto>(
    dto: T,
  ): T & { brand: SneakerBrand; model: string } {
    if (!dto.brand) throw new BadRequestException('brand is required');
    if (!dto.model || !normalize(dto.model))
      throw new BadRequestException('model is required');
    if (dto.brand === 'OTHER' && !dto.brandName)
      throw new BadRequestException(
        'brandName is required when brand is OTHER',
      );
    return dto as T & { brand: SneakerBrand; model: string };
  }

  /** «Nike Air Max 1» (lo que se ve como nombre de la prenda en el armario). */
  private nameFor(card: {
    brand: SneakerBrand;
    brandName?: string | null;
    model: string;
  }) {
    return `${brandLabel(card.brand, card.brandName)} ${card.model}`.slice(
      0,
      80,
    );
  }

  /** Tipo de calzado: el pedido (si es calzado) o Zapatillas. */
  private async footwearType(garmentTypeId?: string): Promise<string> {
    const t = garmentTypeId
      ? await this.prisma.garmentType.findUnique({
          where: { id: garmentTypeId },
          select: { id: true, category: true },
        })
      : await this.prisma.garmentType.findUnique({
          where: { code: 'SNEAKERS' },
          select: { id: true, category: true },
        });
    if (!t)
      throw new BadRequestException(
        garmentTypeId
          ? 'garmentTypeId does not exist'
          : 'Garment type SNEAKERS is missing (run the seed)',
      );
    if (t.category !== 'FOOTWEAR')
      throw new BadRequestException('garmentTypeId must be footwear');
    return t.id;
  }

  /** La marca se guarda también en los atributos (la usa STYLE ANALYTICS). */
  private async attributesFor(
    garmentTypeId: string,
    base: Record<string, unknown>,
    brand: string,
  ) {
    const schema = await this.garmentTypes.getSchemaOrThrow(garmentTypeId);
    const r = validateAttributes(schema, {
      ...base,
      brand: brand.slice(0, 60),
    });
    if (!r.ok) throw new BadRequestException(r.errors);
    return r.value;
  }

  /** «YYYY-MM-DD» a fecha; no se aceptan fechas futuras. */
  private date(value: string | null | undefined): Date | null {
    if (!value) return null;
    const d = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(d.getTime()))
      throw new BadRequestException('purchaseDate is not a valid date');
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (d > tomorrow)
      throw new BadRequestException('purchaseDate cannot be in the future');
    return d;
  }
}
