import { ApiPropertyOptional } from '@nestjs/swagger';
import { OutfitStyle, Season } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { OutfitItemInputDto } from './outfit-item-input.dto';

export const MAX_ITEMS_PER_OUTFIT = 20;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateOutfitDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Ocasión libre: "Trabajo", "Boda", "Diario"... */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  occasion?: string;

  @ApiPropertyOptional({ enum: Season })
  @IsOptional()
  @IsEnum(Season)
  season?: Season;

  /** Que se vea en tu perfil (para quien pueda ver tu perfil). */
  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  /** Estilo del outfit (streetwear, techwear...). null lo quita. */
  @ApiPropertyOptional({ enum: OutfitStyle, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(OutfitStyle)
  style?: OutfitStyle | null;

  /** Favorito. */
  @IsOptional()
  @IsBoolean()
  isFavorite?: boolean;

  /** Prendas del outfit (1 a 20, sin repetir). */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ITEMS_PER_OUTFIT)
  @ValidateNested({ each: true })
  @Type(() => OutfitItemInputDto)
  items!: OutfitItemInputDto[];
}
