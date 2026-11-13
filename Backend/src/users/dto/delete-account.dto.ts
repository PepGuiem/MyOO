import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Confirmación para borrar la cuenta:
 * - con contraseña: la contraseña actual;
 * - sin contraseña (cuenta de Google/Apple): la prueba de identidad que da
 *   POST /auth/oauth/exchange/me tras volver a entrar con el proveedor.
 */
export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  reauthToken?: string;
}
