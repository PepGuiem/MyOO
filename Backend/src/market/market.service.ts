import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ListingKind, ListingStatus, Prisma } from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { ChatService } from '../chat/chat.service';
import { banSelect, isBanned, notBannedWhere } from '../common/ban';
import { paginate, toSkipTake } from '../common/pagination';
import { garmentTypeSummarySelect } from '../garment-types/garment-types.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { toBrief, userBriefSelect, type UserBrief } from '../social/user-brief';
import type {
  CreateListingDto,
  ListListingsQueryDto,
  UpdateListingDto,
} from './dto/market.dto';
import {
  contactMessage,
  listingProblem,
  MAX_OPEN_LISTINGS,
} from './market.rules';

const listingSelect = (viewerId: string) =>
  ({
    id: true,
    userId: true,
    kind: true,
    title: true,
    description: true,
    category: true,
    brand: true,
    size: true,
    condition: true,
    price: true,
    currency: true,
    city: true,
    swapFor: true,
    itemId: true,
    garment: true,
    status: true,
    hiddenByAdmin: true,
    createdAt: true,
    updatedAt: true,
    user: { select: { ...userBriefSelect, ...banSelect, messagePolicy: true } },
    photos: { orderBy: { position: 'asc' }, select: { assetId: true } },
    favorites: { where: { userId: viewerId }, select: { userId: true } },
    _count: { select: { favorites: true } },
  }) satisfies Prisma.ListingSelect;

type ListingRow = Prisma.ListingGetPayload<{
  select: ReturnType<typeof listingSelect>;
}>;

export interface ListingView {
  id: string;
  kind: ListingKind;
  title: string;
  description: string | null;
  category: string;
  brand: string | null;
  size: string | null;
  condition: string;
  price: string | null;
  currency: string;
  city: string | null;
  swapFor: string | null;
  itemId: string | null;
  /** Copia de la prenda para el 3D (null si se creó a mano sin prenda). */
  garment: unknown;
  status: ListingStatus;
  /** Ids de las fotos; se piden a /market/:id/photos/:assetId. */
  photos: string[];
  seller: UserBrief;
  isMine: boolean;
  isFavorite: boolean;
  favorites: number;
  /** Si puedes escribir a quien vende desde el anuncio. */
  canContact: boolean;
  hiddenByAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Lo que se copia de la prenda del armario para enseñarla en 3D. */
const garmentSnapshotSelect = {
  id: true,
  name: true,
  color: true,
  attributes: true,
  customization: true,
  photoAssetId: true,
  wishlistStatus: true,
  garmentType: { select: garmentTypeSummarySelect },
} satisfies Prisma.WardrobeItemSelect;

/**
 * STREET MARKET: anuncios para vender o intercambiar ropa y zapatillas.
 *  - Sin pagos ni datos de tarjeta: quien compra escribe a quien vende por el
 *    chat (POST /market/:id/contact) y lo acuerdan entre ellos.
 *  - Las fotos son imágenes del vendedor (claves compuestas en la base de
 *    datos) y se sirven por /market/:id/photos/:assetId solo a quien puede ver
 *    el anuncio.
 *  - Bloqueos y cuentas suspendidas: sus anuncios no se ven.
 */
@Injectable()
export class MarketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: AssetsService,
    private readonly storage: StorageService,
    private readonly chat: ChatService,
  ) {}

  async list(userId: string, q: ListListingsQueryDto) {
    const scope = q.scope ?? 'all';
    const where: Prisma.ListingWhereInput = {};
    if (scope === 'mine') {
      where.userId = userId;
      if (q.status) where.status = q.status;
    } else {
      const hidden = await this.hiddenPeople(userId);
      where.hiddenByAdmin = false;
      where.user = notBannedWhere();
      if (hidden.length) where.userId = { notIn: hidden };
      where.status = { in: [ListingStatus.ACTIVE, ListingStatus.RESERVED] };
      if (scope === 'favorites') {
        where.favorites = { some: { userId } };
        // En guardados también se ven los vendidos (para saber qué pasó).
        where.status = q.status ?? undefined;
      }
    }
    if (q.category) where.category = q.category;
    if (q.kind) where.kind = q.kind;
    if (q.condition) where.condition = q.condition;
    if (q.size) where.size = { equals: q.size, mode: 'insensitive' };
    if (q.city) where.city = { contains: q.city, mode: 'insensitive' };
    if (q.minPrice !== undefined || q.maxPrice !== undefined) {
      where.price = {
        ...(q.minPrice !== undefined ? { gte: q.minPrice } : {}),
        ...(q.maxPrice !== undefined ? { lte: q.maxPrice } : {}),
      };
    }
    if (q.search) {
      where.AND = [
        {
          OR: [
            { title: { contains: q.search, mode: 'insensitive' } },
            { brand: { contains: q.search, mode: 'insensitive' } },
            { description: { contains: q.search, mode: 'insensitive' } },
          ],
        },
      ];
    }
    const orderBy: Prisma.ListingOrderByWithRelationInput[] =
      q.sort === 'price_asc'
        ? [{ price: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }]
        : q.sort === 'price_desc'
          ? [{ price: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }]
          : [{ createdAt: 'desc' }, { id: 'asc' }];
    const { skip, take } = toSkipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        orderBy,
        skip,
        take,
        select: listingSelect(userId),
      }),
      this.prisma.listing.count({ where }),
    ]);
    return paginate(
      rows.map((r) => this.toView(r, userId)),
      total,
      q.page,
      q.pageSize,
    );
  }

  /** Cuántos anuncios tienes por estado (y el límite). */
  async summary(userId: string) {
    const rows = await this.prisma.listing.groupBy({
      by: ['status'],
      where: { userId },
      _count: { _all: true },
    });
    const by = Object.fromEntries(
      rows.map((r) => [r.status, r._count._all]),
    ) as Partial<Record<ListingStatus, number>>;
    const favorites = await this.prisma.listingFavorite.count({
      where: { userId },
    });
    return {
      active: by.ACTIVE ?? 0,
      reserved: by.RESERVED ?? 0,
      sold: by.SOLD ?? 0,
      favorites,
      limit: MAX_OPEN_LISTINGS,
    };
  }

  async findOne(userId: string, id: string): Promise<ListingView> {
    return this.toView(await this.visibleRow(userId, id), userId);
  }

  async create(userId: string, dto: CreateListingDto): Promise<ListingView> {
    const price = dto.price ?? null;
    let photoIds = dto.photoAssetIds ?? [];
    this.check(dto.kind, price, photoIds);

    let garment: Prisma.InputJsonValue | undefined;
    if (dto.itemId) {
      const item = await this.ownItem(userId, dto.itemId);
      garment = snapshotOf(item);
      if (photoIds.length === 0 && item.photoAssetId)
        photoIds = [item.photoAssetId];
    }

    const id = await this.prisma.$transaction(async (tx) => {
      // Un cerrojo por persona: dos anuncios a la vez no se saltan el límite.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'market:' + userId}))`;
      const open = await tx.listing.count({
        where: {
          userId,
          status: { in: [ListingStatus.ACTIVE, ListingStatus.RESERVED] },
        },
      });
      if (open >= MAX_OPEN_LISTINGS) {
        throw new ConflictException({
          message: `You can have at most ${MAX_OPEN_LISTINGS} open listings`,
          code: 'too_many_listings',
          limit: MAX_OPEN_LISTINGS,
        });
      }
      await this.assets.assertOwned(userId, photoIds, tx);
      const l = await tx.listing.create({
        data: {
          userId,
          kind: dto.kind,
          title: dto.title,
          description: dto.description ?? null,
          category: dto.category,
          brand: dto.brand ?? null,
          size: dto.size ?? null,
          condition: dto.condition,
          price,
          currency: dto.currency ?? 'EUR',
          city: dto.city ?? null,
          swapFor: dto.kind === ListingKind.SWAP ? (dto.swapFor ?? null) : null,
          itemId: dto.itemId ?? null,
          garment,
          photos: {
            create: photoIds.map((assetId, position) => ({
              assetId,
              position,
            })),
          },
        },
        select: { id: true },
      });
      return l.id;
    });
    return this.findOne(userId, id);
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateListingDto,
  ): Promise<ListingView> {
    const current = await this.prisma.listing.findFirst({
      where: { id, userId },
      select: {
        kind: true,
        price: true,
        photos: { select: { assetId: true } },
      },
    });
    if (!current) throw new NotFoundException('Listing not found');
    const kind = dto.kind ?? current.kind;
    const price =
      dto.price !== undefined
        ? dto.price
        : current.price === null
          ? null
          : Number(current.price);
    this.check(kind, price, dto.photoAssetIds);

    let garment: Prisma.InputJsonValue | undefined;
    if (dto.itemId)
      garment = snapshotOf(await this.ownItem(userId, dto.itemId));
    const before = current.photos.map((p) => p.assetId);

    await this.prisma.$transaction(async (tx) => {
      if (dto.status && dto.status !== ListingStatus.SOLD) {
        // Volver a activar cuenta para el límite de anuncios abiertos.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'market:' + userId}))`;
        const open = await tx.listing.count({
          where: {
            userId,
            id: { not: id },
            status: { in: [ListingStatus.ACTIVE, ListingStatus.RESERVED] },
          },
        });
        if (open >= MAX_OPEN_LISTINGS) {
          throw new ConflictException({
            message: `You can have at most ${MAX_OPEN_LISTINGS} open listings`,
            code: 'too_many_listings',
          });
        }
      }
      if (dto.photoAssetIds) {
        await this.assets.assertOwned(userId, dto.photoAssetIds, tx);
        await tx.listingPhoto.deleteMany({ where: { listingId: id } });
        await tx.listingPhoto.createMany({
          data: dto.photoAssetIds.map((assetId, position) => ({
            listingId: id,
            userId,
            assetId,
            position,
          })),
        });
      }
      await tx.listing.update({
        where: { id },
        data: {
          kind: dto.kind,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          brand: dto.brand,
          size: dto.size,
          condition: dto.condition,
          price: dto.price,
          currency: dto.currency,
          city: dto.city,
          swapFor: kind === ListingKind.SWAP ? dto.swapFor : null,
          status: dto.status,
          ...(dto.itemId ? { itemId: dto.itemId, garment } : {}),
        },
      });
    });
    if (dto.photoAssetIds)
      await this.cleanup(
        userId,
        before.filter((a) => !dto.photoAssetIds!.includes(a)),
      );
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    const l = await this.prisma.listing.findFirst({
      where: { id, userId },
      select: { photos: { select: { assetId: true } } },
    });
    if (!l) throw new NotFoundException('Listing not found');
    await this.prisma.listing.delete({ where: { id } });
    await this.cleanup(
      userId,
      l.photos.map((p) => p.assetId),
    );
  }

  async setFavorite(userId: string, id: string, on: boolean) {
    const row = await this.visibleRow(userId, id);
    if (row.userId === userId) {
      throw new BadRequestException({
        message: 'You cannot save your own listing',
        code: 'own_listing',
      });
    }
    if (on) {
      await this.prisma.listingFavorite.upsert({
        where: { listingId_userId: { listingId: id, userId } },
        create: { listingId: id, userId },
        update: {},
      });
    } else {
      await this.prisma.listingFavorite.deleteMany({
        where: { listingId: id, userId },
      });
    }
    const favorites = await this.prisma.listingFavorite.count({
      where: { listingId: id },
    });
    return { isFavorite: on, favorites };
  }

  /** Escribe a quien vende: abre (o reutiliza) el chat 1 a 1 con un primer mensaje. */
  async contact(userId: string, id: string, text?: string | null) {
    const row = await this.visibleRow(userId, id);
    if (row.userId === userId) {
      throw new BadRequestException({
        message: 'This is your own listing',
        code: 'own_listing',
      });
    }
    if (row.status === ListingStatus.SOLD) {
      throw new ConflictException({
        message: 'This listing is already sold',
        code: 'sold',
      });
    }
    const { conversationId } = await this.chat.contactSeller(
      userId,
      row.userId,
      contactMessage(row, text),
    );
    return { conversationId };
  }

  /** Foto de un anuncio, solo para quien puede ver el anuncio. */
  async photo(
    userId: string,
    id: string,
    assetId: string,
  ): Promise<{ data: Buffer; mimeType: string }> {
    const row = await this.visibleRow(userId, id);
    if (!row.photos.some((p) => p.assetId === assetId))
      throw new NotFoundException('Image not found');
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId: row.userId },
      select: { storageKey: true, mimeType: true },
    });
    const data = asset ? await this.storage.get(asset.storageKey) : null;
    if (!asset || !data) throw new NotFoundException('Image not found');
    return { data, mimeType: asset.mimeType };
  }

  // ---------------------------------------------------------------------------
  // Ayudantes
  // ---------------------------------------------------------------------------

  private check(
    kind: ListingKind,
    price: number | null,
    photoIds?: string[],
  ): void {
    const problem = listingProblem({ kind, price, photoIds });
    if (problem === 'price_required') {
      throw new BadRequestException({
        message: 'A price is required to sell',
        code: problem,
      });
    }
    if (problem)
      throw new BadRequestException({
        message: 'Invalid photos',
        code: problem,
      });
  }

  private async ownItem(userId: string, itemId: string) {
    const item = await this.prisma.wardrobeItem.findFirst({
      where: { id: itemId, userId },
      select: garmentSnapshotSelect,
    });
    if (!item) throw new NotFoundException('Garment not found');
    if (item.wishlistStatus) {
      throw new BadRequestException({
        message: 'You cannot sell something from your wishlist',
        code: 'wishlist_item',
      });
    }
    return item;
  }

  /** Anuncio que puedes ver (los tuyos siempre). */
  private async visibleRow(userId: string, id: string): Promise<ListingRow> {
    const row = await this.prisma.listing.findUnique({
      where: { id },
      select: listingSelect(userId),
    });
    if (!row) throw new NotFoundException('Listing not found');
    if (row.userId === userId) return row;
    if (
      row.hiddenByAdmin ||
      isBanned(row.user) ||
      (await this.hiddenPeople(userId)).includes(row.userId)
    ) {
      throw new NotFoundException('Listing not found');
    }
    return row;
  }

  private async hiddenPeople(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return [
      ...new Set(
        rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)),
      ),
    ];
  }

  /**
   * Borra las fotos que el anuncio ya no usa si nada más las usa (otra prenda
   * u otro anuncio). La foto y la portada del perfil nunca se tocan.
   */
  private async cleanup(userId: string, assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) return;
    const me = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarAssetId: true, coverAssetId: true },
    });
    for (const a of assetIds) {
      if (a === me?.avatarAssetId || a === me?.coverAssetId) continue;
      await this.assets.removeIfUnused(userId, a);
    }
  }

  private toView(r: ListingRow, userId: string): ListingView {
    const isMine = r.userId === userId;
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      description: r.description,
      category: r.category,
      brand: r.brand,
      size: r.size,
      condition: r.condition,
      price: r.price === null ? null : r.price.toString(),
      currency: r.currency,
      city: r.city,
      swapFor: r.swapFor,
      itemId: isMine ? r.itemId : null,
      garment: r.garment,
      status: r.status,
      photos: r.photos.map((p) => p.assetId),
      seller: toBrief(r.user),
      isMine,
      isFavorite: r.favorites.length > 0,
      favorites: r._count.favorites,
      canContact:
        !isMine &&
        r.status !== ListingStatus.SOLD &&
        r.user.messagePolicy !== 'NOBODY',
      hiddenByAdmin: r.hiddenByAdmin,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

function snapshotOf(item: {
  name: string;
  color: string;
  attributes: Prisma.JsonValue;
  customization: Prisma.JsonValue;
  garmentType: unknown;
}): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify({
      name: item.name,
      color: item.color,
      attributes: item.attributes,
      customization: item.customization,
      garmentType: item.garmentType,
    }),
  ) as Prisma.InputJsonValue;
}
