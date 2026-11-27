import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** «He olvidado mi contraseña». */
export class ForgotPasswordDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

/** Contraseña nueva con el enlace del correo. */
export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  token!: string;

  /** Mismas reglas que el registro. */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  password!: string;
}

/** Confirmar el email con el enlace del correo. */
export class VerifyEmailDto {
  @IsString()
  @MinLength(20)
  @MaxLength(100)
  token!: string;
}
