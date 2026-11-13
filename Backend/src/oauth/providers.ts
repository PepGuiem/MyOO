import { JwtService } from '@nestjs/jwt';
import { fetchJson, form, ProviderError, type FetchLike } from './http';
import { isTrue, OidcVerifier } from './oidc';
import type {
  AppleSettings,
  GoogleSettings,
  InstagramSettings,
} from './oauth.config';

/** Quién es el usuario según Google o Apple, ya comprobado. */
export interface VerifiedIdentity {
  provider: 'GOOGLE' | 'APPLE';
  /** Identificador estable del usuario en el proveedor. */
  sub: string;
  email: string | null;
  /** El proveedor garantiza que el email es de esa persona. */
  emailVerified: boolean;
  name: string | null;
  /** Foto de perfil (solo Google). */
  picture: string | null;
}

// -----------------------------------------------------------------------------
// Google (OpenID Connect + PKCE)
// -----------------------------------------------------------------------------

export class GoogleProvider {
  constructor(
    private readonly settings: GoogleSettings,
    private readonly redirectUri: string,
    private readonly oidc: OidcVerifier,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  authorizeUrl(p: {
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string {
    const q = new URLSearchParams({
      client_id: this.settings.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: p.state,
      nonce: p.nonce,
      code_challenge: p.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }

  async identify(
    code: string,
    codeVerifier: string,
    nonce: string,
  ): Promise<VerifiedIdentity> {
    const tokens = await fetchJson<{ id_token?: string }>(
      this.fetchImpl,
      'google token',
      'https://oauth2.googleapis.com/token',
      form({
        code,
        client_id: this.settings.clientId,
        client_secret: this.settings.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    );
    if (!tokens.id_token)
      throw new ProviderError('google token: missing id_token');
    const c = await this.oidc.verify(tokens.id_token, {
      jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
      issuers: ['https://accounts.google.com', 'accounts.google.com'],
      audience: this.settings.clientId,
      nonce,
    });
    return {
      provider: 'GOOGLE',
      sub: c.sub,
      email: c.email ? c.email.trim().toLowerCase() : null,
      emailVerified: isTrue(c.email_verified),
      name: c.name?.trim() || null,
      picture: c.picture ?? null,
    };
  }
}

// -----------------------------------------------------------------------------
// Apple (Sign in with Apple, web)
// -----------------------------------------------------------------------------

export class AppleProvider {
  private readonly jwt = new JwtService();

  constructor(
    private readonly settings: AppleSettings,
    private readonly redirectUri: string,
    private readonly oidc: OidcVerifier,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  /**
   * Apple pide `response_mode=form_post` cuando se piden nombre y email: la
   * vuelta llega como un POST de formulario, no como una redirección GET.
   */
  authorizeUrl(p: { state: string; nonce: string }): string {
    const q = new URLSearchParams({
      client_id: this.settings.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      response_mode: 'form_post',
      scope: 'name email',
      state: p.state,
      nonce: p.nonce,
    });
    return `https://appleid.apple.com/auth/authorize?${q}`;
  }

  /**
   * Apple no usa un "client secret" fijo: hay que firmar un JWT corto (ES256)
   * con la clave privada .p8 que da Apple.
   */
  clientSecret(): string {
    return this.jwt.sign(
      {},
      {
        privateKey: this.settings.privateKey,
        algorithm: 'ES256',
        keyid: this.settings.keyId,
        issuer: this.settings.teamId,
        subject: this.settings.clientId,
        audience: 'https://appleid.apple.com',
        expiresIn: 300,
      },
    );
  }

  /** `userJson` es el campo "user" que Apple manda SOLO la primera vez (con el nombre). */
  async identify(
    code: string,
    nonce: string,
    userJson?: string,
  ): Promise<VerifiedIdentity> {
    const tokens = await fetchJson<{ id_token?: string }>(
      this.fetchImpl,
      'apple token',
      'https://appleid.apple.com/auth/token',
      form({
        client_id: this.settings.clientId,
        client_secret: this.clientSecret(),
        code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      }),
    );
    if (!tokens.id_token)
      throw new ProviderError('apple token: missing id_token');
    const c = await this.oidc.verify(tokens.id_token, {
      jwksUri: 'https://appleid.apple.com/auth/keys',
      issuers: ['https://appleid.apple.com'],
      audience: this.settings.clientId,
      nonce,
    });
    return {
      provider: 'APPLE',
      sub: c.sub,
      email: c.email ? c.email.trim().toLowerCase() : null,
      emailVerified: isTrue(c.email_verified),
      name: appleName(userJson),
      picture: null,
    };
  }
}

/** Nombre a partir del campo "user" de Apple: {"name":{"firstName","lastName"}}. */
export function appleName(userJson?: string): string | null {
  if (!userJson || userJson.length > 2000) return null;
  try {
    const u = JSON.parse(userJson) as {
      name?: { firstName?: unknown; lastName?: unknown };
    };
    const parts = [u.name?.firstName, u.name?.lastName].filter(
      (p): p is string => typeof p === 'string' && !!p.trim(),
    );
    const name = parts.join(' ').trim();
    return name ? name.slice(0, 60) : null;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Instagram (API de Instagram con inicio de sesión de Instagram)
// Solo cuentas PROFESIONALES (creador o empresa): Meta no da acceso a las
// cuentas personales desde diciembre de 2024.
// -----------------------------------------------------------------------------

/** Versión de la Graph API de Instagram que se usa. */
export const INSTAGRAM_GRAPH_VERSION = 'v26.0';
const GRAPH = `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`;

export interface InstagramToken {
  accessToken: string;
  /** Segundos hasta que caduca. */
  expiresIn: number;
}

export interface InstagramProfile {
  id: string;
  username: string;
  name: string | null;
  accountType: string | null;
  profilePictureUrl: string | null;
  followersCount: number | null;
  mediaCount: number | null;
}

export interface InstagramMedia {
  id: string;
  /** IMAGE, VIDEO o CAROUSEL_ALBUM. */
  mediaType: string;
  /** Imagen para mostrar (la miniatura si es un vídeo). */
  imageUrl: string | null;
  permalink: string | null;
  caption: string | null;
  timestamp: string | null;
}

/** Los ids de Instagram llegan como texto o como número. */
function idOf(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}

export class InstagramClient {
  constructor(
    private readonly settings: InstagramSettings,
    private readonly redirectUri: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  authorizeUrl(p: { state: string }): string {
    const q = new URLSearchParams({
      client_id: this.settings.appId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'instagram_business_basic',
      state: p.state,
    });
    return `https://www.instagram.com/oauth/authorize?${q}`;
  }

  /** Código → token corto → token largo (60 días). Devuelve también el id de la cuenta. */
  async connect(
    code: string,
  ): Promise<{ userId: string; token: InstagramToken }> {
    // Instagram añade "#_" al final del código en algunos casos.
    const clean = code.replace(/#_$/, '');
    const raw = await fetchJson<Record<string, unknown>>(
      this.fetchImpl,
      'instagram token',
      'https://api.instagram.com/oauth/access_token',
      form({
        client_id: this.settings.appId,
        client_secret: this.settings.appSecret,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
        code: clean,
      }),
    );
    // La documentación muestra {data:[{...}]}; en la práctica también llega plano.
    const entry = (Array.isArray(raw.data) ? raw.data[0] : raw) as
      Record<string, unknown> | undefined;
    const shortToken =
      typeof entry?.access_token === 'string' ? entry.access_token : null;
    const userId = idOf(entry?.user_id) || null;
    if (!shortToken || !userId)
      throw new ProviderError('instagram token: unexpected response');

    const long = await fetchJson<{
      access_token?: string;
      expires_in?: number;
    }>(
      this.fetchImpl,
      'instagram long-lived token',
      `https://graph.instagram.com/access_token?${new URLSearchParams({
        grant_type: 'ig_exchange_token',
        client_secret: this.settings.appSecret,
        access_token: shortToken,
      })}`,
    );
    if (!long.access_token)
      throw new ProviderError(
        'instagram long-lived token: unexpected response',
      );
    return {
      userId,
      token: {
        accessToken: long.access_token,
        expiresIn: Number(long.expires_in) || 60 * 24 * 3600,
      },
    };
  }

  /** Renueva un token largo (necesita al menos 24 h de antigüedad y no estar caducado). */
  async refresh(accessToken: string): Promise<InstagramToken> {
    const r = await fetchJson<{ access_token?: string; expires_in?: number }>(
      this.fetchImpl,
      'instagram refresh',
      `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: accessToken })}`,
    );
    if (!r.access_token)
      throw new ProviderError('instagram refresh: unexpected response');
    return {
      accessToken: r.access_token,
      expiresIn: Number(r.expires_in) || 60 * 24 * 3600,
    };
  }

  async profile(accessToken: string): Promise<InstagramProfile> {
    const fields =
      'user_id,username,name,account_type,profile_picture_url,followers_count,media_count';
    const p = await fetchJson<Record<string, unknown>>(
      this.fetchImpl,
      'instagram profile',
      `${GRAPH}/me?${new URLSearchParams({ fields, access_token: accessToken })}`,
    );
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
    const num = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) ? v : null;
    const username = str(p.username);
    if (!username)
      throw new ProviderError('instagram profile: unexpected response');
    return {
      id: idOf(p.user_id) || idOf(p.id),
      username,
      name: str(p.name),
      accountType: str(p.account_type),
      profilePictureUrl: str(p.profile_picture_url),
      followersCount: num(p.followers_count),
      mediaCount: num(p.media_count),
    };
  }

  async media(accessToken: string, limit = 12): Promise<InstagramMedia[]> {
    const fields =
      'id,media_type,media_url,thumbnail_url,permalink,caption,timestamp';
    const r = await fetchJson<{ data?: Record<string, unknown>[] }>(
      this.fetchImpl,
      'instagram media',
      `${GRAPH}/me/media?${new URLSearchParams({ fields, limit: String(limit), access_token: accessToken })}`,
    );
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
    return (r.data ?? []).slice(0, limit).map((m) => {
      const type = str(m.media_type) ?? 'IMAGE';
      return {
        id: idOf(m.id),
        mediaType: type,
        imageUrl: type === 'VIDEO' ? str(m.thumbnail_url) : str(m.media_url),
        permalink: str(m.permalink),
        caption: str(m.caption)?.slice(0, 300) ?? null,
        timestamp: str(m.timestamp),
      };
    });
  }
}
