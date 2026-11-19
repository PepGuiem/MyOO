import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AuthResponse, AuthService } from './auth.service';

/**
 * Endpoints de sesión que SÍ requieren token (el AuthController es todo
 * público). Va aparte para no depender de cómo se combinan los decoradores.
 */
@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthSessionController {
  constructor(private readonly auth: AuthService) {}

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
}
