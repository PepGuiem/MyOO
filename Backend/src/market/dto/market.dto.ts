import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ListingCondition,
  ListingKind,
  ListingStatus,
  WishlistCategory,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { MAX_PHOTOS } from '../market.rules';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const MONEY = {
  maxDecimalPlaces: 2,
  allowNaN: false,
  allowInfinity: false,
} as const;
const MAX_MONEY = 99_999_999;

export const MARKET_SORTS = ['new', 'price_asc', 'price_desc'] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

export class ListListingsQueryDto extends PaginationQueryDto {
  /** all (por defecto): el market · mine: tus anuncios · favorites: tus guardados. */
  @IsOptional()
  @IsIn(['all', 'mine', 'favorites'])
  scope?: 'all' | 'mine' | 'favorites';

  @ApiPropertyOptional({ enum: WishlistCategory })
  @IsOptional()
  @IsEnum(WishlistCategory)
  category?: WishlistCategory;

  @ApiPropertyOptional({ enum: ListingKind })
  @IsOptional()
  @IsEnum(ListingKind)
  kind?: ListingKind;

  @ApiPropertyOptional({ enum: ListingCondition })
  @IsOptional()
  @IsEnum(ListingCondition)
  condition?: ListingCondition;

  /** Solo en «mine»: filtra por estado (en el market general salen activos y reservados). */
  @ApiPropertyOptional({ enum: ListingStatus })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  size?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  maxPrice?: number;

  /** Busca en título, marca y descripción. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ enum: MARKET_SORTS })
  @IsOptional()
  @IsIn(MARKET_SORTS)
  sort?: MarketSort;
}

export class CreateListingDto {
  @IsEnum(ListingKind)
  kind!: ListingKind;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsEnum(WishlistCategory)
  category!: WishlistCategory;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  brand?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  size?: string | null;

  @IsEnum(ListingCondition)
  condition!: ListingCondition;

  /** Obligatorio para vender. Para intercambiar es orientativo (o null). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  price?: number | null;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be an ISO 4217 code like EUR',
  })
  currency?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  city?: string | null;

  /** Qué te gustaría a cambio (intercambios). */
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  swapFor?: string | null;

  /** Tus imágenes (subidas antes a /assets), en orden. Máximo 6. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PHOTOS)
  @IsUUID('all', { each: true })
  photoAssetIds?: string[];

  /**
   * Prenda o zapatillas de tu armario de las que sale el anuncio: se copia su
   * modelo 3D (tipo, color y personalización) y, si no hay fotos, su foto.
   */
  @IsOptional()
  @IsUUID()
  itemId?: string;
}

export class UpdateListingDto extends PartialType(CreateListingDto) {
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;
}

export class ContactListingDto {
  /** Lo que quieras preguntar (si no, «¿Sigue disponible?»). */
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  message?: string | null;
}
