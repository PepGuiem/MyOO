import { ApiPropertyOptional } from '@nestjs/swagger';
import { OutfitStyle, Season } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { MAX_ITEMS_PER_OUTFIT } from './create-outfit.dto';
import { OutfitItemInputDto } from './outfit-item-input.dto';

/** Nota de una combinación sin guardar (lo que tienes puesto en el vestidor). */
export class RatingPreviewDto {
  @IsArray()
  @ArrayMaxSize(MAX_ITEMS_PER_OUTFIT)
  @ValidateNested({ each: true })
  @Type(() => OutfitItemInputDto)
  items!: OutfitItemInputDto[];

  @ApiPropertyOptional({ enum: OutfitStyle, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(OutfitStyle)
  style?: OutfitStyle | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(60)
  occasion?: string | null;

  @ApiPropertyOptional({ enum: Season, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(Season)
  season?: Season | null;
}

/** `?ids=a,b,c`: de 2 a 4 outfits tuyos. */
export class RatingCompareQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @IsUUID('all', { each: true })
  ids!: string[];
}

export class RatingHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
