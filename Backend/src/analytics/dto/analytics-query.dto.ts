import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AnalyticsQueryDto {
  /** Zona horaria IANA de quien mira (para «este mes» y las semanas). Por defecto, Europe/Madrid. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tz?: string;
}
