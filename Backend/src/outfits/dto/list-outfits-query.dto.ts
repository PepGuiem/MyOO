import { ApiPropertyOptional } from '@nestjs/swagger';
import { OutfitStyle, Season } from '@prisma/client';
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
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListOutfitsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Season })
  @IsOptional()
  @IsEnum(Season)
  season?: Season;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(80)
  search?: string;

  @ApiPropertyOptional({ enum: OutfitStyle })
  @IsOptional()
  @IsEnum(OutfitStyle)
  style?: OutfitStyle;

  /** Solo favoritos (`?favorite=true`). */
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

  /** Solo los outfits que llevan esta prenda (p. ej. unas zapatillas de tu colección). */
  @IsOptional()
  @IsUUID()
  itemId?: string;

  /** new: más recientes (por defecto). old: más antiguos. name: por nombre. score: mejor nota. */
  @IsOptional()
  @IsIn(['new', 'old', 'name', 'score'])
  sort?: 'new' | 'old' | 'name' | 'score';
}
