import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

export class ChangePlanDto {
  /** Código del plan destino, por ejemplo "PREMIUM" o "FREE". */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Z0-9_]+$/)
  planCode!: string;
}
