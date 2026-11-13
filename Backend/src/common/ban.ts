import { ForbiddenException } from '@nestjs/common';

/** Campos de baneo de un usuario. */
export interface BanFields {
  bannedAt: Date | null;
  bannedUntil: Date | null;
  banReason: string | null;
}

export const banSelect = {
  bannedAt: true,
  bannedUntil: true,
  banReason: true,
} as const;

/** ¿Está baneado ahora? (un baneo temporal ya cumplido no cuenta). */
export function isBanned(u: BanFields, now = new Date()): boolean {
  return u.bannedAt !== null && (u.bannedUntil === null || u.bannedUntil > now);
}

/** Filtro de Prisma: usuarios que NO están baneados ahora. */
export function notBannedWhere(now = new Date()) {
  return { OR: [{ bannedAt: null }, { bannedUntil: { lte: now } }] };
}

/**
 * 403 con el código `banned`, el motivo y hasta cuándo. El frontend cierra la
 * sesión y lo enseña en la pantalla de acceso.
 */
export function bannedError(u: BanFields): ForbiddenException {
  return new ForbiddenException({
    message: 'Your account is suspended',
    code: 'banned',
    reason: u.banReason,
    until: u.bannedUntil,
  });
}
