import { ApiPropertyOptional } from '@nestjs/swagger';
import { WishlistCategory, WishlistStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

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

export class ListWishlistQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: WishlistStatus })
  @IsOptional()
  @IsEnum(WishlistStatus)
  status?: WishlistStatus;

  @ApiPropertyOptional({ enum: WishlistCategory })
  @IsOptional()
  @IsEnum(WishlistCategory)
  category?: WishlistCategory;

  /** Busca en nombre, marca y tienda. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  search?: string;

  /** new (por defecto), price_asc, price_desc, name. */
  @IsOptional()
  @IsIn(['new', 'price_asc', 'price_desc', 'name'])
  sort?: 'new' | 'price_asc' | 'price_desc' | 'name';
}

class WishlistFieldsDto {
  @ApiPropertyOptional({ enum: WishlistCategory })
  @IsOptional()
  @IsEnum(WishlistCategory)
  category?: WishlistCategory;

  /** Tipo de prenda del catálogo (para verla en 3D). Si no llega, se usa el de la categoría. */
  @IsOptional()
  @IsUUID()
  garmentTypeId?: string;

  @IsOptional()
  @IsHexColor()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be #RRGGBB' })
  color?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  brand?: string | null;

  /** Talla que quieres. */
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  size?: string | null;

  /** Enlace de compra (lo pone el usuario; no se visita). */
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  productUrl?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  storeName?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  /** Foto subida a /assets (tuya). null la quita. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  photoAssetId?: string | null;

  /** O la URL de una foto alojada fuera. */
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string | null;

  @ApiPropertyOptional({ enum: WishlistStatus })
  @IsOptional()
  @IsEnum(WishlistStatus)
  status?: WishlistStatus;

  /** Avisar cuando el precio baje de esto. null lo quita. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  targetPrice?: number | null;

  /** Quieres que se siga el precio cuando haya un servicio de seguimiento. */
  @IsOptional()
  @IsBoolean()
  trackPrice?: boolean;
}

/** `category` y `color` son obligatorios al crear (lo comprueba el servicio). */
export class CreateWishlistItemDto extends WishlistFieldsDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  /** Precio actual (si lo sabes). Queda como primer punto del historial. */
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  price?: number;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be an ISO 4217 code like EUR',
  })
  currency?: string;

  /** Armario al que irá cuando lo compres (por defecto, el primero). */
  @IsOptional()
  @IsUUID()
  wardrobeId?: string;
}

export class UpdateWishlistItemDto extends WishlistFieldsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsUUID()
  wardrobeId?: string;
}

export class RecordPriceDto {
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  price!: number;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be an ISO 4217 code like EUR',
  })
  currency?: string;

  /** «Rebajas», «En Zalando»... */
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class MoveToWardrobeDto {
  @IsOptional()
  @IsUUID()
  wardrobeId?: string;

  /** Lo que pagaste (por defecto, el último precio apuntado). */
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  purchasePrice?: number;

  /** YYYY-MM-DD (por defecto, hoy). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'purchaseDate must be YYYY-MM-DD',
  })
  purchaseDate?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  storeName?: string | null;
}

export class UpdateBudgetDto {
  /** Presupuesto objetivo. null lo quita. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  budget?: number | null;

  /** Lo que llevas ahorrado. */
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  saved?: number;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be an ISO 4217 code like EUR',
  })
  currency?: string;
}
