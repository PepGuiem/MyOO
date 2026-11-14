import { ApiPropertyOptional } from '@nestjs/swagger';
import { GarmentCategory, Season } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { COLOR_GROUPS, type ColorGroup } from '../item-facets';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export const ITEM_SORTS = ['newest', 'oldest', 'name', 'favorites'] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

export class ListWardrobeItemsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  wardrobeId?: string;

  @IsOptional()
  @IsUUID()
  garmentTypeId?: string;

  @ApiPropertyOptional({ enum: GarmentCategory })
  @IsOptional()
  @IsEnum(GarmentCategory)
  category?: GarmentCategory;

  @ApiPropertyOptional({ enum: Season })
  @IsOptional()
  @IsEnum(Season)
  season?: Season;

  /** Busca por nombre (sin distinguir mayúsculas). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(80)
  search?: string;

  /** exclude (por defecto): solo el armario. include: también la wishlist. only: solo la wishlist. */
  @IsOptional()
  @IsIn(['exclude', 'include', 'only'])
  wishlist?: 'exclude' | 'include' | 'only';

  /** Solo favoritas (`?favorite=true`). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' || value === true
      ? true
      : value === 'false' || value === false
        ? false
        : value,
  )
  @IsBoolean()
  favorite?: boolean;

  /** Marca (sin distinguir mayúsculas ni espacios de más). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(60)
  brand?: string;

  /** Grupo de color (negro, blanco, azul…), ver `COLOR_GROUPS`. */
  @ApiPropertyOptional({ enum: COLOR_GROUPS })
  @IsOptional()
  @IsIn(COLOR_GROUPS)
  color?: ColorGroup;

  /** Orden: más nuevas (por defecto), más antiguas, por nombre o favoritas primero. */
  @ApiPropertyOptional({ enum: ITEM_SORTS })
  @IsOptional()
  @IsIn(ITEM_SORTS)
  sort?: ItemSort;
}

/** `?wardrobeId=` opcional para el resumen del armario. */
export class WardrobeFacetsQueryDto {
  @IsOptional()
  @IsUUID()
  wardrobeId?: string;
}
