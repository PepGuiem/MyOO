import { createHash, randomBytes } from 'node:crypto';
import { EmailTokenPurpose } from '@prisma/client';

/**
 * Enlaces de un solo uso que se mandan por correo (verificar el email y poner
 * una contraseña nueva). Funciones puras, con tests en email-tokens.spec.ts.
 *
 * - El token es aleatorio (32 bytes) y viaja SOLO en el enlace del correo.
 * - En la base de datos se guarda su hash SHA-256: quien lea la base de datos
 *   no puede usar los enlaces. (SHA-256 basta: el token es largo y aleatorio,
 *   no una contraseña que se pueda adivinar.)
 */

/** Cuánto dura cada enlace. */
export const TOKEN_TTL_MS: Record<EmailTokenPurpose, number> = {
  [EmailTokenPurpose.VERIFY_EMAIL]: 24 * 60 * 60 * 1000,
  [EmailTokenPurpose.RESET_PASSWORD]: 60 * 60 * 1000,
};

/** Espera mínima entre dos correos del mismo tipo a la misma cuenta. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/** 32 bytes en base64url = 43 caracteres. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Token nuevo: el valor para el enlace y el hash para la base de datos. */
export function newEmailToken(
  purpose: EmailTokenPurpose,
  now = new Date(),
): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[purpose]),
  };
}

/** ¿Tiene forma de token? (evita consultar la base de datos con basura). */
export function looksLikeToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_FORMAT.test(value);
}

export type TokenProblem = 'invalid' | 'expired' | 'used';

/**
 * ¿Se puede usar este token? `row` es la fila encontrada por su hash (o null).
 * El email del token tiene que seguir siendo el de la cuenta.
 */
export function tokenProblem(
  row: {
    purpose: EmailTokenPurpose;
    expiresAt: Date;
    usedAt: Date | null;
    email: string;
  } | null,
  purpose: EmailTokenPurpose,
  currentEmail: string | null,
  now = new Date(),
): TokenProblem | null {
  if (!row || row.purpose !== purpose) return 'invalid';
  if (currentEmail === null || row.email !== currentEmail) return 'invalid';
  if (row.usedAt !== null) return 'used';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return null;
}
