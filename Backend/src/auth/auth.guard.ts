import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import type {
  AuthenticatedRequest,
  JwtPayload,
} from '../common/types/authenticated-user';
import { banSelect, bannedError, isBanned } from '../common/ban';
import { ActivityService } from '../monitoring/activity.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Guard GLOBAL (registrado como APP_GUARD en AuthModule).
 * 1. Si el endpoint tiene @Public(), deja pasar.
 * 2. Si no, exige la cabecera `Authorization: Bearer <token>`.
 * 3. Verifica firma y caducidad del JWT.
 * 4. Comprueba que el usuario sigue existiendo y que no está baneado.
 * 5. Guarda { id, email, role } en request.user para @CurrentUser().
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, ...banSelect },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    // Un baneo se aplica al momento: el token sigue siendo válido, pero la
    // cuenta no puede hacer nada (403 con el código "banned").
    if (isBanned(user)) throw bannedError(user);

    request.user = { id: user.id, email: user.email, role: user.role };
    // Cuenta como activo hoy (una escritura por usuario y día, sin esperar).
    this.activity.touch(user.id);
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    return type === 'Bearer' && token ? token : undefined;
  }
}
