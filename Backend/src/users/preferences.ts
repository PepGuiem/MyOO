import { BadRequestException } from '@nestjs/common';

/**
 * Ajustes de la web de cada usuario («Personalizar»): color neón, menú,
 * efectos, lectura y calidad 3D. Se guardan en la cuenta (User.preferences,
 * JSON) para que sean los mismos en el ordenador, el móvil y la app.
 *
 * Formato cerrado: solo se aceptan estas claves y valores. Las listas del menú
 * usan identificadores estables (no renombrar: están guardados en cuentas).
 */

export const ACCENTS = ['orange', 'red', 'pink', 'violet', 'blue', 'green', 'custom'] as const;
export const NEON_LEVELS = ['full', 'soft', 'off'] as const;
export const BACKGROUNDS = ['animated', 'still', 'off'] as const;
export const MOTIONS = ['full', 'reduced'] as const;
export const TEXT_SIZES = ['small', 'normal', 'large'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;
export const QUALITIES = ['high', 'saver'] as const;

/** Entradas del menú que se pueden ocultar o fijar (Inicio y Armario siempre están). */
export const NAV_ITEMS = [
  'outfits',
  'calendar',
  'stylist',
  'mannequins',
  'sneakers',
  'wishlist',
  'analytics',
  'messages',
  'people',
  'battles',
  'market',
  'ideas',
  'news',
] as const;
/** Grupos del menú que se pueden reordenar. */
export const NAV_GROUPS = ['style', 'collection', 'community'] as const;

export interface MenuPreferences {
  /** Menú de solo iconos en escritorio. */
  compact: boolean;
  hidden: (typeof NAV_ITEMS)[number][];
  /** Favoritas, en este orden, justo debajo de Inicio y Armario. */
  pinned: (typeof NAV_ITEMS)[number][];
  groupOrder: (typeof NAV_GROUPS)[number][];
}

export interface Preferences {
  accent: (typeof ACCENTS)[number];
  /** Solo con accent = custom: #RRGGBB. */
  customAccent: string | null;
  neon: (typeof NEON_LEVELS)[number];
  background: (typeof BACKGROUNDS)[number];
  motion: (typeof MOTIONS)[number];
  textSize: (typeof TEXT_SIZES)[number];
  density: (typeof DENSITIES)[number];
  quality3d: (typeof QUALITIES)[number];
  menu: MenuPreferences;
}

export const DEFAULT_PREFERENCES: Preferences = {
  accent: 'orange',
  customAccent: null,
  neon: 'full',
  background: 'animated',
  motion: 'full',
  textSize: 'normal',
  density: 'comfortable',
  quality3d: 'high',
  menu: { compact: false, hidden: [], pinned: [], groupOrder: [...NAV_GROUPS] },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const TOP_KEYS = new Set(['accent', 'customAccent', 'neon', 'background', 'motion', 'textSize', 'density', 'quality3d', 'menu']);
const MENU_KEYS = new Set(['compact', 'hidden', 'pinned', 'groupOrder']);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pick<T extends readonly string[]>(value: unknown, allowed: T, field: string, strict: boolean, fallback: T[number]): T[number] {
  if (value === undefined) return fallback;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T[number];
  if (strict) throw new BadRequestException(`Invalid value for ${field}`);
  return fallback;
}

function list<T extends readonly string[]>(value: unknown, allowed: T, field: string, strict: boolean): T[number][] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    if (strict) throw new BadRequestException(`${field} must be a list`);
    return [];
  }
  const out: T[number][] = [];
  for (const v of value) {
    if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) {
      if (!out.includes(v as T[number])) out.push(v as T[number]);
    } else if (strict) throw new BadRequestException(`Invalid value in ${field}`);
  }
  return out;
}

function parse(input: unknown, strict: boolean): Preferences {
  if (!isObject(input)) {
    if (strict) throw new BadRequestException('Preferences must be an object');
    return structuredClone(DEFAULT_PREFERENCES);
  }
  if (strict) {
    for (const k of Object.keys(input)) if (!TOP_KEYS.has(k)) throw new BadRequestException(`Unknown preference: ${k}`);
  }
  const d = DEFAULT_PREFERENCES;
  const accent = pick(input.accent, ACCENTS, 'accent', strict, d.accent);
  let customAccent: string | null = null;
  if (input.customAccent !== undefined && input.customAccent !== null) {
    if (typeof input.customAccent === 'string' && HEX.test(input.customAccent)) customAccent = input.customAccent.toLowerCase();
    else if (strict) throw new BadRequestException('customAccent must be a #RRGGBB colour');
  }
  if (accent === 'custom' && !customAccent) {
    if (strict) throw new BadRequestException('A custom accent needs customAccent');
  }

  const rawMenu = input.menu;
  if (rawMenu !== undefined && !isObject(rawMenu) && strict) throw new BadRequestException('menu must be an object');
  const m = isObject(rawMenu) ? rawMenu : {};
  if (strict) {
    for (const k of Object.keys(m)) if (!MENU_KEYS.has(k)) throw new BadRequestException(`Unknown menu preference: ${k}`);
    if (m.compact !== undefined && typeof m.compact !== 'boolean') throw new BadRequestException('menu.compact must be true or false');
  }
  // El orden de los grupos siempre los lleva todos (los que falten, al final).
  const order = list(m.groupOrder, NAV_GROUPS, 'menu.groupOrder', strict);
  for (const g of NAV_GROUPS) if (!order.includes(g)) order.push(g);
  const hidden = list(m.hidden, NAV_ITEMS, 'menu.hidden', strict);
  // Una entrada oculta no puede estar fijada.
  const pinned = list(m.pinned, NAV_ITEMS, 'menu.pinned', strict).filter((p) => !hidden.includes(p));

  return {
    accent: accent === 'custom' && !customAccent ? d.accent : accent,
    customAccent,
    neon: pick(input.neon, NEON_LEVELS, 'neon', strict, d.neon),
    background: pick(input.background, BACKGROUNDS, 'background', strict, d.background),
    motion: pick(input.motion, MOTIONS, 'motion', strict, d.motion),
    textSize: pick(input.textSize, TEXT_SIZES, 'textSize', strict, d.textSize),
    density: pick(input.density, DENSITIES, 'density', strict, d.density),
    quality3d: pick(input.quality3d, QUALITIES, 'quality3d', strict, d.quality3d),
    menu: { compact: m.compact === true, hidden, pinned, groupOrder: order },
  };
}

/** Lo que manda el usuario: si algo no es válido, error 400 (nada se guarda a medias). */
export function parsePreferences(input: unknown): Preferences {
  const json = JSON.stringify(input ?? null);
  if (json.length > 4000) throw new BadRequestException('Preferences are too large');
  return parse(input, true);
}

/** Lo guardado en la base de datos: lo que no se entienda, a su valor por defecto. */
export function readPreferences(raw: unknown): Preferences | null {
  if (raw === null || raw === undefined) return null;
  return parse(raw, false);
}
