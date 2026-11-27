import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { UnsubscribeDto, UpdateEmailNoticesDto } from './dto/mail.dto';
import { MailNoticesService } from './mail-notices.service';
import { MailService } from './mail.service';

@ApiTags('mail')
@Controller('mail')
export class MailController {
  constructor(
    private readonly mail: MailService,
    private readonly notices: MailNoticesService,
  ) {}

  /** ¿Hay correo? La web oculta «¿Olvidaste tu contraseña?» y los avisos si no. */
  @Public()
  @Get('config')
  config(): { enabled: boolean } {
    return { enabled: this.mail.enabled };
  }

  /** Avisos por correo de la cuenta (pagos y mensajes). */
  @ApiBearerAuth()
  @Get('preferences')
  preferences(@CurrentUser() user: AuthenticatedUser) {
    return this.notices.getPreferences(user.id);
  }

  @ApiBearerAuth()
  @Put('preferences')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  savePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateEmailNoticesDto,
  ) {
    return this.notices.setPreferences(user.id, dto);
  }

  /** Baja desde el enlace del correo (página /email-preferences de la web). */
  @Public()
  @Post('unsubscribe')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  async unsubscribe(@Body() dto: UnsubscribeDto) {
    const done = await this.notices.unsubscribe(dto.token);
    if (!done) throw new BadRequestException({ message: 'Invalid link', code: 'invalid_token' });
    return done;
  }

  /**
   * Baja «en un clic» (cabecera List-Unsubscribe-Post que usan Gmail y otros):
   * el programa de correo hace un POST a esta URL con el token en la query.
   */
  @Public()
  @Post('unsubscribe/one-click')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 15 * 60_000 } })
  @HttpCode(HttpStatus.OK)
  async oneClick(@Query('token') token: string | undefined) {
    const done = await this.notices.unsubscribe(token);
    if (!done) throw new BadRequestException({ message: 'Invalid link', code: 'invalid_token' });
    return done;
  }
}
