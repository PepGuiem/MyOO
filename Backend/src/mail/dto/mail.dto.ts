import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Encender o apagar los avisos por correo (lo que no llegue no cambia). */
export class UpdateEmailNoticesDto {
  @IsOptional()
  @IsBoolean()
  payments?: boolean;

  @IsOptional()
  @IsBoolean()
  chat?: boolean;
}

/** Enlace de baja del pie de un aviso. */
export class UnsubscribeDto {
  @IsString()
  @MaxLength(200)
  token!: string;
}
