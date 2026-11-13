import { ApiPropertyOptional } from '@nestjs/swagger';
import { Season, StylistSignal } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { OCCASION_KEYS, STYLE_TAG_KEYS, WEATHER_KEYS } from '../vocabulary';

/** Para qué es el outfit: estilo, ocasión, tiempo y temporada (todo opcional). */
export class StylistContextDto {
  @ApiPropertyOptional({ enum: STYLE_TAG_KEYS })
  @IsOptional()
  @IsIn(STYLE_TAG_KEYS)
  style?: (typeof STYLE_TAG_KEYS)[number];

  @ApiPropertyOptional({ enum: OCCASION_KEYS })
  @IsOptional()
  @IsIn(OCCASION_KEYS)
  occasion?: (typeof OCCASION_KEYS)[number];

  @ApiPropertyOptional({ enum: WEATHER_KEYS })
  @IsOptional()
  @IsIn(WEATHER_KEYS)
  weather?: (typeof WEATHER_KEYS)[number];

  @ApiPropertyOptional({ enum: Season })
  @IsOptional()
  @IsEnum(Season)
  season?: Season;

  /** Solo con las prendas de este armario (si no, de todos). */
  @IsOptional()
  @IsUUID()
  wardrobeId?: string;

  /** Prendas que no se pueden usar. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  excludeItemIds?: string[];
}

export class GenerateOutfitsDto extends StylistContextDto {
  /** Cuántos outfits distintos (1-6). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(6)
  count?: number;

  /** Misma semilla, mismos outfits; otra semilla, otra tanda. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2_147_483_647)
  seed?: number;

  /** Prendas que tienen que salir sí o sí (tuyas). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  lockedItemIds?: string[];

  /** Prioriza prendas que no usas en ningún outfit. */
  @IsOptional()
  @IsBoolean()
  discover?: boolean;
}

export class AlternativesDto extends StylistContextDto {
  /** Prendas del outfit actual. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  itemIds!: string[];

  /** La que se quiere cambiar (una de itemIds). */
  @IsUUID()
  replaceItemId!: string;
}

export class StylistFeedbackDto {
  @ApiPropertyOptional({ enum: StylistSignal })
  @IsEnum(StylistSignal)
  signal!: StylistSignal;

  /** Prendas del outfit o del consejo (tuyas). */
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  itemIds!: string[];

  /** Tipo de consejo (roll_hem, add_accessory...). */
  @IsOptional()
  @Matches(/^[a-z_]{2,40}$/)
  tipCode?: string;

  @IsOptional()
  @IsIn(STYLE_TAG_KEYS)
  style?: string;

  @IsOptional()
  @IsIn(OCCASION_KEYS)
  occasion?: string;
}

export class InsightsQueryDto {
  @IsOptional()
  @IsUUID()
  wardrobeId?: string;
}
