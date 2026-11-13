import { ApiPropertyOptional } from '@nestjs/swagger';
import { SneakerBrand, SneakerCondition, WishlistStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsIn,
  IsInt,
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

export class ListSneakersQueryDto extends PaginationQueryDto {
  /** owned (por defecto): tu colección. wish: las que quieres conseguir. */
  @IsOptional()
  @IsIn(['owned', 'wish'])
  scope?: 'owned' | 'wish';

  @ApiPropertyOptional({ enum: SneakerBrand })
  @IsOptional()
  @IsEnum(SneakerBrand)
  brand?: SneakerBrand;

  @ApiPropertyOptional({ enum: SneakerCondition })
  @IsOptional()
  @IsEnum(SneakerCondition)
  condition?: SneakerCondition;

  /** Busca en modelo, colorway, marca («Otras») y nombre. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  search?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  size?: string;

  /** new (por defecto), old, name, brand. */
  @IsOptional()
  @IsIn(['new', 'old', 'name', 'brand'])
  sort?: 'new' | 'old' | 'name' | 'brand';
}

/** Lo que identifica al par (se usa también al añadir una zapatilla del armario). */
export class SneakerCardDto {
  @ApiPropertyOptional({ enum: SneakerBrand })
  @IsOptional()
  @IsEnum(SneakerBrand)
  brand?: SneakerBrand;

  /** Nombre de la marca si `brand` es OTHER. */
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  brandName?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  model?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  colorway?: string | null;

  @ApiPropertyOptional({ enum: SneakerCondition })
  @IsOptional()
  @IsEnum(SneakerCondition)
  condition?: SneakerCondition;

  /** Usos apuntados a mano (los del calendario se suman solos). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  wearCount?: number;

  /** true: ya tienes un par igual y quieres guardarlo igualmente. */
  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;
}

class SneakerFieldsDto extends SneakerCardDto {
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(20)
  size?: string | null;

  /** Color principal (pinta el modelo 3D y sale en las estadísticas). */
  @IsOptional()
  @IsHexColor()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'color must be #RRGGBB' })
  color?: string;

  /** Fecha de adquisición (YYYY-MM-DD). null la quita. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'purchaseDate must be YYYY-MM-DD',
  })
  purchaseDate?: string | null;

  /** Precio de compra. null lo quita. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  purchasePrice?: number | null;

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
  @MaxLength(80)
  storeName?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  /** Tu foto (subida a /assets). null la quita. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID()
  photoAssetId?: string | null;

  /** O la URL de una foto tuya alojada fuera. */
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  imageUrl?: string | null;

  /** Tipo de calzado del catálogo para el 3D (por defecto, Zapatillas). */
  @IsOptional()
  @IsUUID()
  garmentTypeId?: string;

  @IsOptional()
  @IsUUID()
  wardrobeId?: string;
}

export class CreateSneakerDto extends SneakerFieldsDto {
  /** owned (por defecto): a tu colección. wish: a tu wishlist de sneakers. */
  @IsOptional()
  @IsIn(['owned', 'wish'])
  scope?: 'owned' | 'wish';

  // --- Solo para la wishlist ---
  /** Precio actual que has visto (primer punto del historial). */
  @IsOptional()
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  price?: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber(MONEY)
  @Min(0)
  @Max(MAX_MONEY)
  targetPrice?: number | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  productUrl?: string | null;

  @ApiPropertyOptional({ enum: WishlistStatus })
  @IsOptional()
  @IsEnum(WishlistStatus)
  wishStatus?: WishlistStatus;
}

export class UpdateSneakerDto extends SneakerFieldsDto {}

export class WearDto {
  /** +1 o -1. */
  @IsIn([1, -1])
  delta!: 1 | -1;
}
