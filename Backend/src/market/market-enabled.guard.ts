import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/env.validation';

/**
 * STREET MARKET está apagado hasta su lanzamiento: sin MARKET_ENABLED=true
 * todas sus rutas responden 404 con `code: "coming_soon"`. Los datos y el
 * código siguen ahí; solo se cierra la puerta.
 */
@Injectable()
export class MarketEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(): boolean {
    if (this.config.get('MARKET_ENABLED', { infer: true })) return true;
    throw new NotFoundException({
      message: 'Street Market is coming soon',
      code: 'coming_soon',
    });
  }
}
