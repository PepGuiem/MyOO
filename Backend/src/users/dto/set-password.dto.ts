import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Crear o cambiar la contraseña.
 * - Si ya tienes contraseña: `currentPassword`.
 * - Si no (cuenta creada con Google/Apple): `reauthToken` (volver a entrar
 *   con el proveedor). Así un token de sesión robado no basta para ponerle
 *   una contraseña a tu cuenta y quedársela.
 */
export class SetPasswordDto {
  /** Mismas reglas que el registro. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  newPassword!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword?: string;

  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  reauthToken?: string;
}
