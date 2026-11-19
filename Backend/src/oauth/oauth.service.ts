import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider, OAuthIntent, Prisma } from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { AuthService, type AuthResponse } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProviderError } from './http';
import { OAuthConfig, type ProviderSlug } from './oauth.config';
import { pkceChallenge, randomToken, safeEqual, sha256 } from './oauth-crypto';
import { OidcVerifier } from './oidc';
import {
  AppleProvider,
  GoogleProvider,
  InstagramClient,
  type VerifiedIdentity,
} from './providers';

/** Cuánto vive un flujo desde que se abre hasta que vuelve el proveedor. */
const FLOW_TTL_MS = 10 * 60 * 1000;
/** Cuánto tiene el frontend para recoger el resultado. */
const RESULT_TTL_MS = 2 * 60 * 1000;
/** Cuánto vale la prueba de identidad (REAUTH). */
const PROOF_TTL_MS = 5 * 60 * 1000;

export const PROVIDER_ENUM: Record<ProviderSlug, AuthProvider> = {
  google: AuthProvider.GOOGLE,
  apple: AuthProvider.APPLE,
  instagram: AuthProvider.INSTAGRAM,
};
const PROVIDER_SLUG: Record<AuthProvider, ProviderSlug> = {
  GOOGLE: 'google',
  APPLE: 'apple',
  INSTAGRAM: 'instagram',
};
const PROVIDER_NAME: Record<AuthProvider, string> = {
  GOOGLE: 'Google',
  APPLE: 'Apple',
  INSTAGRAM: 'Instagram',
};

/** Lo que se guarda en OAuthFlow.outcome cuando vuelve Instagram. */
interface InstagramOutcome {
  provider: 'INSTAGRAM';
  sub: string;
  username: string;
  /** Token ya CIFRADO. */
  tokenEnc: string;
  tokenExpiresAt: string;
}
type Outcome = VerifiedIdentity | InstagramOutcome;

/** Datos que vienen del proveedor en la vuelta (query de GET o formulario de Apple). */
export interface CallbackParams {
  code?: string;
  state?: string;
  error?: string;
  /** Solo Apple, y solo la primera vez: JSON con el nombre. */
  user?: string;
}

export interface StartResult {
  redirectUrl: string;
  /** Valor de la cookie que ata el flujo a este navegador. */
  browserSecret: string;
}

export type LoginExchangeResult = AuthResponse & {
  /** Se ha creado una cuenta nueva. */
  created: boolean;
  /** Se quitó la contraseña de una cuenta con el email sin verificar (ver resolveLogin). */
  passwordRemoved: boolean;
};

export type UserExchangeResult =
  | { intent: 'link'; provider: ProviderSlug }
  | { intent: 'reauth'; provider: ProviderSlug; reauthToken: string };

/** Dominios desde los que se pueden importar fotos de perfil. */
export const GOOGLE_PHOTO_HOSTS = ['googleusercontent.com'];

/**
 * Inicio de sesión con Google y Apple, y conexión de cuentas (Instagram).
 *
 * Flujo (OAuth 2.0 "authorization code"):
 *  1. start: se crea un OAuthFlow con un `state` aleatorio (solo se guarda su
 *     hash), un `nonce` y, con Google, un PKCE. Se pone una cookie HttpOnly
 *     con un secreto que ata el flujo a ESTE navegador y se redirige al
 *     proveedor.
 *  2. callback: el proveedor vuelve con `code` y `state`. Se comprueba que el
 *     state existe, no ha caducado, no se ha usado y que la cookie es la del
 *     navegador que lo empezó (evita el "login CSRF"). Se canjea el código en
 *     el servidor (el secreto nunca llega al navegador) y se verifica el ID
 *     token. Se guarda la identidad y se manda al frontend un código de un
 *     solo uso en el fragmento (#) de la URL, que no llega a ningún servidor.
 *  3. exchange: el frontend canjea ese código por el token de sesión de
 *     MyOO (LOGIN), o, con su sesión, conecta la cuenta (LINK) o recibe una
 *     prueba de identidad (REAUTH).
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly oidc = new OidcVerifier();
  readonly google: GoogleProvider | null;
  readonly apple: AppleProvider | null;
  readonly instagram: InstagramClient | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: OAuthConfig,
    private readonly auth: AuthService,
    private readonly assets: AssetsService,
  ) {
    this.google = config.google
      ? new GoogleProvider(
          config.google,
          config.redirectUri('google'),
          this.oidc,
        )
      : null;
    this.apple = config.apple
      ? new AppleProvider(config.apple, config.redirectUri('apple'), this.oidc)
      : null;
    this.instagram = config.instagram
      ? new InstagramClient(config.instagram, config.redirectUri('instagram'))
      : null;
  }

  /** Qué proveedores están configurados (para mostrar u ocultar botones). */
  providers(): Record<ProviderSlug, boolean> {
    return {
      google: !!this.google,
      apple: !!this.apple,
      instagram: !!this.instagram,
    };
  }

  // ---------------------------------------------------------------------------
  // 1. Empezar
  // ---------------------------------------------------------------------------

  /** Login con Google o Apple (sin sesión). Instagram no sirve para entrar. */
  async startLogin(provider: ProviderSlug): Promise<StartResult> {
    if (provider === 'instagram')
      throw new BadRequestException('Instagram cannot be used to sign in');
    this.assertEnabled(provider);
    await this.cleanup();
    const state = randomToken();
    const nonce = randomToken();
    const codeVerifier = provider === 'google' ? randomToken(48) : null;
    const browserSecret = randomToken();
    await this.prisma.oAuthFlow.create({
      data: {
        stateHash: sha256(state),
        browserHash: sha256(browserSecret),
        provider: PROVIDER_ENUM[provider],
        intent: OAuthIntent.LOGIN,
        nonce,
        codeVerifier,
        expiresAt: new Date(Date.now() + FLOW_TTL_MS),
      },
    });
    return {
      redirectUrl: this.authorizeUrl(provider, state, nonce, codeVerifier),
      browserSecret,
    };
  }

  /**
   * Con sesión: prepara un flujo para conectar una cuenta (LINK) o para
   * confirmar la identidad (REAUTH). Devuelve la URL que el navegador debe
   * abrir; esa URL pone la cookie y redirige al proveedor.
   */
  async prepare(
    userId: string,
    provider: ProviderSlug,
    intent: 'link' | 'reauth',
  ): Promise<{ url: string }> {
    this.assertEnabled(provider);
    if (intent === 'reauth') {
      if (provider === 'instagram')
        throw new BadRequestException(
          'Use Google or Apple to confirm your identity',
        );
      const linked = await this.prisma.authAccount.findUnique({
        where: {
          userId_provider: { userId, provider: PROVIDER_ENUM[provider] },
        },
        select: { id: true },
      });
      if (!linked)
        throw new BadRequestException(
          `Your account is not connected to ${PROVIDER_NAME[PROVIDER_ENUM[provider]]}`,
        );
    }
    await this.cleanup();
    const state = randomToken();
    await this.prisma.oAuthFlow.create({
      data: {
        stateHash: sha256(state),
        browserHash: '',
        provider: PROVIDER_ENUM[provider],
        intent: intent === 'link' ? OAuthIntent.LINK : OAuthIntent.REAUTH,
        userId,
        nonce: randomToken(),
        codeVerifier: provider === 'google' ? randomToken(48) : null,
        expiresAt: new Date(Date.now() + FLOW_TTL_MS),
      },
    });
    return {
      url: `${this.config.publicApiUrl}/auth/oauth/${provider}/start?flow=${encodeURIComponent(state)}`,
    };
  }

  /** Abre un flujo preparado: lo ata a este navegador y redirige al proveedor. */
  async startPrepared(
    provider: ProviderSlug,
    state: string,
  ): Promise<StartResult> {
    this.assertEnabled(provider);
    const stateHash = sha256(state);
    const browserSecret = randomToken();
    // Solo una vez: browserHash pasa de '' a un valor en una sola operación.
    const { count } = await this.prisma.oAuthFlow.updateMany({
      where: {
        stateHash,
        provider: PROVIDER_ENUM[provider],
        browserHash: '',
        claimedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { browserHash: sha256(browserSecret) },
    });
    if (count !== 1)
      throw new BadRequestException('This link has expired. Try again.');
    const flow = await this.prisma.oAuthFlow.findUniqueOrThrow({
      where: { stateHash },
      select: { nonce: true, codeVerifier: true },
    });
    return {
      redirectUrl: this.authorizeUrl(
        provider,
        state,
        flow.nonce,
        flow.codeVerifier,
      ),
      browserSecret,
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Vuelta del proveedor
  // ---------------------------------------------------------------------------

  /** Devuelve SIEMPRE la URL del frontend a la que redirigir (con #result o #error). */
  async callback(
    provider: ProviderSlug,
    params: CallbackParams,
    browserSecret: string | null,
  ): Promise<string> {
    const fail = (code: string) =>
      `${this.config.frontendUrl}/auth/callback#error=${code}&provider=${provider}`;
    if (!this.config.enabled(provider)) return fail('not_configured');
    if (!params.state || params.state.length > 200)
      return fail('invalid_state');

    const flow = await this.prisma.oAuthFlow.findUnique({
      where: { stateHash: sha256(params.state) },
    });
    if (
      !flow ||
      flow.provider !== PROVIDER_ENUM[provider] ||
      flow.claimedAt ||
      flow.expiresAt < new Date()
    ) {
      return fail('expired');
    }
    // ¿Es el mismo navegador que empezó? (la cookie solo la tiene ese navegador)
    if (
      !browserSecret ||
      !flow.browserHash ||
      !safeEqual(sha256(browserSecret), flow.browserHash)
    ) {
      return fail('browser_mismatch');
    }
    // Cada flujo se usa una sola vez (aunque lleguen dos vueltas a la vez).
    const claimed = await this.prisma.oAuthFlow.updateMany({
      where: { id: flow.id, claimedAt: null },
      data: { claimedAt: new Date() },
    });
    if (claimed.count !== 1) return fail('expired');

    if (params.error || !params.code) {
      await this.prisma.oAuthFlow
        .delete({ where: { id: flow.id } })
        .catch(() => undefined);
      const cancelled =
        params.error === 'access_denied' ||
        params.error === 'user_cancelled_authorize';
      return fail(cancelled ? 'cancelled' : 'provider_error');
    }

    let outcome: Outcome;
    try {
      outcome = await this.identify(
        provider,
        params,
        flow.nonce,
        flow.codeVerifier,
      );
    } catch (err) {
      await this.prisma.oAuthFlow
        .delete({ where: { id: flow.id } })
        .catch(() => undefined);
      // Solo el mensaje (nunca lleva tokens ni secretos).
      this.logger.warn(
        `OAuth ${provider}: ${err instanceof Error ? err.message : 'error'}`,
      );
      return fail('provider_error');
    }

    const result = randomToken();
    await this.prisma.oAuthFlow.update({
      where: { id: flow.id },
      data: {
        resultHash: sha256(result),
        outcome: outcome as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + RESULT_TTL_MS),
      },
    });
    const intent = flow.intent.toLowerCase();
    return `${this.config.frontendUrl}/auth/callback#result=${result}&intent=${intent}&provider=${provider}`;
  }

  private async identify(
    provider: ProviderSlug,
    p: CallbackParams,
    nonce: string,
    codeVerifier: string | null,
  ): Promise<Outcome> {
    const code = p.code!;
    if (code.length > 2000) throw new ProviderError('code too long');
    if (provider === 'google') {
      if (!codeVerifier) throw new ProviderError('missing PKCE verifier');
      return this.google!.identify(code, codeVerifier, nonce);
    }
    if (provider === 'apple') return this.apple!.identify(code, nonce, p.user);

    const ig = this.instagram!;
    const { userId, token } = await ig.connect(code);
    const profile = await ig.profile(token.accessToken);
    return {
      provider: 'INSTAGRAM',
      sub: userId,
      username: profile.username,
      tokenEnc: this.config.cipher!.encrypt(token.accessToken),
      tokenExpiresAt: new Date(
        Date.now() + token.expiresIn * 1000,
      ).toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // 3. Canje en el frontend
  // ---------------------------------------------------------------------------

  /** LOGIN: canjea el código de un solo uso por la sesión de MyOO. */
  async exchangeLogin(result: string): Promise<LoginExchangeResult> {
    const flow = await this.take(result);
    if (!flow || flow.intent !== OAuthIntent.LOGIN || !flow.outcome)
      throw this.expired();
    const identity = flow.outcome as unknown as VerifiedIdentity;
    const resolved = await this.resolveLogin(identity);
    if (resolved.created && identity.picture)
      await this.importGooglePhoto(resolved.userId, identity.picture);
    const auth = await this.auth.issue(resolved.userId);
    return {
      ...auth,
      created: resolved.created,
      passwordRemoved: resolved.passwordRemoved,
    };
  }

  /** LINK o REAUTH: necesita la sesión del MISMO usuario que empezó el flujo. */
  async exchangeForUser(
    userId: string,
    result: string,
  ): Promise<UserExchangeResult> {
    const flow = await this.take(result);
    if (!flow || flow.intent === OAuthIntent.LOGIN || !flow.outcome)
      throw this.expired();
    // Si alguien te pasa SU enlace, tu sesión no coincide y no se conecta nada.
    if (flow.userId !== userId)
      throw new ForbiddenException(
        'This connection was started from another account',
      );
    const slug = PROVIDER_SLUG[flow.provider];
    const outcome = flow.outcome as unknown as Outcome;

    if (flow.intent === OAuthIntent.LINK) {
      if (outcome.provider === 'INSTAGRAM')
        await this.linkInstagram(userId, outcome);
      else await this.linkIdentity(userId, outcome);
      return { intent: 'link', provider: slug };
    }

    // REAUTH: la cuenta con la que se ha entrado tiene que ser la conectada.
    if (outcome.provider === 'INSTAGRAM')
      throw new BadRequestException('Instagram cannot confirm your identity');
    const acc = await this.prisma.authAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: flow.provider,
          providerAccountId: outcome.sub,
        },
      },
      select: { userId: true },
    });
    if (!acc || acc.userId !== userId) {
      throw new ForbiddenException(
        `That ${PROVIDER_NAME[flow.provider]} account is not the one connected to your profile`,
      );
    }
    const proof = randomToken();
    await this.prisma.oAuthFlow.create({
      data: {
        stateHash: sha256(randomToken()),
        browserHash: '',
        provider: flow.provider,
        intent: OAuthIntent.REAUTH,
        userId,
        nonce: '-',
        claimedAt: new Date(),
        proofHash: sha256(proof),
        expiresAt: new Date(Date.now() + PROOF_TTL_MS),
      },
    });
    return { intent: 'reauth', provider: slug, reauthToken: proof };
  }

  /**
   * Gasta una prueba de identidad (REAUTH). true si era válida, de este
   * usuario y no había caducado. Solo sirve una vez.
   */
  async consumeReauthProof(userId: string, token: string): Promise<boolean> {
    const { count } = await this.prisma.oAuthFlow.deleteMany({
      where: {
        proofHash: sha256(token),
        userId,
        intent: OAuthIntent.REAUTH,
        expiresAt: { gt: new Date() },
      },
    });
    return count === 1;
  }

  // ---------------------------------------------------------------------------
  // Cuentas
  // ---------------------------------------------------------------------------

  /**
   * Busca o crea el usuario de un login con Google/Apple:
   *  1. Si esa cuenta del proveedor ya está conectada → ese usuario.
   *  2. Si no, y existe un usuario con el mismo email, se conectan SOLO si el
   *     proveedor confirma que el email es suyo (email_verified).
   *     Protección extra ("pre-account takeover"): MyOO no verifica el email
   *     al registrarse con contraseña, así que alguien podría haber creado la
   *     cuenta con TU email antes que tú. Si esa cuenta tiene contraseña y su
   *     email nunca se verificó, se quita la contraseña al conectarla: así
   *     esa persona no puede seguir entrando. Su dueño real puede crear una
   *     nueva desde el perfil.
   *  3. Si no existe, se crea la cuenta (sin contraseña).
   */
  async resolveLogin(
    identity: VerifiedIdentity,
  ): Promise<{ userId: string; created: boolean; passwordRemoved: boolean }> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction((tx) =>
          this.resolveLoginTx(tx, identity),
        );
      } catch (err) {
        // Dos logins a la vez del mismo usuario nuevo: el segundo choca con la
        // restricción UNIQUE; al repetir, encuentra lo que creó el primero.
        if (
          attempt === 0 &&
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        )
          continue;
        throw err;
      }
    }
  }

  private async resolveLoginTx(
    tx: Prisma.TransactionClient,
    id: VerifiedIdentity,
  ): Promise<{ userId: string; created: boolean; passwordRemoved: boolean }> {
    const provider = AuthProvider[id.provider];
    const linked = await tx.authAccount.findUnique({
      where: {
        provider_providerAccountId: { provider, providerAccountId: id.sub },
      },
      select: { id: true, userId: true },
    });
    if (linked) {
      // Apple puede no volver a mandar el email; solo se actualiza si llega.
      if (id.email)
        await tx.authAccount.update({
          where: { id: linked.id },
          data: { email: id.email },
        });
      return { userId: linked.userId, created: false, passwordRemoved: false };
    }

    if (!id.email)
      throw new BadRequestException({
        message: `${PROVIDER_NAME[provider]} did not share your email`,
        code: 'email_missing',
      });
    if (!id.emailVerified) {
      throw new BadRequestException({
        message: `${PROVIDER_NAME[provider]} has not verified your email`,
        code: 'email_unverified',
      });
    }

    const existing = await tx.user.findUnique({
      where: { email: id.email },
      select: { id: true, passwordHash: true, emailVerifiedAt: true },
    });
    if (existing) {
      const other = await tx.authAccount.findUnique({
        where: { userId_provider: { userId: existing.id, provider } },
        select: { id: true },
      });
      if (other) {
        throw new ConflictException({
          message: `Your MyOO account is connected to a different ${PROVIDER_NAME[provider]} account`,
          code: 'provider_already_linked',
        });
      }
      const removePassword =
        existing.passwordHash !== null && existing.emailVerifiedAt === null;
      await tx.authAccount.create({
        data: {
          userId: existing.id,
          provider,
          providerAccountId: id.sub,
          email: id.email,
        },
      });
      await tx.user.update({
        where: { id: existing.id },
        data: {
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
          ...(removePassword ? { passwordHash: null } : {}),
        },
      });
      return {
        userId: existing.id,
        created: false,
        passwordRemoved: removePassword,
      };
    }

    const user = await tx.user.create({
      data: {
        email: id.email,
        emailVerifiedAt: new Date(),
        passwordHash: null,
        displayName: id.name?.slice(0, 60) || null,
        authAccounts: {
          create: { provider, providerAccountId: id.sub, email: id.email },
        },
      },
      select: { id: true },
    });
    return { userId: user.id, created: true, passwordRemoved: false };
  }

  private async linkIdentity(
    userId: string,
    id: VerifiedIdentity,
  ): Promise<void> {
    const provider = AuthProvider[id.provider];
    const name = PROVIDER_NAME[provider];
    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.authAccount.findUnique({
          where: {
            provider_providerAccountId: { provider, providerAccountId: id.sub },
          },
          select: { userId: true },
        });
        if (existing) {
          if (existing.userId === userId) return;
          throw new ConflictException({
            message: `This ${name} account is already connected to another MyOO account`,
            code: 'linked_to_other_user',
          });
        }
        await tx.authAccount.create({
          data: {
            userId,
            provider,
            providerAccountId: id.sub,
            email: id.email,
          },
        });
        // Si el proveedor confirma que el email de la cuenta es suyo, queda verificado.
        const user = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { email: true, emailVerifiedAt: true },
        });
        if (
          id.emailVerified &&
          id.email === user.email &&
          !user.emailVerifiedAt
        ) {
          await tx.user.update({
            where: { id: userId },
            data: { emailVerifiedAt: new Date() },
          });
        }
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          message: `You already have a ${name} account connected. Disconnect it first.`,
          code: 'provider_already_linked',
        });
      }
      throw err;
    }
  }

  private async linkInstagram(
    userId: string,
    o: InstagramOutcome,
  ): Promise<void> {
    const data = {
      providerAccountId: o.sub,
      username: o.username,
      accessTokenEnc: o.tokenEnc,
      tokenExpiresAt: new Date(o.tokenExpiresAt),
      tokenRefreshedAt: new Date(),
    };
    try {
      // Una cuenta de Instagram por usuario: si ya había otra, se sustituye.
      await this.prisma.authAccount.upsert({
        where: {
          userId_provider: { userId, provider: AuthProvider.INSTAGRAM },
        },
        create: { userId, provider: AuthProvider.INSTAGRAM, ...data },
        update: data,
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          message:
            'This Instagram account is already connected to another MyOO account',
          code: 'linked_to_other_user',
        });
      }
      throw err;
    }
    // Si no había puesto su @ a mano, se rellena.
    await this.prisma.user.updateMany({
      where: { id: userId, instagramHandle: null },
      data: { instagramHandle: o.username.slice(0, 30) },
    });
  }

  /**
   * Desconecta un proveedor. No deja la cuenta sin ninguna forma de entrar:
   * para quitar Google o Apple tiene que quedar una contraseña u otro login.
   */
  async unlink(userId: string, provider: AuthProvider): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Bloqueo de la fila del usuario: dos desconexiones a la vez no lo dejan sin acceso.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          passwordHash: true,
          authAccounts: { select: { provider: true } },
        },
      });
      if (!user) throw new NotFoundException('User not found');
      if (!user.authAccounts.some((a) => a.provider === provider))
        throw new NotFoundException(
          `${PROVIDER_NAME[provider]} is not connected`,
        );
      if (provider !== AuthProvider.INSTAGRAM) {
        const otherLogins = user.authAccounts.filter(
          (a) =>
            a.provider !== provider && a.provider !== AuthProvider.INSTAGRAM,
        ).length;
        if (user.passwordHash === null && otherLogins === 0) {
          throw new ConflictException({
            message: `Create a password first: ${PROVIDER_NAME[provider]} is your only way to sign in`,
            code: 'last_login_method',
          });
        }
      }
      await tx.authAccount.delete({
        where: { userId_provider: { userId, provider } },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Ayudas
  // ---------------------------------------------------------------------------

  /** Coge (y borra) el flujo de un código de resultado. Solo funciona una vez. */
  private async take(result: string) {
    if (!result || result.length > 200) return null;
    try {
      const flow = await this.prisma.oAuthFlow.delete({
        where: { resultHash: sha256(result) },
      });
      return flow.expiresAt > new Date() ? flow : null;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2025'
      )
        return null;
      throw err;
    }
  }

  private expired() {
    return new BadRequestException({
      message: 'This sign-in has expired. Please try again.',
      code: 'expired',
    });
  }

  private assertEnabled(provider: ProviderSlug): void {
    if (!this.config.enabled(provider)) {
      throw new BadRequestException({
        message: `${PROVIDER_NAME[PROVIDER_ENUM[provider]]} is not configured on this server`,
        code: 'not_configured',
      });
    }
  }

  private authorizeUrl(
    provider: ProviderSlug,
    state: string,
    nonce: string,
    codeVerifier: string | null,
  ): string {
    if (provider === 'google')
      return this.google!.authorizeUrl({
        state,
        nonce,
        codeChallenge: pkceChallenge(codeVerifier!),
      });
    if (provider === 'apple') return this.apple!.authorizeUrl({ state, nonce });
    return this.instagram!.authorizeUrl({ state });
  }

  /** Borra los flujos caducados (se llama al empezar uno nuevo). */
  private async cleanup(): Promise<void> {
    await this.prisma.oAuthFlow
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => undefined);
  }

  /** La foto de Google se pone como foto de perfil al crear la cuenta (si falla, no pasa nada). */
  private async importGooglePhoto(
    userId: string,
    picture: string,
  ): Promise<void> {
    try {
      // "=s96-c" es una miniatura de 96 px: se pide a 400 px.
      const url = picture.replace(/=s\d+(-c)?$/, '=s400-c');
      const asset = await this.assets.importRemoteImage(
        userId,
        url,
        GOOGLE_PHOTO_HOSTS,
        'google-foto',
      );
      await this.prisma.user.update({
        where: { id: userId },
        data: { avatarAssetId: asset.id },
      });
    } catch {
      this.logger.warn('No se pudo importar la foto de Google');
    }
  }
}
