import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LimitedResource, Prisma } from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { paginate, toSkipTake } from '../common/pagination';
import {
  sanitizeForModel,
  validateCustomization,
} from '../customization/customization';
import {
  AttributeSchema,
  validateAttributes,
} from '../garment-types/attribute-schema';
import {
  GarmentTypesService,
  garmentTypeSummarySelect,
} from '../garment-types/garment-types.service';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWardrobeItemDto } from './dto/create-wardrobe-item.dto';
import {
  ItemSort,
  ListWardrobeItemsQueryDto,
} from './dto/list-wardrobe-items-query.dto';
import { brandKey, brandOf, colorGroup, computeFacets } from './item-facets';
import { UpdateWardrobeItemDto } from './dto/update-wardrobe-item.dto';

export const wardrobeItemSelect = {
  id: true,
  name: true,
  color: true,
  size: true,
  season: true,
  notes: true,
  imageUrl: true,
  modelUrl: true,
  attributes: true,
  customization: true,
  styles: true,
  productName: true,
  storeName: true,
  purchasePlatform: true,
  productUrl: true,
  productRef: true,
  purchasePrice: true,
  currency: true,
  purchaseDate: true,
  wishlistStatus: true,
  photoAssetId: true,
  isFavorite: true,
  /** Ficha de SNEAKER COLLECTION (null si no es una zapatilla fichada). */
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
  createdAt: true,
  updatedAt: true,
  wardrobe: { select: { id: true, name: true } },
  garmentType: { select: garmentTypeSummarySelect },
} satisfies Prisma.WardrobeItemSelect;

/**
 * Estilos y datos de compra del DTO para Prisma: lo que no llega no cambia
 * (undefined) y null lo borra. Al crear, un precio sin moneda se guarda en euros.
 */
function purchaseData(
  dto: CreateWardrobeItemDto | UpdateWardrobeItemDto,
  isCreate = false,
) {
  const date =
    dto.purchaseDate === undefined
      ? undefined
      : dto.purchaseDate === null
        ? null
        : new Date(`${dto.purchaseDate}T00:00:00Z`);
  const currency =
    dto.currency !== undefined
      ? dto.currency
      : isCreate && dto.purchasePrice != null
        ? 'EUR'
        : undefined;
  return {
    styles: dto.styles ?? undefined,
    productName: dto.productName,
    storeName: dto.storeName,
    purchasePlatform: dto.purchasePlatform,
    productUrl: dto.productUrl,
    productRef: dto.productRef,
    purchasePrice: dto.purchasePrice,
    currency,
    purchaseDate: date,
  };
}

/** Orden de los listados (el id desempata para que la paginación sea estable). */
const ORDER: Record<ItemSort, Prisma.WardrobeItemOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  name: [{ name: 'asc' }, { id: 'asc' }],
  favorites: [{ isFavorite: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
};

@Injectable()
export class WardrobeItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly garmentTypes: GarmentTypesService,
    private readonly assets: AssetsService,
  ) {}

  async findAll(userId: string, query: ListWardrobeItemsQueryDto) {
    const where: Prisma.WardrobeItemWhereInput = {
      userId,
      // Por defecto solo el armario; el vestidor pide también la wishlist.
      wishlistStatus:
        query.wishlist === 'include'
          ? undefined
          : query.wishlist === 'only'
            ? { not: null }
            : null,
      wardrobeId: query.wardrobeId,
      garmentTypeId: query.garmentTypeId,
      season: query.season,
      garmentType: query.category ? { category: query.category } : undefined,
      name: query.search
        ? { contains: query.search, mode: 'insensitive' }
        : undefined,
      isFavorite: query.favorite,
    };
    // Marca y grupo de color se calculan en el código (la marca vive en un
    // JSON y el grupo sale del color exacto): primero se buscan las prendas
    // que cumplen el resto de filtros y luego se paginan solo las que encajan.
    if (query.brand || query.color) {
      const wanted = query.brand ? brandKey(query.brand) : null;
      const candidates = await this.prisma.wardrobeItem.findMany({
        where,
        select: {
          id: true,
          color: true,
          attributes: true,
          sneaker: { select: { brand: true, brandName: true } },
        },
      });
      where.id = {
        in: candidates
          .filter((c) => {
            if (query.color && colorGroup(c.color) !== query.color)
              return false;
            if (wanted) {
              const b = brandOf(c);
              if (!b || brandKey(b) !== wanted) return false;
            }
            return true;
          })
          .map((c) => c.id),
      };
    }
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.wardrobeItem.findMany({
        where,
        select: wardrobeItemSelect,
        orderBy: ORDER[query.sort ?? 'newest'],
        ...toSkipTake(query.page, query.pageSize),
      }),
      this.prisma.wardrobeItem.count({ where }),
    ]);
    return paginate(rows, total, query.page, query.pageSize);
  }

  /**
   * Resumen del armario (o de uno de sus armarios): total, favoritas,
   * categorías, tipos, marcas, colores, temporadas y última prenda añadida.
   * Solo prendas del armario (no las de la wishlist).
   */
  async facets(userId: string, wardrobeId?: string) {
    const rows = await this.prisma.wardrobeItem.findMany({
      where: { userId, wishlistStatus: null, wardrobeId },
      select: {
        id: true,
        name: true,
        color: true,
        season: true,
        attributes: true,
        isFavorite: true,
        createdAt: true,
        garmentType: {
          select: { id: true, code: true, name: true, category: true },
        },
        sneaker: { select: { brand: true, brandName: true } },
      },
    });
    return computeFacets(rows);
  }

  /** Marca o desmarca una prenda como favorita (solo las propias). */
  async setFavorite(userId: string, id: string, isFavorite: boolean) {
    const res = await this.prisma.wardrobeItem.updateMany({
      where: { id, userId },
      data: { isFavorite },
    });
    if (res.count === 0) throw new NotFoundException('Wardrobe item not found');
    return { id, isFavorite };
  }

  async findOne(userId: string, id: string) {
    const item = await this.prisma.wardrobeItem.findFirst({
      where: { id, userId },
      select: wardrobeItemSelect,
    });
    if (!item) throw new NotFoundException('Wardrobe item not found');
    return item;
  }

  async create(userId: string, dto: CreateWardrobeItemDto) {
    const schema = await this.garmentTypes.getSchemaOrThrow(dto.garmentTypeId);
    const attributes = this.validateAttributesOrThrow(schema, dto.attributes);
    const modelKey = await this.garmentTypes.getModelKeyOrThrow(
      dto.garmentTypeId,
    );
    const customization = await this.validateCustomizationOrThrow(
      userId,
      modelKey,
      dto.customization,
    );
    await this.assertWardrobeOwned(userId, dto.wardrobeId);

    return this.prisma.$transaction(async (tx) => {
      await this.plans.assertCanCreate(
        tx,
        userId,
        LimitedResource.WARDROBE_ITEMS,
      );
      return tx.wardrobeItem.create({
        data: {
          userId,
          wardrobeId: dto.wardrobeId,
          garmentTypeId: dto.garmentTypeId,
          name: dto.name,
          color: dto.color,
          size: dto.size ?? null,
          season: dto.season ?? undefined,
          notes: dto.notes ?? null,
          imageUrl: dto.imageUrl ?? null,
          modelUrl: dto.modelUrl ?? null,
          attributes,
          customization,
          ...purchaseData(dto, true),
        },
        select: wardrobeItemSelect,
      });
    });
  }

  async update(userId: string, id: string, dto: UpdateWardrobeItemDto) {
    const existing = await this.prisma.wardrobeItem.findFirst({
      where: { id, userId },
      select: {
        wardrobeId: true,
        garmentTypeId: true,
        attributes: true,
        customization: true,
      },
    });
    if (!existing) throw new NotFoundException('Wardrobe item not found');

    if (dto.wardrobeId && dto.wardrobeId !== existing.wardrobeId) {
      await this.assertWardrobeOwned(userId, dto.wardrobeId);
    }

    // Si cambia el tipo de prenda, los atributos se validan contra el
    // esquema del tipo NUEVO (aunque no se envíen atributos nuevos).
    const garmentTypeId = dto.garmentTypeId ?? existing.garmentTypeId;
    const typeChanged = garmentTypeId !== existing.garmentTypeId;
    let attributes: Prisma.InputJsonObject | undefined;
    if (dto.attributes !== undefined || typeChanged) {
      const schema = await this.garmentTypes.getSchemaOrThrow(garmentTypeId);
      attributes = this.validateAttributesOrThrow(
        schema,
        dto.attributes !== undefined ? dto.attributes : existing.attributes,
      );
    }

    // Personalización: si llega, se valida para el tipo (nuevo o actual). Si
    // solo cambia el tipo, se conservan los detalles y se quitan colores y
    // piezas que el tipo nuevo no tiene.
    let customization: Prisma.InputJsonObject | undefined;
    if (dto.customization !== undefined) {
      const modelKey =
        await this.garmentTypes.getModelKeyOrThrow(garmentTypeId);
      customization = await this.validateCustomizationOrThrow(
        userId,
        modelKey,
        dto.customization,
      );
    } else if (typeChanged) {
      const modelKey =
        await this.garmentTypes.getModelKeyOrThrow(garmentTypeId);
      customization = sanitizeForModel(
        existing.customization,
        modelKey,
      ) as Prisma.InputJsonObject;
    }

    return this.prisma.wardrobeItem.update({
      where: { id_userId: { id, userId } },
      data: {
        wardrobeId: dto.wardrobeId ?? undefined,
        garmentTypeId,
        name: dto.name ?? undefined,
        color: dto.color ?? undefined,
        season: dto.season ?? undefined,
        size: dto.size,
        notes: dto.notes,
        imageUrl: dto.imageUrl,
        modelUrl: dto.modelUrl,
        attributes,
        customization,
        ...purchaseData(dto),
      },
      select: wardrobeItemSelect,
    });
  }

  /** Borra la prenda. Desaparece también de los outfits que la usaban. */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.wardrobeItem.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw new NotFoundException('Wardrobe item not found');
  }

  private async assertWardrobeOwned(
    userId: string,
    wardrobeId: string,
  ): Promise<void> {
    const wardrobe = await this.prisma.wardrobe.findFirst({
      where: { id: wardrobeId, userId },
      select: { id: true },
    });
    if (!wardrobe) {
      throw new BadRequestException('wardrobeId does not exist');
    }
  }

  private async validateCustomizationOrThrow(
    userId: string,
    modelKey: string,
    input: unknown,
  ): Promise<Prisma.InputJsonObject> {
    const result = validateCustomization(input, modelKey);
    if (!result.ok) throw new BadRequestException(result.errors);
    // Las imágenes deben ser del propio usuario.
    await this.assets.assertOwned(userId, result.assetIds);
    return result.value as Prisma.InputJsonObject;
  }

  private validateAttributesOrThrow(
    schema: AttributeSchema,
    input: unknown,
  ): Prisma.InputJsonObject {
    const result = validateAttributes(schema, input);
    if (!result.ok) {
      throw new BadRequestException(result.errors);
    }
    return result.value;
  }
}
