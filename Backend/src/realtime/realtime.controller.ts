import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { RealtimeService } from './realtime.service';

@ApiTags('realtime')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard)
@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly jwt: JwtService,
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
}
