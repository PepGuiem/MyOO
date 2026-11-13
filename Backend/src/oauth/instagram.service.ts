import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider } from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderError } from './http';
import { OAuthConfig } from './oauth.config';
import { OAuthService } from './oauth.service';
import type { InstagramMedia, InstagramProfile } from './providers';

/** Las fotos de Instagram vienen de su CDN (y del de Facebook). */
export const INSTAGRAM_PHOTO_HOSTS = ['cdninstagram.com', 'fbcdn.net'];

/** Se renueva el token si caduca en menos de esto (los tokens duran 60 días). */
const REFRESH_WHEN_LEFT_MS = 20 * 24 * 3600 * 1000;
/** Instagram no deja renovar un token con menos de 24 h. */
const MIN_AGE_TO_REFRESH_MS = 24 * 3600 * 1000;

export type InstagramOverview =
  | { connected: false }
  | {
      connected: true;
      /** ok: datos al día. expired: hay que volver a conectar. unavailable: Instagram no responde ahora. */
      status: 'ok' | 'expired' | 'unavailable';
      username: string | null;
      profile: InstagramProfile | null;
      media: InstagramMedia[];
    };

/**
 * Datos de la cuenta de Instagram conectada: perfil y últimas publicaciones.
 * Se piden en el momento con el token guardado (cifrado) y no se guardan.
 */
@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OAuthConfig,
    private readonly oauth: OAuthService,
    private readonly assets: AssetsService,
  ) {}

  async overview(userId: string): Promise<InstagramOverview> {
    const acc = await this.account(userId);
    if (!acc) return { connected: false };
    const base = {
      connected: true as const,
      username: acc.username,
      profile: null,
      media: [],
    };
    if (!this.oauth.instagram || !this.config.cipher || !acc.accessTokenEnc)
      return { ...base, status: 'unavailable' };
    if (acc.tokenExpiresAt && acc.tokenExpiresAt < new Date())
      return { ...base, status: 'expired' };

    try {
      const token = await this.freshToken(acc);
      const [profile, media] = await Promise.all([
        this.oauth.instagram.profile(token),
        this.oauth.instagram.media(token, 12),
      ]);
      if (profile.username !== acc.username) {
        await this.prisma.authAccount.update({
          where: { id: acc.id },
          data: { username: profile.username },
        });
      }
      return {
        ...base,
        status: 'ok',
        username: profile.username,
        profile,
        media,
      };
    } catch (err) {
      // 400/401/190: token revocado o caducado → hay que volver a conectar.
      if (
        err instanceof ProviderError &&
        (err.status === 400 || err.status === 401)
      )
        return { ...base, status: 'expired' };
      this.logger.warn(
        `Instagram: ${err instanceof Error ? err.message : 'error'}`,
      );
      return { ...base, status: 'unavailable' };
    }
  }

  /** Pone la foto de perfil de Instagram como foto de perfil de MyOut. */
  async useProfilePhoto(userId: string): Promise<{ avatarAssetId: string }> {
    const acc = await this.account(userId);
    if (!acc) throw new NotFoundException('Instagram is not connected');
    if (!this.oauth.instagram || !this.config.cipher || !acc.accessTokenEnc)
      throw new BadRequestException('Instagram is not available right now');
    let url: string | null;
    try {
      const token = await this.freshToken(acc);
      url = (await this.oauth.instagram.profile(token)).profilePictureUrl;
    } catch {
      throw new BadRequestException(
        'Could not read your Instagram profile. Try reconnecting it.',
      );
    }
    if (!url)
      throw new BadRequestException(
        'Your Instagram account has no profile photo',
      );

    const asset = await this.assets.importRemoteImage(
      userId,
      url,
      INSTAGRAM_PHOTO_HOSTS,
      'instagram-foto',
    );
    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarAssetId: true },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarAssetId: asset.id },
    });
    if (before?.avatarAssetId && before.avatarAssetId !== asset.id)
      await this.assets.removeIfUnused(userId, before.avatarAssetId);
    return { avatarAssetId: asset.id };
  }

  private account(userId: string) {
    return this.prisma.authAccount.findUnique({
      where: { userId_provider: { userId, provider: AuthProvider.INSTAGRAM } },
      select: {
        id: true,
        username: true,
        accessTokenEnc: true,
        tokenExpiresAt: true,
        tokenRefreshedAt: true,
      },
    });
  }

  /** Descifra el token y, si le queda poco, lo renueva (y guarda el nuevo cifrado). */
  private async freshToken(acc: {
    id: string;
    accessTokenEnc: string | null;
    tokenExpiresAt: Date | null;
    tokenRefreshedAt: Date | null;
  }): Promise<string> {
    const cipher = this.config.cipher!;
    const token = cipher.decrypt(acc.accessTokenEnc!);
    const now = Date.now();
    const left = acc.tokenExpiresAt
      ? acc.tokenExpiresAt.getTime() - now
      : Infinity;
    const age = acc.tokenRefreshedAt
      ? now - acc.tokenRefreshedAt.getTime()
      : Infinity;
    if (left > REFRESH_WHEN_LEFT_MS || age < MIN_AGE_TO_REFRESH_MS)
      return token;
    try {
      const fresh = await this.oauth.instagram!.refresh(token);
      await this.prisma.authAccount.update({
        where: { id: acc.id },
        data: {
          accessTokenEnc: cipher.encrypt(fresh.accessToken),
          tokenExpiresAt: new Date(now + fresh.expiresIn * 1000),
          tokenRefreshedAt: new Date(now),
        },
      });
      return fresh.accessToken;
    } catch {
      // Si no se puede renovar, se sigue con el actual mientras valga.
      return token;
    }
  }
}
