/**
 * Estampados configurables de la tela (rayas, cuadros, lunares, camuflaje...).
 *
 * Cada estampado se dibuja en una "baldosa" que se repite sin costuras: una
 * textura cuyos 4 canales (RGBA) son la cobertura de cada uno de los 4
 * colores del estampado (0 = se ve la tela, 1 = se ve ese color). Así:
 * - los colores, el tamaño, el giro, la intensidad y el desplazamiento se
 *   aplican al pintar (en el shader del 3D o en la vista previa) y cambiarlos
 *   no obliga a rehacer la baldosa;
 * - el 3D y las miniaturas del panel usan exactamente el mismo dibujo.
 *
 * La baldosa solo depende del tipo, el número de colores, el grosor, la
 * cantidad y el suavizado. Se calcula por píxel con bordes suavizados
 * analíticamente (sin dientes de sierra).
 */
import type { PatternKind, PatternSpec, PatternTarget } from '../api/types';

export const PATTERN_LIMITS = {
  minSize: 0.005,
  maxSize: 0.4,
  minThickness: 0.02,
  maxThickness: 0.98,
  minCount: 1,
  maxCount: 6,
  maxColors: 4,
  minOpacity: 0.05,
} as const;

export const PATTERN_KINDS: PatternKind[] = [
  'stripes',
  'checks',
  'grid',
  'checkerboard',
  'tartan',
  'houndstooth',
  'herringbone',
  'chevron',
  'waves',
  'dots',
  'argyle',
  'camo',
  'leopard',
  'tiedye',
];

export interface KindInfo {
  label: string;
  /** Qué controla "cantidad" en este tipo (null = no se usa). */
  count: string | null;
  /** Qué controla "grosor" en este tipo (null = no se usa). */
  thickness: string | null;
  /** Cómo usa los colores. */
  colors: string;
}

export const KIND_INFO: Record<PatternKind, KindInfo> = {
  stripes: { label: 'Rayas', count: 'Líneas por color', thickness: 'Grosor de las rayas', colors: 'Cada color es una raya (o un grupo de líneas).' },
  checks: { label: 'Cuadros', count: 'Bandas por color', thickness: 'Anchura de las bandas', colors: 'Cada color es una banda en las dos direcciones; donde se cruzan, se mezclan.' },
  grid: { label: 'Cuadrícula', count: 'Líneas por color', thickness: 'Grosor de las líneas', colors: 'Cada color es una línea de la cuadrícula.' },
  checkerboard: { label: 'Tablero', count: null, thickness: null, colors: 'Color 1 en una casilla de cada dos; el color 2, en las otras (si lo eliges).' },
  tartan: { label: 'Escocés', count: 'Bandas', thickness: 'Anchura de las bandas', colors: 'Las bandas van alternando los colores, cruzadas como en un tejido.' },
  houndstooth: { label: 'Pata de gallo', count: null, thickness: 'Grosor del diente', colors: 'Usa el color 1.' },
  herringbone: { label: 'Espiga', count: 'Rayas por columna', thickness: 'Grosor', colors: 'Columnas alternas con el color 1 y el 2.' },
  chevron: { label: 'Zigzag', count: 'Líneas por color', thickness: 'Grosor', colors: 'Cada color es un zigzag.' },
  waves: { label: 'Ondas', count: 'Líneas por color', thickness: 'Grosor', colors: 'Cada color es una onda.' },
  dots: { label: 'Lunares', count: 'Lunares por fila', thickness: 'Tamaño del lunar', colors: 'Filas alternas con el color 1 y el 2.' },
  argyle: { label: 'Rombos', count: null, thickness: 'Tamaño de los rombos', colors: 'Rombos con el color 1 y el 2; el color 3 dibuja las líneas cruzadas.' },
  camo: { label: 'Camuflaje', count: 'Cantidad de manchas', thickness: 'Cobertura', colors: 'Cada color es una capa de manchas.' },
  leopard: { label: 'Animal', count: 'Manchas por fila', thickness: 'Tamaño de las manchas', colors: 'Color 1 en el borde de la mancha; color 2 dentro.' },
  tiedye: { label: 'Tie-dye', count: 'Bandas por color', thickness: 'Anchura de las bandas', colors: 'Bandas onduladas que van pasando por los colores.' },
};

export const PATTERN_TARGET_LABEL: Record<PatternTarget, string> = {
  main: 'Tela principal',
  secondary: 'Paneles',
  all: 'Toda la prenda',
};

/** Estilos rápidos: un tipo con unos ajustes de partida. */
export interface PatternPreset {
  id: string;
  label: string;
  kind: PatternKind;
  size: number;
  thickness: number;
  count: number;
  angle: number;
  /** Cuántos colores pide (si el usuario tiene menos, se le añaden). */
  colors: number;
  softness?: number;
  /** Colores de partida propios del estilo (camuflaje, leopardo...). */
  palette?: string[];
}

export const PATTERN_PRESETS: PatternPreset[] = [
  { id: 'stripes', label: 'Rayas', kind: 'stripes', size: 0.03, thickness: 0.5, count: 1, angle: 0, colors: 1 },
  { id: 'breton', label: 'Marinera', kind: 'stripes', size: 0.017, thickness: 0.34, count: 1, angle: 0, colors: 1 },
  { id: 'pinstripe', label: 'Diplomática', kind: 'stripes', size: 0.013, thickness: 0.1, count: 1, angle: 90, colors: 1 },
  { id: 'diagonal', label: 'Diagonales', kind: 'stripes', size: 0.028, thickness: 0.45, count: 1, angle: 45, colors: 1 },
  { id: 'rugby', label: 'Rugby', kind: 'stripes', size: 0.11, thickness: 0.5, count: 1, angle: 0, colors: 2 },
  { id: 'multi', label: 'Multicolor', kind: 'stripes', size: 0.07, thickness: 0.7, count: 1, angle: 0, colors: 3 },
  { id: 'double', label: 'Rayas dobles', kind: 'stripes', size: 0.035, thickness: 0.4, count: 2, angle: 0, colors: 1 },
  { id: 'gingham', label: 'Vichy', kind: 'checks', size: 0.012, thickness: 0.5, count: 1, angle: 0, colors: 1 },
  { id: 'buffalo', label: 'Leñador', kind: 'checks', size: 0.09, thickness: 0.5, count: 1, angle: 0, colors: 1 },
  { id: 'madras', label: 'Madrás', kind: 'checks', size: 0.08, thickness: 0.55, count: 2, angle: 0, colors: 3 },
  { id: 'windowpane', label: 'Cuadrícula', kind: 'grid', size: 0.07, thickness: 0.12, count: 1, angle: 0, colors: 1 },
  { id: 'checkerboard', label: 'Tablero', kind: 'checkerboard', size: 0.06, thickness: 0.5, count: 1, angle: 0, colors: 1 },
  { id: 'tartan', label: 'Escocés', kind: 'tartan', size: 0.13, thickness: 0.55, count: 4, angle: 0, colors: 3 },
  { id: 'houndstooth', label: 'Pata de gallo', kind: 'houndstooth', size: 0.022, thickness: 0.5, count: 1, angle: 0, colors: 1 },
  { id: 'herringbone', label: 'Espiga', kind: 'herringbone', size: 0.03, thickness: 0.5, count: 4, angle: 0, colors: 1 },
  { id: 'chevron', label: 'Zigzag', kind: 'chevron', size: 0.05, thickness: 0.45, count: 1, angle: 0, colors: 1 },
  { id: 'waves', label: 'Ondas', kind: 'waves', size: 0.045, thickness: 0.4, count: 1, angle: 0, colors: 1 },
  { id: 'dots', label: 'Lunares', kind: 'dots', size: 0.04, thickness: 0.5, count: 1, angle: 0, colors: 1 },
  { id: 'argyle', label: 'Rombos', kind: 'argyle', size: 0.12, thickness: 0.92, count: 1, angle: 0, colors: 3 },
  { id: 'camo', label: 'Camuflaje', kind: 'camo', size: 0.3, thickness: 0.5, count: 2, angle: 0, colors: 3, palette: ['#5F6B52', '#6B5236', '#1E1F1A'] },
  { id: 'leopard', label: 'Leopardo', kind: 'leopard', size: 0.2, thickness: 0.55, count: 2, angle: 0, colors: 2, palette: ['#1E1712', '#B07A3E'] },
  { id: 'tiedye', label: 'Tie-dye', kind: 'tiedye', size: 0.32, thickness: 0.8, count: 1, angle: 0, colors: 3, softness: 0.55, palette: ['#D9578C', '#5A8FD0', '#E8C25A'] },
];

/**
 * Escala de los estilos según la prenda: los tamaños de los estilos están
 * pensados para camisetas, camisas o pantalones; en unas zapatillas, un
 * camuflaje de 30 cm deja solo dos o tres manchas enormes.
 */
const PATTERN_SCALE_BY_MODEL: Record<string, number> = {
  sneakers: 0.35,
  boots: 0.35,
  cap: 0.5,
  beanie: 0.5,
  scarf: 0.7,
  underwear: 0.7,
};
export function patternScaleFor(modelKey: string): number {
  return PATTERN_SCALE_BY_MODEL[modelKey] ?? 1;
}

/** Paletas de partida (se usan al elegir un estilo que pide más colores de los que hay). */
export const PATTERN_PALETTE = ['#151517', '#E8E4DA', '#8C3B3B', '#C9A15A', '#2B3445', '#5F6B52', '#8FA6C1', '#D9578C'];

export const PATTERN_DEFAULTS: Omit<PatternSpec, 'kind' | 'colors'> = {
  size: 0.03,
  thickness: 0.5,
  count: 1,
  angle: 0,
  opacity: 1,
  softness: 0,
  offsetX: 0,
  offsetY: 0,
  target: 'main',
};

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Rellena valores ausentes y los mete en rango (para datos guardados o a medias). */
export function normalizePattern(p: Partial<PatternSpec> & Pick<PatternSpec, 'kind' | 'colors'>): PatternSpec {
  const L = PATTERN_LIMITS;
  const d = PATTERN_DEFAULTS;
  const num = (v: unknown, def: number) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  return {
    kind: p.kind,
    colors: p.colors.slice(0, L.maxColors),
    size: clampN(num(p.size, d.size), L.minSize, L.maxSize),
    thickness: clampN(num(p.thickness, d.thickness), L.minThickness, L.maxThickness),
    count: Math.round(clampN(num(p.count, d.count), L.minCount, L.maxCount)),
    angle: clampN(num(p.angle, d.angle), -180, 180),
    opacity: clampN(num(p.opacity, d.opacity), L.minOpacity, 1),
    softness: clampN(num(p.softness, d.softness), 0, 1),
    offsetX: clampN(num(p.offsetX, d.offsetX), 0, 1),
    offsetY: clampN(num(p.offsetY, d.offsetY), 0, 1),
    target: p.target === 'secondary' || p.target === 'all' ? p.target : 'main',
  };
}

// ---------------------------------------------------------------------------
// Estampados antiguos (options.pattern + patternSize): su equivalente
// ---------------------------------------------------------------------------

const LEGACY_SCALE = { small: 0.6, medium: 1, large: 1.6 } as const;

/**
 * Equivalente configurable de un estampado antiguo. `color1` y `color2` son
 * los colores ya resueltos (los elegidos o los automáticos).
 */
export function legacyPattern(kind: string, sizeKey: string | undefined, color1: string, color2: string): PatternSpec | null {
  const S = LEGACY_SCALE[(sizeKey ?? 'medium') as keyof typeof LEGACY_SCALE] ?? 1;
  const mk = (p: Partial<PatternSpec> & Pick<PatternSpec, 'kind' | 'colors'>) => normalizePattern(p);
  switch (kind) {
    case 'stripes':
      return mk({ kind: 'stripes', colors: [color1], size: 0.026 * S, thickness: 0.5 });
    case 'breton':
      return mk({ kind: 'stripes', colors: [color1], size: 0.017 * S, thickness: 0.34 });
    case 'pinstripe':
      return mk({ kind: 'stripes', colors: [color1], size: 0.013 * S, thickness: 0.11, angle: 90 });
    case 'gingham':
      return mk({ kind: 'checks', colors: [color1], size: 0.009 * S, thickness: 0.5 });
    case 'check':
      return mk({ kind: 'checks', colors: [color1, color2], size: 0.1 * S, thickness: 0.46 });
    case 'tartan':
      return mk({ kind: 'tartan', colors: [color1, color2], size: 0.15 * S, thickness: 0.5, count: 4 });
    case 'retro':
      return mk({ kind: 'chevron', colors: [color1, color2], size: 0.3 * S, thickness: 0.55, offsetX: 0.5 });
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Generador de la baldosa
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
function smooth(a: number, b: number, x: number): number {
  if (b <= a) return x < a ? 0 : 1;
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}
/** Distancia periódica (periodo 1) entre a y b. */
function pdist(a: number, b: number): number {
  const d = a - b;
  return Math.abs(d - Math.round(d));
}
/** Cobertura de una franja de semianchura h vista a distancia d, con borde e. */
const cover = (d: number, h: number, e: number) => 1 - smooth(h - e, h + e, d);

type W = [number, number, number, number];

/**
 * Grupos de líneas a lo largo de t (periodo 1): un grupo por color, cada
 * uno de anchura G (fracción de su hueco) y con n líneas. `scale` pasa
 * distancias en t a distancias reales (para zigzag y ondas).
 */
function bands(t: number, nc: number, n: number, G: number, e: number, out: number[], scale = 1): void {
  const s = 1 / nc;
  const gw = G * s;
  for (let k = 0; k < nc; k++) {
    const ck = (k + 0.5) * s;
    let a = 0;
    if (n <= 1) a = cover(pdist(t, ck) * scale, (gw / 2) * scale, e);
    else {
      const slot = gw / n;
      for (let i = 0; i < n; i++) {
        const c = ck - gw / 2 + slot * (i + 0.5);
        a = Math.max(a, cover(pdist(t, c) * scale, slot * 0.36 * scale, e));
      }
    }
    out[k] = Math.max(out[k], a);
  }
}

/** Ruido de valor periódico (periodo entero `period` dentro de la baldosa). */
function periodicNoise(seed: number, period: number) {
  const grid = new Float32Array(period * period);
  let x = (seed * 7919 + 104729) % 233280;
  for (let i = 0; i < grid.length; i++) {
    x = (x * 9301 + 49297) % 233280;
    grid[i] = x / 233280;
  }
  const at = (i: number, j: number) => grid[(((j % period) + period) % period) * period + (((i % period) + period) % period)];
  return (u: number, v: number) => {
    const fx = u * period;
    const fy = v * period;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

function fbm(seed: number, period: number) {
  const a = periodicNoise(seed, period);
  const b = periodicNoise(seed + 11, period * 2);
  const c = periodicNoise(seed + 23, period * 4);
  return (u: number, v: number) => 0.62 * a(u, v) + 0.29 * b(u, v) + 0.09 * c(u, v);
}

/** Número pseudoaleatorio estable por celda (0..1). */
function hash2(i: number, j: number, s: number): number {
  const h = Math.sin(i * 127.1 + j * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

export interface TileParams {
  kind: PatternKind;
  /** Número de colores (1–4). */
  colors: number;
  thickness: number;
  count: number;
  softness: number;
}

/** Ajustes que cambian la baldosa (el resto se aplica al pintarla). */
export function tileKey(p: TileParams, res: number): string {
  return `${p.kind}|${p.colors}|${p.thickness.toFixed(3)}|${p.count}|${p.softness.toFixed(3)}|${res}`;
}

/** Resolución de la baldosa: más grande para repeticiones grandes. */
export function tileResolution(size: number): number {
  return size >= 0.12 ? 512 : 256;
}

/** Función de cobertura (x, y en 0..1 dentro de la baldosa) para unos ajustes. */
function coverageFn(p: TileParams, res: number): (x: number, y: number, ix: number, iy: number, w: W) => void {
  const nc = Math.max(1, Math.min(4, Math.round(p.colors)));
  const n = Math.max(1, Math.min(6, Math.round(p.count)));
  const th = clamp01(p.thickness);
  const aa = 0.75 / res;
  const e = aa + p.softness * 0.08;
  const tmpH = [0, 0, 0, 0];
  const tmpV = [0, 0, 0, 0];
  const zero = (a: number[]) => {
    a[0] = 0;
    a[1] = 0;
    a[2] = 0;
    a[3] = 0;
  };

  switch (p.kind) {
    case 'stripes':
      return (_x, y, _i, _j, w) => bands(y, nc, n, th, e, w);

    case 'checks':
      return (x, y, _i, _j, w) => {
        zero(tmpH);
        zero(tmpV);
        bands(y, nc, n, th, e, tmpH);
        bands(x, nc, n, th, e, tmpV);
        for (let k = 0; k < nc; k++) w[k] = Math.max(w[k], 0.5 * (tmpH[k] + tmpV[k]));
      };

    case 'grid':
      return (x, y, _i, _j, w) => {
        bands(y, nc, n, th * 0.6, e, w);
        bands(x, nc, n, th * 0.6, e, w);
      };

    case 'checkerboard':
      return (x, y, _i, _j, w) => {
        const a = cover(pdist(x, 0.25), 0.25, e);
        const b = cover(pdist(y, 0.25), 0.25, e);
        const on = a * b + (1 - a) * (1 - b);
        w[0] = on;
        if (nc >= 2) w[1] = 1 - on;
      };

    case 'tartan': {
      // Bandas anchas y finas alternas, centradas en n posiciones; su anchura
      // total es "grosor". Las dos direcciones se cruzan como en una sarga.
      const widths = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 1 : 0.42));
      const total = widths.reduce((a, b) => a + b, 0);
      const half = widths.map((wi) => ((wi / total) * th) / 2);
      const sett = (t: number, out: number[]) => {
        zero(out);
        for (let i = 0; i < n; i++) {
          const k = i % nc;
          out[k] = Math.max(out[k], cover(pdist(t, (i + 0.5) / n), half[i], e));
        }
      };
      return (x, y, ix, iy, w) => {
        sett(y, tmpH);
        sett(x, tmpV);
        // Sarga 2/2: en diagonal, a veces manda el hilo horizontal y a veces el vertical.
        const twill = (ix + iy) % 4 < 2;
        const tH = twill ? 0.62 : 0.38;
        const tV = 1 - tH;
        for (let k = 0; k < nc; k++) w[k] = Math.max(w[k], Math.min(1, tmpH[k] * tH + tmpV[k] * tV));
      };
    }

    case 'houndstooth':
      // Celda de 2×2 cuadros: uno lleno, otro vacío y dos con rayas diagonales.
      return (x, y, _i, _j, w) => {
        const a = cover(pdist(x, 0.25), 0.25, e);
        const b = cover(pdist(y, 0.25), 0.25, e);
        const solid = a * b;
        const striped = a * (1 - b) + (1 - a) * b;
        const u = (x - y) * 2;
        const s = cover(pdist(u, 0.25) * 0.3536, Math.max(0.01, th) * 0.1768, e);
        w[0] = Math.max(w[0], solid + striped * s);
      };

    case 'herringbone':
      return (x, y, _i, _j, w) => {
        const col = x < 0.5 ? 0 : 1;
        // Distancia al borde de la columna (para suavizar el cambio de sentido).
        const t = (y + (col === 0 ? x : -x)) * n;
        const d = (pdist(t, 0.5) / n) * 0.7071;
        const a = cover(d, ((th * 0.5) / n) * 0.7071, e);
        const k = nc >= 2 ? col : 0;
        w[k] = Math.max(w[k], a);
      };

    case 'chevron':
      return (x, y, _i, _j, w) => {
        const t = y + Math.abs(x - Math.round(x)) - 0.5;
        bands(t, nc, n, th, e, w, 0.7071);
      };

    case 'waves':
      return (x, y, _i, _j, w) => {
        const A = 0.12;
        const t = y + A * Math.sin(TAU * x);
        const slope = A * TAU * Math.cos(TAU * x);
        bands(t, nc, n, th, e, w, 1 / Math.sqrt(1 + slope * slope));
      };

    case 'dots': {
      // Dos redes al tresbolillo; radio máximo sin que se toquen.
      const r = (th * 0.354) / n;
      return (x, y, _i, _j, w) => {
        const dA = Math.hypot(pdist(x * n, 0.5), pdist(y * n, 0.5)) / n;
        const dB = Math.hypot(pdist(x * n, 0), pdist(y * n, 0)) / n;
        w[0] = Math.max(w[0], cover(dA, r, e));
        const kb = nc >= 2 ? 1 : 0;
        w[kb] = Math.max(w[kb], cover(dB, r, e));
      };
    }

    case 'argyle': {
      const r = 0.22 + 0.28 * th;
      return (x, y, _i, _j, w) => {
        const dc = Math.abs(x - 0.5) + Math.abs(y - 0.5);
        const dk = pdist(x, 0) + pdist(y, 0);
        w[0] = Math.max(w[0], cover(dc * 0.7071, r * 0.7071, e));
        if (nc >= 2) w[1] = Math.max(w[1], cover(dk * 0.7071, r * 0.7071, e));
        if (nc >= 3) {
          const l1 = pdist(x - y, 0) * 0.7071;
          const l2 = pdist(x + y, 0) * 0.7071;
          w[2] = Math.max(w[2], cover(Math.min(l1, l2), 0.006, e));
        }
      };
    }

    case 'camo': {
      const period = 1 + n;
      const fields = Array.from({ length: nc }, (_, k) => fbm(17 + k * 31, period));
      // Umbral por percentil: cada capa cubre la fracción que marca "cobertura"
      // (las de encima tapan a las de debajo; siempre queda algo de fondo).
      const share = 0.12 + 0.5 * th;
      const thr = fields.map((f) => {
        const vals: number[] = [];
        for (let j = 0; j < 48; j++) for (let i = 0; i < 48; i++) vals.push(f((i + 0.5) / 48, (j + 0.5) / 48));
        vals.sort((a, b) => a - b);
        return vals[Math.min(vals.length - 1, Math.floor((1 - share) * vals.length))];
      });
      const ec = 0.008 + p.softness * 0.12;
      return (x, y, _i, _j, w) => {
        for (let k = 0; k < nc; k++) w[k] = Math.max(w[k], smooth(thr[k] - ec, thr[k] + ec, fields[k](x, y)));
      };
    }

    case 'leopard': {
      const m = n + 1;
      const R = (0.2 + 0.26 * th) / m;
      const cells: { cx: number; cy: number; h: number; h2: number }[] = [];
      for (let j = 0; j < m; j++) {
        for (let i = 0; i < m; i++) {
          cells.push({
            cx: (i + 0.5 + 0.5 * (hash2(i, j, 1) - 0.5)) / m,
            cy: (j + 0.5 + 0.5 * (hash2(i, j, 2) - 0.5)) / m,
            h: hash2(i, j, 3),
            h2: hash2(i, j, 4),
          });
        }
      }
      return (x, y, _i, _j, w) => {
        const ci = Math.floor(x * m);
        const cj = Math.floor(y * m);
        let ring = 0;
        let fill = 0;
        let dot = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ii = (((ci + di) % m) + m) % m;
            const jj = (((cj + dj) % m) + m) % m;
            const c = cells[jj * m + ii];
            // Posición del centro en la copia de la baldosa más cercana.
            let dx = x - c.cx;
            let dy = y - c.cy;
            dx -= Math.round(dx);
            dy -= Math.round(dy);
            const d = Math.hypot(dx, dy);
            if (d > R * 1.6) continue;
            const ang = Math.atan2(dy, dx);
            const rr = R * (0.82 + 0.4 * c.h) * (1 + 0.16 * Math.sin(3 * ang + c.h * 6) + 0.09 * Math.sin(5 * ang + c.h2 * 6));
            // Anillo roto: hueco en uno o dos tramos.
            const gap = smooth(-0.97, -0.8, Math.sin(ang + c.h2 * TAU));
            const outer = cover(d, rr, e);
            const inner = cover(d, rr * 0.5, e);
            ring = Math.max(ring, (outer - inner) * gap);
            fill = Math.max(fill, inner);
            // Puntito suelto a un lado de algunas manchas.
            if (c.h2 < 0.45) continue;
            const px = c.cx + Math.cos(c.h * TAU) * R * 1.55;
            const py = c.cy + Math.sin(c.h * TAU) * R * 1.55;
            let qx = x - px;
            let qy = y - py;
            qx -= Math.round(qx);
            qy -= Math.round(qy);
            dot = Math.max(dot, cover(Math.hypot(qx, qy), R * 0.22, e));
          }
        }
        w[0] = Math.max(w[0], ring, dot);
        if (nc >= 2) w[1] = Math.max(w[1], fill);
      };
    }

    case 'tiedye': {
      const f = fbm(5, 3);
      return (x, y, _i, _j, w) => {
        const t = y + 0.16 * Math.sin(TAU * x) + 0.55 * (f(x, y) - 0.5);
        bands(t, nc, n, th, e + 0.01, w, 0.8);
      };
    }
  }
}

/**
 * Baldosa de un estampado: RGBA de `res`×`res` píxeles con la cobertura de
 * cada color (0–255). La fila 0 es la parte de abajo (v = 0).
 */
export function patternTile(p: TileParams, res: number): Uint8Array {
  const data = new Uint8Array(res * res * 4);
  const f = coverageFn(p, res);
  const w: W = [0, 0, 0, 0];
  for (let j = 0; j < res; j++) {
    const y = (j + 0.5) / res;
    for (let i = 0; i < res; i++) {
      const x = (i + 0.5) / res;
      w[0] = 0;
      w[1] = 0;
      w[2] = 0;
      w[3] = 0;
      f(x, y, i, j, w);
      const k = (j * res + i) * 4;
      data[k] = Math.round(clamp01(w[0]) * 255);
      data[k + 1] = Math.round(clamp01(w[1]) * 255);
      data[k + 2] = Math.round(clamp01(w[2]) * 255);
      data[k + 3] = Math.round(clamp01(w[3]) * 255);
    }
  }
  return data;
}

// Caché pequeña de baldosas (las miniaturas y el 3D piden las mismas).
const tileCache = new Map<string, Uint8Array>();
export function cachedTile(p: TileParams, res: number): Uint8Array {
  const key = tileKey(p, res);
  const hit = tileCache.get(key);
  if (hit) {
    tileCache.delete(key);
    tileCache.set(key, hit);
    return hit;
  }
  const data = patternTile(p, res);
  tileCache.set(key, data);
  if (tileCache.size > 60) tileCache.delete(tileCache.keys().next().value as string);
  return data;
}

// ---------------------------------------------------------------------------
// Vista previa plana (miniaturas del panel)
// ---------------------------------------------------------------------------

function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Pinta el estampado sobre un trozo de tela plano de `widthM` metros de
 * ancho, con el mismo giro, tamaño, desplazamiento e intensidad que el 3D.
 * Devuelve RGBA (para un ImageData de w×h).
 */
export function renderPatternPreview(spec: PatternSpec, base: string, w: number, h: number, widthM: number) {
  const res = 128;
  const tile = cachedTile({ kind: spec.kind, colors: spec.colors.length, thickness: spec.thickness, count: spec.count, softness: spec.softness }, res);
  const out = new Uint8ClampedArray(w * h * 4);
  const b = hexRgb(base);
  const cols = spec.colors.map(hexRgb);
  const rad = (spec.angle * Math.PI) / 180;
  const cs = Math.cos(rad);
  const sn = Math.sin(rad);
  const px = widthM / w;
  const inv = 1 / spec.size;
  // Muestreo bilineal de la baldosa (repetida).
  const sample = (u: number, v: number, c: number) => {
    const fx = (u - Math.floor(u)) * res - 0.5;
    const fy = (v - Math.floor(v)) * res - 0.5;
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    const tx = fx - i0;
    const ty = fy - j0;
    const at = (i: number, j: number) => tile[((((j % res) + res) % res) * res + (((i % res) + res) % res)) * 4 + c];
    const a = at(i0, j0) + (at(i0 + 1, j0) - at(i0, j0)) * tx;
    const bb = at(i0, j0 + 1) + (at(i0 + 1, j0 + 1) - at(i0, j0 + 1)) * tx;
    return (a + (bb - a) * ty) / 255;
  };
  // Supermuestreo 2×2 si la repetición es pequeña frente al píxel.
  const ss = spec.size / px < 6 ? 2 : 1;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let r = 0;
      let g = 0;
      let bl = 0;
      for (let sj = 0; sj < ss; sj++) {
        for (let si = 0; si < ss; si++) {
          // Centro de la vista en el origen; y hacia arriba.
          const X = (i + (si + 0.5) / ss - w / 2) * px;
          const Y = (h / 2 - (j + (sj + 0.5) / ss)) * px;
          const u = (X * cs + Y * sn) * inv + spec.offsetX;
          const v = (-X * sn + Y * cs) * inv + spec.offsetY;
          let cr = b[0];
          let cg = b[1];
          let cb = b[2];
          for (let k = 0; k < cols.length; k++) {
            const a = sample(u, v, k) * spec.opacity;
            if (a <= 0) continue;
            cr += (cols[k][0] - cr) * a;
            cg += (cols[k][1] - cg) * a;
            cb += (cols[k][2] - cb) * a;
          }
          r += cr;
          g += cg;
          bl += cb;
        }
      }
      const n = ss * ss;
      const k = (j * w + i) * 4;
      out[k] = r / n;
      out[k + 1] = g / n;
      out[k + 2] = bl / n;
      out[k + 3] = 255;
    }
  }
  return out;
}
