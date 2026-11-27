import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AuthResponse, AuthService } from './auth.service';
import { ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto/email-auth.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EmailAuthService } from './email-auth.service';

@ApiTags('auth')
@Public()
// Limita intentos (por IP) para frenar ataques de fuerza bruta.
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailAuth: EmailAuthService,
  ) {}

  /** Crea una cuenta y devuelve un token de acceso. */
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    return this.auth.register(dto);
  }

  /** Inicia sesión con email y contraseña. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  /**
   * «He olvidado mi contraseña»: manda un enlace (1 h, un solo uso). La
   * respuesta es SIEMPRE la misma, exista la cuenta o no. Pocos intentos por IP
   * (y como mucho un correo por minuto a cada cuenta).
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.emailAuth.forgotPassword(dto.email);
  }

  /** Contraseña nueva con el enlace del correo. Cierra todas las sesiones. */
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    return this.emailAuth.resetPassword(dto.token, dto.password);
  }

  /** Confirma el email con el enlace del correo (la web usa el POST). */
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 15 * 60_000 } })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.emailAuth.verifyEmail(dto.token);
  }

  /** Lo mismo por GET (?token=…), para quien abra el enlace de la API directamente. */
  @Get('verify-email')
  @Throttle({ default: { limit: 20, ttl: 15 * 60_000 } })
  verifyEmailByLink(@Query() dto: VerifyEmailDto) {
    return this.emailAuth.verifyEmail(dto.token);
  }
}
