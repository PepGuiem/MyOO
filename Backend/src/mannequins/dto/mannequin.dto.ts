import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MANNEQUIN_SEXES, MEASURE_RANGES, type MannequinSex } from '../mannequin-measures';

const R = MEASURE_RANGES;
const num = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 };

/** Medidas en centímetros. Todas obligatorias. */
export class MannequinMeasuresDto {
  @IsNumber(num) @Min(R.heightCm.min) @Max(R.heightCm.max) heightCm!: number;
  @IsNumber(num) @Min(R.shoulderCm.min) @Max(R.shoulderCm.max) shoulderCm!: number;
  @IsNumber(num) @Min(R.chestCm.min) @Max(R.chestCm.max) chestCm!: number;
  @IsNumber(num) @Min(R.waistCm.min) @Max(R.waistCm.max) waistCm!: number;
  @IsNumber(num) @Min(R.hipCm.min) @Max(R.hipCm.max) hipCm!: number;
  @IsNumber(num) @Min(R.armCm.min) @Max(R.armCm.max) armCm!: number;
}

export class CreateMannequinDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsIn(MANNEQUIN_SEXES)
  sex!: MannequinSex;

  @ValidateNested()
  @Type(() => MannequinMeasuresDto)
  measures!: MannequinMeasuresDto;

  /** Usarlo por defecto en la cuenta. El primer maniquí lo es siempre. */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateMannequinDto extends PartialType(CreateMannequinDto) {}
