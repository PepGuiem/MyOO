import { BillingInterval, PaymentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PageDto } from '../admin/admin.dto';

const planCode = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CheckoutDto {
  @Transform(planCode)
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Z0-9_]+$/)
  planCode!: string;

  @IsEnum(BillingInterval)
  interval: BillingInterval = BillingInterval.MONTH;
}

export class ConfirmCheckoutDto {
  @IsString()
  @Matches(/^cs_(test|live)_[A-Za-z0-9]+$/)
  @MaxLength(255)
  sessionId!: string;
}

// ------------------------------------------------------------------ admin

export class AdminPaymentsQueryDto extends PageDto {
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  search?: string;
}

export class AssignPlanDto {
  @Transform(planCode)
  @IsString()
  @MaxLength(32)
  @Matches(/^[A-Z0-9_]+$/)
  planCode!: string;

  /** Meses de duración; sin meses = hasta que se cambie. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36)
  months?: number;
}

export class GiftMonthsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  months!: number;
}

export class AdminCancelDto {
  /** true: se corta ya. false: sigue hasta el final del periodo pagado. */
  @IsBoolean()
  immediate!: boolean;
}

export class RefundDto {
  /** Céntimos a devolver; sin importe = todo lo que quede. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents?: number;
}

export class UpdatePlanDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  /** Precio mensual en céntimos (máx. 999,99 €). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(99_999)
  priceCents?: number;

  /** Precio anual en céntimos (0 = sin pago anual). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999_999)
  annualPriceCents?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

