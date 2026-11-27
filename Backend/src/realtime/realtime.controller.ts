import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AblyService } from './ably.service';
import { RealtimeService } from './realtime.service';

@ApiTags('realtime')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard)
@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
    private readonly ably: AblyService,
  ) {}

  /** Ticket de un solo uso (30 s) para abrir el WebSocket: `/api/ws?ticket=...`. */
  @Post('ticket')
  @HttpCode(HttpStatus.OK)
  ticket(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    // El guard ya ha verificado el token; aquí solo se lee cuándo caduca.
    const token = req.headers.authorization?.split(' ')[1] ?? '';
    const exp = this.jwt.decode<{ exp?: number } | null>(token)?.exp;
    if (!exp) throw new UnauthorizedException();
    return this.realtime.issueTicket(user.id, exp * 1000);
  }

  /**
   * Token de Ably para el navegador (solo escuchar `user:<tu id>`, 30 min).
   * Sin `ABLY_API_KEY` responde `{ enabled: false }` y la web sigue con el
   * WebSocket o las consultas periódicas. Nunca devuelve la clave.
   */
  @Post('token')
  @HttpCode(HttpStatus.OK)
  async token(@CurrentUser() user: AuthenticatedUser) {
    if (!this.ably.enabled) return { enabled: false as const };
    try {
      const token = await this.ably.requestToken(user.id);
      return { enabled: true as const, ...token };
    } catch {
      throw new ServiceUnavailableException({
        message: 'Realtime is not available right now',
        code: 'realtime_unavailable',
      });
    }
  }
}
