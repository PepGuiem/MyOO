import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { AuthResponse, AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Public()
// Limita intentos (por IP) para frenar ataques de fuerza bruta.
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
   * "Logout" con JWT: el servidor no guarda sesiones, así que el token NO
   * queda invalidado al instante; sigue siendo válido hasta que caduca.
   * El cliente debe borrarlo. (Para revocación real haría falta una lista
   * de tokens revocados o refresh tokens en base de datos.)
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(): void {
    // Intencionadamente vacío: ver comentario.
  }
}
