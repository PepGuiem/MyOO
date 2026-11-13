import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppConfig } from '../config/env.validation';
import { TokenCipher } from './oauth-crypto';

export type ProviderSlug = 'google' | 'apple' | 'instagram';

export interface GoogleSettings {
  clientId: string;
  clientSecret: string;
}

export interface AppleSettings {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

export interface InstagramSettings {
  appId: string;
  appSecret: string;
}

/**
 * Configuración de los proveedores leída del .env. Un proveedor está
 * "activo" solo si tiene todas sus variables; si no, su botón no aparece y
 * sus rutas responden "no configurado".
 */
@Injectable()
export class OAuthConfig {
  private readonly logger = new Logger(OAuthConfig.name);
  readonly frontendUrl: string;
  readonly publicApiUrl: string;
  readonly google: GoogleSettings | null;
  readonly apple: AppleSettings | null;
  readonly instagram: InstagramSettings | null;
  /** Cifra los tokens de Instagram. Sin clave, Instagram queda desactivado. */
  readonly cipher: TokenCipher | null;

  constructor(config: ConfigService<AppConfig, true>) {
    const get = <K extends keyof AppConfig>(k: K) =>
      config.get(k, { infer: true });
    this.frontendUrl = get('FRONTEND_URL');
    this.publicApiUrl = get('OAUTH_PUBLIC_API_URL');

    const gId = get('GOOGLE_CLIENT_ID');
    const gSecret = get('GOOGLE_CLIENT_SECRET');
    this.google =
      gId && gSecret ? { clientId: gId, clientSecret: gSecret } : null;

    this.apple = this.loadApple(
      get('APPLE_CLIENT_ID'),
      get('APPLE_TEAM_ID'),
      get('APPLE_KEY_ID'),
      get('APPLE_PRIVATE_KEY_PATH'),
    );

    const key = get('TOKEN_ENCRYPTION_KEY');
    this.cipher = key ? new TokenCipher(key) : null;
    const igId = get('INSTAGRAM_APP_ID');
    const igSecret = get('INSTAGRAM_APP_SECRET');
    if (igId && igSecret && !this.cipher) {
      this.logger.warn(
        'Instagram está configurado pero falta TOKEN_ENCRYPTION_KEY: se desactiva.',
      );
    }
    this.instagram =
      igId && igSecret && this.cipher
        ? { appId: igId, appSecret: igSecret }
        : null;
  }

  /** URL a la que vuelve el proveedor (hay que registrarla tal cual en su consola). */
  redirectUri(provider: ProviderSlug): string {
    return `${this.publicApiUrl}/auth/oauth/${provider}/callback`;
  }

  /** La cookie del flujo solo puede ser `Secure` si la API se sirve por HTTPS. */
  get secureCookies(): boolean {
    return this.publicApiUrl.startsWith('https://');
  }

  enabled(provider: ProviderSlug): boolean {
    return !!this[provider];
  }

  private loadApple(
    clientId?: string,
    teamId?: string,
    keyId?: string,
    keyPath?: string,
  ): AppleSettings | null {
    if (!clientId || !teamId || !keyId || !keyPath) return null;
    try {
      const privateKey = readFileSync(resolve(keyPath), 'utf8');
      if (!privateKey.includes('PRIVATE KEY')) throw new Error('not a PEM key');
      return { clientId, teamId, keyId, privateKey };
    } catch {
      // No se registra la ruta ni el contenido: solo que no se pudo leer.
      this.logger.warn(
        'No se pudo leer la clave de Apple (APPLE_PRIVATE_KEY_PATH): Apple queda desactivado.',
      );
      return null;
    }
  }
}
