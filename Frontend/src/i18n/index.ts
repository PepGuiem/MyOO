import { EN } from './en';

/**
 * Idiomas de MyOut: español (el original) e inglés.
 *
 * - El texto en español ES la clave: `t('Guardar')` devuelve «Save» en inglés.
 *   Si falta una traducción se ve el español (nunca un hueco).
 * - Variables con llaves: `t('Hola, {name}', { name })`.
 * - El idioma se decide al cargar la página (cuenta → localStorage →
 *   navegador) y cambiarlo recarga la página. Así `t()` funciona en cualquier
 *   sitio, también en constantes de módulo, sin contextos ni re-renders.
 */
export type Locale = 'es' | 'en';
export const LOCALES: Locale[] = ['es', 'en'];
export const LOCALE_NAMES: Record<Locale, string> = { es: 'Español', en: 'English' };

const KEY = 'myout.locale';

function stored(): Locale | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'es' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** Idioma del navegador: inglés si lo pide, si no, español. */
export function browserLocale(): Locale {
  const langs = typeof navigator === 'undefined' ? [] : [...(navigator.languages ?? []), navigator.language];
  const first = langs.find(Boolean)?.toLowerCase() ?? 'es';
  return first.startsWith('en') ? 'en' : 'es';
}

export const locale: Locale = stored() ?? browserLocale();
/** Etiqueta BCP 47 para Intl (fechas, números, monedas). */
export const LOCALE_TAG = locale === 'en' ? 'en-GB' : 'es-ES';

if (typeof document !== 'undefined') document.documentElement.lang = locale;

type Vars = Record<string, string | number | boolean | null | undefined>;

const missing = new Set<string>();

/** Traduce un texto escrito en español. */
export function t(es: string, vars?: Vars): string {
  // «Bajo##estilo»: el texto lleva un contexto para distinguir traducciones
  // (bajo de un pantalón ≠ tiro bajo). En español se ve sin el contexto.
  const hash = es.indexOf('##');
  let s = hash >= 0 ? es.slice(0, hash) : es;
  if (locale === 'en') {
    const en = EN[es];
    if (en !== undefined) s = en;
    else if (import.meta.env?.DEV && !missing.has(es)) {
      missing.add(es);
      console.debug('[i18n] sin traducir:', es);
    }
  }
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? (vars[k] === false || vars[k] == null ? '' : String(vars[k])) : m)) : s;
}

/** Singular o plural según `n` (y `{n}` disponible en el texto). */
export function tn(n: number, one: string, other: string, vars?: Vars): string {
  return t(n === 1 ? one : other, { n, ...vars });
}

/**
 * Cambia el idioma y recarga la página. Devuelve false si no se pudo guardar
 * (navegación privada estricta): así nunca entra en un bucle de recargas.
 */
export function switchLocale(next: Locale): boolean {
  try {
    localStorage.setItem(KEY, next);
    if (localStorage.getItem(KEY) !== next) return false;
  } catch {
    return false;
  }
  if (next !== locale) window.location.reload();
  return true;
}

/** El idioma de la cuenta manda: si no coincide con el de esta página, se cambia. */
export function syncLocale(account: string | null | undefined): void {
  const want = account === 'EN' ? 'en' : account === 'ES' ? 'es' : null;
  if (want && want !== locale) switchLocale(want);
  else if (want) {
    try {
      localStorage.setItem(KEY, want);
    } catch {
      /* sin almacenamiento: se queda el idioma actual */
    }
  }
}

/** Para la cuenta: 'es' → 'ES'. */
export const toAccountLocale = (l: Locale): 'ES' | 'EN' => (l === 'en' ? 'EN' : 'ES');
