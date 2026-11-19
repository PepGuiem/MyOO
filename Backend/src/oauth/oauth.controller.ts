import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { OAuthExchangeDto, OAuthPrepareDto } from './dto/oauth.dto';
import { OAuthConfig, type ProviderSlug } from './oauth.config';
import { readCookie } from './oauth-crypto';
import { OAuthService, type StartResult } from './oauth.service';

enum Slug {
  google = 'google',
  apple = 'apple',
  instagram = 'instagram',
}

/** Cookie HttpOnly que ata el flujo al navegador que lo empezó. */
const COOKIE = 'myout_oauth';
const COOKIE_PATH = '/api/auth/oauth';

const str = (v: unknown, max = 4000): string | undefined =>
  typeof v === 'string' && v.length <= max ? v : undefined;

@ApiTags('auth')
@UseGuards(ThrottlerGuard)
@Controller('auth/oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly config: OAuthConfig,
  ) {}

  /** Qué proveedores están configurados en este servidor. */
  @Public()
  @Get('providers')
  providers() {
    return this.oauth.providers();
  }

  /**
   * Abre el login con Google o Apple (el navegador navega aquí). Con `flow`,
   * abre un flujo ya preparado con sesión (conectar cuenta o confirmar identidad).
   */
  @Public()
  @Get(':provider/start')
  async start(
    @Param('provider', new ParseEnumPipe(Slug)) provider: ProviderSlug,
    @Query('flow') flow: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    let started: StartResult;
    try {
      started = flow
        ? await this.oauth.startPrepared(provider, flow.slice(0, 200))
        : await this.oauth.startLogin(provider);
    } catch (err) {
      const body =
        err instanceof BadRequestException
          ? (err.getResponse() as { code?: unknown })
          : null;
      const code =
        typeof body?.code === 'string'
          ? body.code
          : err instanceof BadRequestException
            ? 'expired'
            : 'provider_error';
      res.redirect(
        HttpStatus.FOUND,
        `${this.config.frontendUrl}/auth/callback#error=${code}&provider=${provider}`,
      );
      return;
    }
    res.cookie(COOKIE, started.browserSecret, {
      httpOnly: true,
      // Apple vuelve con un POST desde otro sitio: la cookie solo viaja con SameSite=None (y eso exige HTTPS).
      sameSite: this.config.secureCookies ? 'none' : 'lax',
      secure: this.config.secureCookies,
      path: COOKIE_PATH,
      maxAge: 10 * 60 * 1000,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(HttpStatus.FOUND, started.redirectUrl);
  }

  /** Vuelta de Google e Instagram (GET con ?code=&state=). */
  @Public()
  @ApiExcludeEndpoint()
  @Get(':provider/callback')
  async callbackGet(
    @Param('provider', new ParseEnumPipe(Slug)) provider: ProviderSlug,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.oauth.callback(
      provider,
      {
        code: str(query.code),
        state: str(query.state),
        error: str(query.error, 200),
      },
      readCookie(req.headers.cookie, COOKIE),
    );
    this.finish(res, target);
  }

  /** Vuelta de Apple (POST de formulario: response_mode=form_post). */
  @Public()
  @ApiExcludeEndpoint()
  @Post('apple/callback')
  async callbackApple(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const target = await this.oauth.callback(
      'apple',
      {
        code: str(body?.code),
        state: str(body?.state),
        error: str(body?.error, 200),
        user: str(body?.user, 2000),
      },
      readCookie(req.headers.cookie, COOKIE),
    );
    // 303: el navegador sigue la redirección con un GET.
    this.finish(res, target, HttpStatus.SEE_OTHER);
  }

  /** Canjea el código de la vuelta por la sesión de MyOO (login). */
  @Public()
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  exchange(@Body() dto: OAuthExchangeDto) {
    return this.oauth.exchangeLogin(dto.result);
  }

  /** Con sesión: prepara conectar una cuenta o confirmar tu identidad. Devuelve la URL a abrir. */
  @ApiBearerAuth()
  @Post(':provider/prepare')
  @HttpCode(HttpStatus.OK)
  prepare(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider', new ParseEnumPipe(Slug)) provider: ProviderSlug,
    @Body() dto: OAuthPrepareDto,
  ) {
    return this.oauth.prepare(user.id, provider, dto.intent);
  }

  /** Con sesión: termina de conectar la cuenta o recoge la prueba de identidad. */
  @ApiBearerAuth()
  @Post('exchange/me')
  @HttpCode(HttpStatus.OK)
  exchangeForUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OAuthExchangeDto,
  ) {
    return this.oauth.exchangeForUser(user.id, dto.result);
  }

  private finish(
    res: Response,
    target: string,
    status = HttpStatus.FOUND,
  ): void {
    res.clearCookie(COOKIE, {
      path: COOKIE_PATH,
      httpOnly: true,
      secure: this.config.secureCookies,
      sameSite: this.config.secureCookies ? 'none' : 'lax',
    });
    res.setHeader('Cache-Control', 'no-store');
    // El fragmento (#) no se manda a ningún servidor ni queda en sus logs.
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(status, target);
  }
}
