import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usersApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { t } from '../i18n';

/**
 * «Personalizar»: ajustes de la web de cada usuario (color neón, menú,
 * efectos, lectura y 3D). Se guardan en la cuenta (PUT /users/me/preferences)
 * y, además, en este navegador (`myout.prefs`) para aplicarlos al instante al
 * abrir la web, antes de saber quién eres.
 *
 * Se aplican con variables CSS y atributos en <html> (data-neon, data-bg,
 * data-motion, data-text, data-density, data-menu); ver el bloque
 * «Personalizar» al final de styles.css.
 */

export const NAV_ITEM_IDS = [
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
export type NavItemId = (typeof NAV_ITEM_IDS)[number];
export const NAV_GROUP_IDS = ['style', 'collection', 'community'] as const;
export type NavGroupId = (typeof NAV_GROUP_IDS)[number];

export type AccentId = 'orange' | 'red' | 'pink' | 'violet' | 'blue' | 'green' | 'custom';

export interface Preferences {
  accent: AccentId;
  customAccent: string | null;
  neon: 'full' | 'soft' | 'off';
  background: 'animated' | 'still' | 'off';
  motion: 'full' | 'reduced';
  textSize: 'small' | 'normal' | 'large';
  density: 'comfortable' | 'compact';
  quality3d: 'high' | 'saver';
  menu: { compact: boolean; hidden: NavItemId[]; pinned: NavItemId[]; groupOrder: NavGroupId[] };
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
  menu: { compact: false, hidden: [], pinned: [], groupOrder: [...NAV_GROUP_IDS] },
};

/**
 * Paletas neón. Cada una tiene 5 tonos, como la original (naranja → rojo →
 * rosa): principal, caliente, rojo, rosa y rosa claro. Todos los acentos
 * son lo bastante oscuros para que el texto blanco encima se lea.
 */
export const ACCENT_PRESETS: Record<Exclude<AccentId, 'custom'>, { label: string; tones: [string, string, string, string, string] }> = {
  orange: { label: t('Naranja'), tones: ['#ff4d00', '#ff1744', '#ff2d4a', '#ff3d6e', '#ff4f8b'] },
  red: { label: t('Rojo'), tones: ['#ff1f3d', '#e0003c', '#ff2d55', '#ff4d6d', '#ff6f8a'] },
  pink: { label: t('Rosa'), tones: ['#ff2e88', '#e6007a', '#ff3d9a', '#ff5cae', '#ff7ac0'] },
  violet: { label: t('Violeta'), tones: ['#9b4dff', '#6d28ff', '#a855ff', '#c06bff', '#d38aff'] },
  blue: { label: t('Azul'), tones: ['#2f7bff', '#1f4dff', '#3d8bff', '#4fa3ff', '#6fb8ff'] },
  green: { label: t('Verde'), tones: ['#00b85c', '#00965a', '#14c46c', '#2bd37f', '#4fe096'] },
};

// ---------------------------------------------------------------------------
// Colores

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Luminancia relativa (WCAG). */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Color propio → paleta de 5 tonos. Se oscurece si hace falta para que el
 * texto blanco encima se lea (contraste ≥ 3:1) y se satura para que siga
 * pareciendo neón; los demás tonos giran un poco el tono, como en la original.
 */
export function customTones(hex: string): [string, string, string, string, string] {
  const [h, s0, l0] = rgbToHsl(...hexToRgb(hex));
  const s = Math.max(s0, 0.75);
  let l = Math.min(Math.max(l0, 0.38), 0.6);
  let base = hslToHex(h, s, l);
  while (l > 0.3 && 1.05 / (luminance(base) + 0.05) < 3) {
    l -= 0.02;
    base = hslToHex(h, s, l);
  }
  return [base, hslToHex(h - 14, 1, Math.max(0.42, l - 0.04)), hslToHex(h - 8, 1, l + 0.02), hslToHex(h + 8, 1, Math.min(0.66, l + 0.08)), hslToHex(h + 16, 1, Math.min(0.72, l + 0.14))];
}

export function accentTones(p: Pick<Preferences, 'accent' | 'customAccent'>): [string, string, string, string, string] {
  if (p.accent === 'custom' && p.customAccent) return customTones(p.customAccent);
  return ACCENT_PRESETS[p.accent === 'custom' ? 'orange' : p.accent].tones;
}

// ---------------------------------------------------------------------------
// Aplicar

/** Pone los ajustes en <html>: variables de color y atributos para el CSS. */
export function applyPreferences(p: Preferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const tones = accentTones(p);
  const names = ['--neon', '--neon-2', '--neon-3', '--neon-4', '--neon-5'];
  tones.forEach((hex, i) => {
    root.style.setProperty(names[i], hex);
    root.style.setProperty(`${names[i]}-rgb`, hexToRgb(hex).join(' '));
  });
  root.dataset.neon = p.neon;
  root.dataset.bg = p.background;
  root.dataset.motion = p.motion;
  root.dataset.text = p.textSize;
  root.dataset.density = p.density;
  root.dataset.menu = p.menu.compact ? 'compact' : 'full';
  root.dataset.quality = p.quality3d;
  window.dispatchEvent(new CustomEvent('myout:prefs', { detail: p }));
}

/** Color neón principal ahora mismo (para el 3D, que no lee CSS). */
export function currentNeon(): string {
  if (typeof document === 'undefined') return '#ff4d00';
  return getComputedStyle(document.documentElement).getPropertyValue('--neon').trim() || '#ff4d00';
}

/** ¿Hay que reducir animaciones? (sistema o ajuste del usuario). */
export function motionReduced(): boolean {
  if (typeof window === 'undefined') return false;
  return document.documentElement.dataset.motion === 'reduced' || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Calidad 3D elegida (para el canvas de las miniaturas). */
export function quality3d(): Preferences['quality3d'] {
  if (typeof document === 'undefined') return 'high';
  return document.documentElement.dataset.quality === 'saver' ? 'saver' : 'high';
}

/** Se vuelve a pintar cuando cambian los ajustes (para lo que no va por CSS). */
export function usePreferenceVersion(): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener('myout:prefs', on);
    return () => window.removeEventListener('myout:prefs', on);
  }, []);
  return v;
}

// ---------------------------------------------------------------------------
// Guardado local (para aplicar al instante al abrir)

const CACHE_KEY = 'myout.prefs';

/** Completa y limpia unos ajustes (de la API o de este navegador). */
export function normalizePreferences(raw: unknown): Preferences {
  const d = DEFAULT_PREFERENCES;
  if (!raw || typeof raw !== 'object') return structuredClone(d);
  const r = raw as Partial<Preferences> & { menu?: Partial<Preferences['menu']> };
  const one = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T => (allowed.includes(v as T) ? (v as T) : fb);
  const list = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
    Array.isArray(v) ? [...new Set(v.filter((x): x is T => allowed.includes(x as T)))] : [];
  const customAccent = typeof r.customAccent === 'string' && /^#[0-9a-f]{6}$/i.test(r.customAccent) ? r.customAccent.toLowerCase() : null;
  let accent = one<AccentId>(r.accent, ['orange', 'red', 'pink', 'violet', 'blue', 'green', 'custom'], d.accent);
  if (accent === 'custom' && !customAccent) accent = 'orange';
  const hidden = list(r.menu?.hidden, NAV_ITEM_IDS);
  const order = list(r.menu?.groupOrder, NAV_GROUP_IDS);
  for (const g of NAV_GROUP_IDS) if (!order.includes(g)) order.push(g);
  return {
    accent,
    customAccent,
    neon: one(r.neon, ['full', 'soft', 'off'] as const, d.neon),
    background: one(r.background, ['animated', 'still', 'off'] as const, d.background),
    motion: one(r.motion, ['full', 'reduced'] as const, d.motion),
    textSize: one(r.textSize, ['small', 'normal', 'large'] as const, d.textSize),
    density: one(r.density, ['comfortable', 'compact'] as const, d.density),
    quality3d: one(r.quality3d, ['high', 'saver'] as const, d.quality3d),
    menu: {
      compact: r.menu?.compact === true,
      hidden,
      pinned: list(r.menu?.pinned, NAV_ITEM_IDS).filter((x) => !hidden.includes(x)),
      groupOrder: order,
    },
  };
}

/** Lo guardado en este navegador: los ajustes y de qué cuenta son. */
function readCache(): { userId: string | null; prefs: Preferences } {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { userId?: unknown; prefs?: unknown } | null;
    return {
      userId: typeof raw?.userId === 'string' ? raw.userId : null,
      prefs: normalizePreferences(raw?.prefs ?? null),
    };
  } catch {
    return { userId: null, prefs: structuredClone(DEFAULT_PREFERENCES) };
  }
}

export function readCachedPreferences(): Preferences {
  return readCache().prefs;
}

function cachePreferences(p: Preferences, userId: string | null): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId, prefs: p }));
  } catch {
    // sin almacenamiento (modo privado): se aplica igual, solo que no se recuerda aquí
  }
}

// ---------------------------------------------------------------------------
// Contexto

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface PreferencesState {
  prefs: Preferences;
  /** Cambia uno o varios ajustes: se aplica al momento y se guarda en la cuenta. */
  update: (patch: Partial<Preferences> | ((p: Preferences) => Preferences)) => void;
  reset: () => void;
  saveState: SaveState;
}

const PreferencesContext = createContext<PreferencesState | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const [prefs, setPrefs] = useState<Preferences>(readCachedPreferences);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<Preferences | null>(null);
  const userRef = useRef(user);
  userRef.current = user;

  // Al iniciar sesión (o recargar), mandan los de la cuenta. Si la cuenta aún
  // no tiene ninguno guardado, se quedan los de este navegador si eran suyos;
  // si eran de otra cuenta, los de por defecto.
  const accountPrefs = user?.preferences;
  useEffect(() => {
    if (!user) return;
    if (pending.current) return; // hay cambios propios sin guardar todavía
    if (accountPrefs) setPrefs(normalizePreferences(accountPrefs));
    else {
      const cache = readCache();
      setPrefs(cache.userId === user.id ? cache.prefs : structuredClone(DEFAULT_PREFERENCES));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, JSON.stringify(accountPrefs ?? null)]);

  const userId = user?.id ?? null;
  useEffect(() => {
    applyPreferences(prefs);
    cachePreferences(prefs, userId);
  }, [prefs, userId]);

  const flush = useCallback(async () => {
    const p = pending.current;
    pending.current = null;
    if (!p || !userRef.current) return;
    setSaveState('saving');
    try {
      const saved = await usersApi.savePreferences(p);
      setSaveState('saved');
      const u = userRef.current;
      if (u) setUser({ ...u, preferences: saved });
    } catch {
      setSaveState('error');
    }
  }, [setUser]);

  const update = useCallback<PreferencesState['update']>(
    (patch) => {
      setPrefs((cur) => {
        const next = normalizePreferences(typeof patch === 'function' ? patch(cur) : { ...cur, ...patch });
        pending.current = next;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void flush(), 700);
        return next;
      });
    },
    [flush],
  );

  const reset = useCallback(() => update(() => structuredClone(DEFAULT_PREFERENCES)), [update]);

  // Si se cierra la pestaña con cambios a medio guardar, se intenta ya.
  useEffect(() => {
    const onHide = () => {
      if (pending.current) {
        window.clearTimeout(timer.current);
        void flush();
      }
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  const value = useMemo(() => ({ prefs, update, reset, saveState }), [prefs, update, reset, saveState]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesState {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences fuera de PreferencesProvider');
  return ctx;
}
