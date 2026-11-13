import { STYLE_TAG_KEYS } from '../stylist/vocabulary';

/**
 * Opciones del perfil. Los estilos son los mismos que usa el estilista para
 * las prendas (así más adelante puede tener en cuenta los del perfil).
 */
export const PROFILE_STYLE_TAGS = STYLE_TAG_KEYS;
export const MAX_PROFILE_STYLE_TAGS = 5;
export const MAX_FAVORITE_COLORS = 6;

/** @usuario: 3-30 caracteres, minúsculas, números, punto y guion bajo; sin punto al principio ni al final. */
export const USERNAME_PATTERN = /^(?!\.)(?!.*\.$)(?!.*\.\.)[a-z0-9._]{3,30}$/;

/** Nombres que no se pueden coger (rutas de la web, marca, cuentas del sistema). */
export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'help',
  'login',
  'logout',
  'me',
  'myout',
  'null',
  'perfil',
  'profile',
  'register',
  'root',
  'settings',
  'soporte',
  'staff',
  'support',
  'system',
  'undefined',
  'www',
]);

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export function isValidUsername(u: string): boolean {
  return USERNAME_PATTERN.test(u) && !RESERVED_USERNAMES.has(u);
}
