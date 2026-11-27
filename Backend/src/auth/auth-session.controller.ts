import { Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuthResponse, AuthService } from './auth.service';
import { EmailAuthService } from './email-auth.service';

/**
 * Endpoints de sesión que SÍ requieren token (el AuthController es todo
 * público). Va aparte para no depender de cómo se combinan los decoradores.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthSessionController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailAuth: EmailAuthService,
  ) {}

  /**
   * Renueva la sesión: con un token todavía válido devuelve uno nuevo con la
   * caducidad completa. La web lo pide al abrirse, así quien entra a menudo
   * no tiene que volver a iniciar sesión. Una cuenta suspendida no renueva.
   */
  @Post('renew')
  @HttpCode(HttpStatus.OK)
  renew(@CurrentUser() user: AuthenticatedUser): Promise<AuthResponse> {
    return this.auth.issue(user.id);
  }

  /**
   * Cerrar sesión: el token deja de valer en el servidor al momento, en este
   * y en los demás dispositivos de la cuenta.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.auth.logout(user.id);
  }

  /** «Reenviar» el correo para confirmar el email (como mucho uno por minuto). */
  @Post('verify-email/resend')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  resendVerification(@CurrentUser() user: AuthenticatedUser) {
    return this.emailAuth.resendVerification(user.id);
  }
}
