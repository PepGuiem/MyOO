import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

/**
 * Solo cuentas con rol ADMIN. Va DESPUÉS del AuthGuard global, que ya ha
 * leído el rol de la base de datos en esta misma petición (no del token): si
 * se le quita el rol a alguien, deja de entrar al momento.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>().user;
    if (user?.role !== 'ADMIN') throw new ForbiddenException('Admins only');
    return true;
  }
}
