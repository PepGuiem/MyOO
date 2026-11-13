import { ApiPropertyOptional } from '@nestjs/swagger';
import { GarmentCategory, Season } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

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
}
