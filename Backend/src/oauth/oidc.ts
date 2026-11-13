import { JwtService } from '@nestjs/jwt';
import { createPublicKey, type JsonWebKey } from 'node:crypto';
import { fetchJson, ProviderError, type FetchLike } from './http';
import { safeEqual } from './oauth-crypto';

/**
 * Comprobación de los "ID tokens" de OpenID Connect (Google y Apple).
 *
 * Un ID token es un JWT firmado por el proveedor con su clave privada. Para
 * fiarnos de lo que dice (quién es el usuario, su email...) comprobamos:
 *   1. La firma, con las claves públicas del proveedor (su "JWKS").
 *   2. Quién lo emite (`iss`) y para quién es (`aud` = nuestro client id).
 *   3. Que no ha caducado (`exp`).
 *   4. Que el `nonce` es el que generamos al empezar: así un token robado de
 *      otro login no sirve aquí (protege frente a "replay").
 */

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  nonce?: string;
  email?: string;
  /** Google lo da como booleano; Apple a veces como texto ("true"). */
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  is_private_email?: boolean | string;
}

export interface VerifyOptions {
  jwksUri: string;
  issuers: string[];
  audience: string;
  nonce: string;
}

interface Jwks {
  keys: (JsonWebKey & { kid?: string; alg?: string; use?: string })[];
}

/** Las claves públicas se guardan una hora: los proveedores las rotan poco. */
const JWKS_TTL_MS = 60 * 60 * 1000;
/** Si llega un `kid` desconocido se vuelven a pedir, pero como mucho cada minuto. */
const JWKS_MIN_REFRESH_MS = 60 * 1000;

export class OidcVerifier {
  private readonly jwt = new JwtService();
  private readonly cache = new Map<string, { jwks: Jwks; fetchedAt: number }>();

  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async verify(idToken: string, opts: VerifyOptions): Promise<IdTokenClaims> {
    const decoded = this.jwt.decode<{
      header?: { kid?: string; alg?: string };
    } | null>(idToken, { complete: true });
    const kid = decoded?.header?.kid;
    if (!kid || decoded?.header?.alg !== 'RS256')
      throw new ProviderError('id_token: unexpected header');

    const jwk = await this.findKey(opts.jwksUri, kid);
    const publicKey = createPublicKey({ key: jwk, format: 'jwk' })
      .export({ type: 'spki', format: 'pem' })
      .toString();

    let claims: IdTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<IdTokenClaims & object>(idToken, {
        publicKey,
        algorithms: ['RS256'],
        audience: opts.audience,
        issuer: opts.issuers as [string, ...string[]],
        // Pequeño margen por si los relojes no van exactamente a la par.
        clockTolerance: 60,
      });
    } catch {
      throw new ProviderError('id_token: invalid signature or claims');
    }
    if (typeof claims.sub !== 'string' || !claims.sub)
      throw new ProviderError('id_token: missing sub');
    if (
      typeof claims.nonce !== 'string' ||
      !safeEqual(claims.nonce, opts.nonce)
    ) {
      throw new ProviderError('id_token: nonce mismatch');
    }
    return claims;
  }

  private async findKey(uri: string, kid: string): Promise<JsonWebKey> {
    const now = Date.now();
    let entry = this.cache.get(uri);
    if (!entry || now - entry.fetchedAt > JWKS_TTL_MS)
      entry = await this.load(uri);
    let key = entry.jwks.keys.find((k) => k.kid === kid);
    if (!key && now - entry.fetchedAt > JWKS_MIN_REFRESH_MS) {
      entry = await this.load(uri);
      key = entry.jwks.keys.find((k) => k.kid === kid);
    }
    if (!key) throw new ProviderError('id_token: unknown signing key');
    return key;
  }

  private async load(uri: string): Promise<{ jwks: Jwks; fetchedAt: number }> {
    const jwks = await fetchJson<Jwks>(this.fetchImpl, 'jwks', uri);
    if (!jwks || !Array.isArray(jwks.keys))
      throw new ProviderError('jwks: invalid response');
    const entry = { jwks, fetchedAt: Date.now() };
    this.cache.set(uri, entry);
    return entry;
  }
}

/** "true" / true → true. Todo lo demás → false. */
export function isTrue(v: unknown): boolean {
  return v === true || v === 'true';
}
