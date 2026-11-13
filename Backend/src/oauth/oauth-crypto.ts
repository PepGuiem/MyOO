import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Utilidades criptográficas pequeñas del flujo OAuth. Todo con el módulo
 * `node:crypto` de Node, sin dependencias.
 */

/** Valor aleatorio impredecible, en base64url (seguro en URLs y cookies). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** SHA-256 en hexadecimal (64 caracteres). En la base de datos se guardan
 * los hashes de los valores de un solo uso, nunca los valores. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Reto PKCE (método S256) a partir del "code verifier". */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** Compara dos textos sin filtrar por el tiempo cuánto se parecen. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Lee una cookie de la cabecera `Cookie` (sin cookie-parser). */
export function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Cifrado simétrico AES-256-GCM para los tokens de terceros guardados en la
 * base de datos (Instagram). Si alguien lee la base de datos, sin la clave
 * (que está en el .env, no en la base de datos) no puede usar los tokens.
 *
 * Formato: "v1:<iv>:<tag>:<cifrado>" (base64url). GCM además detecta si el
 * texto cifrado se ha manipulado.
 */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    this.key = Buffer.from(base64Key, 'base64');
    if (this.key.length !== 32)
      throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      data.toString('base64url'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const [version, iv, tag, data] = payload.split(':');
    if (version !== 'v1' || !iv || !tag || data === undefined)
      throw new Error('Invalid encrypted token');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
