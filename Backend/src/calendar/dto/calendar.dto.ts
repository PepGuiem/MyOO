import { ApiPropertyOptional } from '@nestjs/swagger';
import { CalendarEventKind } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** Día del calendario: «YYYY-MM-DD» (se comprueba que exista en el servicio). */
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const trimOrNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t === '' ? null : t;
};

export class CalendarRangeQueryDto {
  @Matches(DAY_PATTERN, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @Matches(DAY_PATTERN, { message: 'to must be YYYY-MM-DD' })
  to!: string;
}

export class CalendarDayQueryDto {
  @Matches(DAY_PATTERN, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit?: number;
}

export class CalendarTodayQueryDto {
  /** Hoy en la zona horaria de quien mira (lo manda el navegador). */
  @Matches(DAY_PATTERN, { message: 'today must be YYYY-MM-DD' })
  today!: string;
}

export class CreateCalendarEntryDto {
  @Matches(DAY_PATTERN, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  /** Outfit guardado (tiene que ser tuyo). */
  @IsUUID()
  outfitId!: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;

  /** Evento especial: «Boda de Ana», «Concierto»... */
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  eventName?: string | null;

  @ApiPropertyOptional({ enum: CalendarEventKind, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(CalendarEventKind)
  eventKind?: CalendarEventKind | null;

  /** Marcarlo ya como usado (solo hoy o días pasados). */
  @IsOptional()
  @IsBoolean()
  worn?: boolean;
}

export class UpdateCalendarEntryDto {
  @IsOptional()
  @Matches(DAY_PATTERN, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @IsOptional()
  @IsUUID()
  outfitId?: string;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(80)
  eventName?: string | null;

  @ApiPropertyOptional({ enum: CalendarEventKind, nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEnum(CalendarEventKind)
  eventKind?: CalendarEventKind | null;

  @IsOptional()
  @IsBoolean()
  worn?: boolean;
}
