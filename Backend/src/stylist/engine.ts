/**
 * Motor del estilista: combina las prendas del armario en outfits completos,
 * explica por qué funcionan, da consejos («notas de grafiti») y detecta lo que
 * le falta al armario.
 *
 * Es un motor propio de reglas (no llama a ningún servicio de IA): armonía de
 * color (rueda cromática y neutros), nivel de arreglo de cada prenda, estilos
 * (los que pone el usuario o los que se deducen del tipo de prenda), ocasión,
 * tiempo y temporada, estampados y lo que el usuario ha ido aceptando,
 * guardando o rechazando. Todo son funciones puras: fáciles de probar.
 */
import {
  OCCASIONS,
  Occasion,
  STYLE_FORMALITY,
  STYLE_TAGS,
  StyleTag,
  Weather,
} from './vocabulary';

// ---------------------------------------------------------------- tipos
export type Category =
  'TOP' | 'BOTTOM' | 'FULL_BODY' | 'OUTERWEAR' | 'FOOTWEAR' | 'ACCESSORY';
export type SeasonKey =
  'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER' | 'ALL_SEASON';
export type Slot =
  'top' | 'mid' | 'bottom' | 'full' | 'outer' | 'shoes' | 'head' | 'neck';

export interface EngineItem {
  id: string;
  name: string;
  color: string;
  category: Category;
  modelKey: string;
  attributes: Record<string, unknown>;
  /** Estilos que ha puesto el usuario (pueden faltar: se deducen). */
  styles: string[];
  season: SeasonKey;
  /** Tiene un estampado (cuadros, rayas, camuflaje...). */
  patterned: boolean;
}

export interface Preferences {
  /** Afinidad por prenda (guardada, llevada, gustada: +; rechazada: −). */
  item: Record<string, number>;
  /** Cuántas veces se ha rechazado cada tipo de consejo. */
  rejectedTips: Record<string, number>;
  styles: Record<string, number>;
  /** Conjuntos de prendas que no gustaron (ids ordenados y unidos por «,»). */
  disliked: string[];
  /** Cuántos outfits guardados usan cada prenda. */
  usage: Record<string, number>;
}

export const EMPTY_PREFERENCES: Preferences = {
  item: {},
  rejectedTips: {},
  styles: {},
  disliked: [],
  usage: {},
};

export interface GenerateOptions {
  style?: StyleTag;
  occasion?: Occasion;
  weather?: Weather;
  season?: SeasonKey;
  /** Cuántos outfits distintos devolver (1-6). */
  count?: number;
  /** Semilla: el mismo valor da los mismos outfits; otro, una tanda nueva. */
  seed?: number;
  /** Prendas que tienen que estar sí o sí. */
  lockedIds?: string[];
  /** Prendas que no se pueden usar. */
  excludeIds?: string[];
  /** Da prioridad a prendas poco usadas: combinaciones que no se te habrían ocurrido. */
  discover?: boolean;
}

export type TipAction =
  | { type: 'add'; itemId: string }
  | { type: 'swap'; fromItemId: string; toItemId: string }
  | { type: 'styling'; itemId: string; styling: Record<string, string> };

export interface Tip {
  id: string;
  code: string;
  kind: 'praise' | 'add' | 'swap' | 'styling' | 'missing';
  text: string;
  action?: TipAction;
}

export interface OutfitPick {
  itemId: string;
  slot: Slot;
}

export interface OutfitSuggestion {
  key: string;
  items: OutfitPick[];
  score: number;
  reasons: string[];
  tips: Tip[];
  palette: { color: string; name: string }[];
}

// ---------------------------------------------------------------- color
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x808080;
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l };
}

export type ColorFamily = 'neutral' | 'earth' | 'color';

/** Neutros (blanco, negro, grises, crudos, azul marino) combinan con todo; tierras (camel, marrón, oliva), casi. */
export function colorFamily(hex: string): ColorFamily {
  const { h, s, l } = hexToHsl(hex);
  if (s < 0.12 || l < 0.12 || l > 0.93) return 'neutral';
  if (h >= 200 && h <= 250 && l < 0.3 && s < 0.65) return 'neutral'; // azul marino
  if (h >= 25 && h <= 60 && s < 0.45 && l > 0.62) return 'neutral'; // beige, crudo, arena
  if (h >= 15 && h <= 50 && s < 0.65 && l < 0.62) return 'earth'; // camel, marrón, cuero
  if (h >= 55 && h <= 95 && s < 0.45 && l < 0.55) return 'earth'; // oliva, caqui
  return 'color';
}

const NAMED: [string, string][] = [
  ['negro', '#111111'],
  ['blanco', '#F5F5F2'],
  ['gris claro', '#C8C8C8'],
  ['gris', '#8A8A8A'],
  ['gris oscuro', '#444444'],
  ['crudo', '#EDE6D6'],
  ['beige', '#D8C3A0'],
  ['camel', '#B58450'],
  ['marrón', '#6B4423'],
  ['azul marino', '#1D2A44'],
  ['azul', '#2F5DA8'],
  ['azul vaquero', '#4A6A98'],
  ['celeste', '#9EC3E6'],
  ['verde', '#3E8E41'],
  ['verde oliva', '#6B6B3A'],
  ['caqui', '#A39A6B'],
  ['verde botella', '#1F4A33'],
  ['rojo', '#C0282D'],
  ['burdeos', '#6D1F2A'],
  ['rosa', '#E8A3B8'],
  ['fucsia', '#D0307A'],
  ['naranja', '#E2762B'],
  ['mostaza', '#C9A227'],
  ['amarillo', '#F0D44A'],
  ['morado', '#6B3FA0'],
  ['lila', '#B79CD6'],
  ['turquesa', '#2BB3B1'],
];

/** Nombre del color en castellano (el más parecido de una lista corta). */
export function colorName(hex: string): string {
  const a = rgb(hex);
  let best = NAMED[0][0];
  let bd = Infinity;
  for (const [name, h] of NAMED) {
    const b = rgb(h);
    // distancia «redmean»: se parece más a como vemos los colores que la euclídea
    const rm = (a[0] + b[0]) / 2;
    const d =
      (2 + rm / 256) * (a[0] - b[0]) ** 2 +
      4 * (a[1] - b[1]) ** 2 +
      (2 + (255 - rm) / 256) * (a[2] - b[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return best;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const hueDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

// ---------------------------------------------------------------- rasgos de cada prenda
const str = (a: Record<string, unknown>, k: string): string | undefined =>
  typeof a[k] === 'string' ? (a[k] as string) : undefined;

const has = (s: string | undefined, re: RegExp) =>
  !!s && re.test(s.toLowerCase());

/** Nivel de arreglo de 0 (chándal) a 1 (etiqueta). */
export function formality(it: EngineItem): number {
  const a = it.attributes;
  const style = str(a, 'style');
  const fit = str(a, 'fit');
  const mat = str(a, 'material');
  switch (it.modelKey) {
    case 'tshirt':
      return str(a, 'neckline') === 'polo'
        ? 0.42
        : str(a, 'sleeve') === 'sleeveless'
          ? 0.1
          : 0.22;
    case 'shirt':
      return str(a, 'collar') === 'camp'
        ? 0.42
        : str(a, 'collar') === 'mandarin'
          ? 0.55
          : 0.64;
    case 'top': {
      const m: Record<string, number> = {
        waistcoat: 0.7,
        waistcoat_db: 0.8,
        corset: 0.55,
        bodysuit: 0.45,
        halter: 0.35,
        bandeau: 0.3,
        tank: 0.12,
        ribbed_tank: 0.12,
      };
      return m[style ?? ''] ?? 0.2;
    }
    case 'sweater': {
      const n = str(a, 'neckline');
      if (n === 'hoodie' || n === 'hoodie_zip') return 0.15;
      if (n === 'athletic') return 0.2;
      if (n === 'half_zip' || n === 'quarter_zip') return 0.35;
      if (n === 'turtleneck') return 0.62;
      if (n === 'cardigan') return 0.5;
      if (n === 'vest') return 0.55;
      if (str(a, 'knit') === 'cable') return 0.45;
      return 0.42;
    }
    case 'pants': {
      if (fit && ['jogger', 'cargo', 'parachute'].includes(fit)) return 0.15;
      if (has(mat, /lana|wool|franela/)) return 0.8;
      if (has(mat, /vaquer|denim|tejan/)) return fit === 'baggy' ? 0.2 : 0.35;
      if (fit === 'baggy' || fit === 'oversized') return 0.22;
      if (has(mat, /chino|sarga|gabardina|lino/)) return 0.52;
      return 0.4;
    }
    case 'shorts':
      return fit === 'cargo' ? 0.1 : 0.16;
    case 'skirt':
      return str(a, 'fit') === 'pencil'
        ? 0.7
        : str(a, 'length') === 'mini'
          ? 0.35
          : 0.5;
    case 'dress':
      return str(a, 'fit') === 'tshirt'
        ? 0.3
        : ['bodycon', 'slip', 'sheath', 'mermaid'].includes(str(a, 'fit') ?? '')
          ? 0.7
          : 0.58;
    case 'jacket': {
      const m: Record<string, number> = {
        blazer: 0.85,
        blazer_db: 0.88,
        suit: 0.9,
        harrington: 0.5,
        biker: 0.45,
        bomber: 0.35,
        denim: 0.3,
        field: 0.42,
        overshirt: 0.42,
        puffer: 0.25,
        windbreaker: 0.15,
        varsity: 0.2,
        anorak: 0.18,
        hooded: 0.18,
        track: 0.1,
        puffer_vest: 0.25,
        leather: 0.5,
        coach: 0.15,
        fleece: 0.12,
      };
      return m[style ?? ''] ?? 0.4;
    }
    case 'coat': {
      const m: Record<string, number> = {
        overcoat: 0.88,
        wrap: 0.82,
        trench: 0.78,
        peacoat: 0.7,
        car_coat: 0.7,
        cape: 0.7,
        duffle: 0.5,
        parka: 0.32,
        puffer: 0.28,
        raincoat: 0.3,
      };
      return m[style ?? ''] ?? 0.6;
    }
    case 'sneakers':
      return style === 'court' ? 0.32 : style === 'running' ? 0.1 : 0.2;
    case 'boots': {
      const m: Record<string, number> = {
        chelsea: 0.66,
        dress: 0.78,
        riding: 0.6,
        cowboy: 0.4,
        combat: 0.35,
        hiking: 0.2,
      };
      return m[style ?? ''] ?? 0.45;
    }
    case 'scarf':
      return 0.5;
    case 'cap':
      return 0.1;
    case 'beanie':
      return 0.15;
    case 'underwear':
      return 0;
    default:
      return 0.4;
  }
}

/** Estilos que se deducen del tipo y los atributos (se suman a los que pone el usuario). */
export function inferStyles(it: EngineItem): StyleTag[] {
  const a = it.attributes;
  const style = str(a, 'style') ?? '';
  const fit = str(a, 'fit') ?? '';
  const mat = str(a, 'material');
  const out = new Set<StyleTag>();
  const add = (...t: StyleTag[]) => t.forEach((x) => out.add(x));
  const f = formality(it);
  switch (it.modelKey) {
    case 'top':
      if (style === 'waistcoat' || style === 'waistcoat_db')
        add('smart_casual', 'old_money', 'vintage');
      else if (style === 'corset') add('elegant', 'y2k');
      else if (style === 'bodysuit') add('minimalist', 'elegant');
      else if (style === 'halter' || style === 'bandeau') add('y2k', 'casual');
      else add('casual', 'sporty', 'minimalist');
      break;
    case 'tshirt':
      add('casual');
      if (str(a, 'neckline') === 'polo') add('old_money', 'smart_casual');
      if (['oversized', 'boxy'].includes(fit)) add('streetwear');
      if (fit === 'cropped') add('y2k');
      if (fit === 'slim' || fit === 'regular') add('minimalist');
      if (fit === 'muscle' || str(a, 'sleeve') === 'sleeveless') add('sporty');
      break;
    case 'shirt':
      add('smart_casual');
      if (str(a, 'collar') === 'camp') add('vintage', 'casual');
      else add('old_money', 'formal');
      if (fit === 'oversized') add('streetwear');
      break;
    case 'sweater': {
      const n = str(a, 'neckline');
      if (n === 'hoodie' || n === 'hoodie_zip')
        add('streetwear', 'casual', 'sporty');
      else if (n === 'athletic') add('sporty', 'vintage', 'casual');
      else if (n === 'half_zip' || n === 'quarter_zip')
        add('sporty', 'casual', 'smart_casual');
      else if (n === 'turtleneck') add('minimalist', 'elegant', 'old_money');
      else if (n === 'cardigan') add('vintage', 'old_money', 'smart_casual');
      else if (n === 'vest') add('old_money', 'vintage', 'smart_casual');
      else if (str(a, 'knit') === 'cable')
        add('old_money', 'casual', 'vintage');
      else add('casual', 'old_money', 'smart_casual');
      break;
    }
    case 'pants':
      if (['jogger', 'parachute'].includes(fit)) add('sporty', 'streetwear');
      else if (['cargo', 'baggy', 'oversized'].includes(fit))
        add('streetwear', 'y2k');
      else if (['flare', 'bootcut'].includes(fit)) add('vintage', 'y2k');
      else if (['mom', 'boyfriend', 'barrel'].includes(fit))
        add('vintage', 'casual');
      else if (has(mat, /vaquer|denim|tejan/) || !mat) add('casual');
      if (f >= 0.5) add('smart_casual', 'old_money');
      if (f >= 0.75) add('formal', 'elegant');
      if (['slim', 'straight', 'regular', 'tapered'].includes(fit))
        add('minimalist');
      if (str(a, 'rise') === 'low') add('y2k');
      break;
    case 'shorts':
      add('casual', 'sporty');
      if (fit === 'cargo' || fit === 'oversized') add('streetwear');
      break;
    case 'skirt':
      add(f >= 0.6 ? 'elegant' : 'casual');
      if (str(a, 'length') === 'mini') add('y2k');
      if (fit === 'pleated') add('old_money', 'vintage');
      break;
    case 'dress':
      add(f >= 0.6 ? 'elegant' : 'casual');
      if (fit === 'slip') add('y2k', 'minimalist');
      if (fit === 'shirt' || fit === 'a_line') add('smart_casual');
      break;
    case 'jacket':
      if (style === 'blazer' || style === 'blazer_db' || style === 'suit')
        add('formal', 'smart_casual', 'old_money', 'elegant');
      else if (['bomber', 'puffer', 'puffer_vest', 'hooded'].includes(style))
        add('streetwear', 'casual');
      else if (style === 'varsity') add('streetwear', 'vintage');
      else if (['windbreaker', 'anorak', 'track'].includes(style))
        add('sporty', 'streetwear');
      else if (style === 'biker' || style === 'leather')
        add('streetwear', 'casual');
      else if (style === 'coach') add('streetwear', 'sporty');
      else if (style === 'fleece') add('casual', 'sporty');
      else if (style === 'denim') add('casual', 'vintage');
      else if (style === 'harrington') add('vintage', 'smart_casual');
      else add('casual', 'smart_casual');
      break;
    case 'coat':
      if (
        ['overcoat', 'wrap', 'trench', 'peacoat', 'car_coat', 'cape'].includes(
          style,
        )
      )
        add('old_money', 'elegant', 'minimalist', 'formal');
      else if (style === 'duffle') add('vintage', 'old_money');
      else add('casual', 'streetwear');
      break;
    case 'sneakers':
      add('casual', 'streetwear');
      if (style === 'running') add('sporty');
      if (style === 'court') add('minimalist', 'smart_casual');
      if (style === 'chunky') add('y2k');
      if (style === 'skate' || style === 'high_top') add('vintage');
      break;
    case 'boots':
      if (style === 'chelsea' || style === 'dress')
        add('smart_casual', 'elegant', 'old_money');
      else if (style === 'combat') add('streetwear', 'casual');
      else if (style === 'cowboy') add('vintage');
      else add('casual');
      break;
    case 'cap':
      add('streetwear', 'sporty', 'casual');
      if (style === 'bucket') add('y2k');
      break;
    case 'beanie':
      add('streetwear', 'casual');
      break;
    case 'scarf':
      add('old_money', 'elegant', 'casual');
      break;
  }
  if (f >= 0.8) add('formal');
  return [...out];
}

export function stylesOf(it: EngineItem): Set<string> {
  return new Set([...it.styles, ...inferStyles(it)]);
}

/** Abriga: −1 (muy fresco) a 3 (abrigo de invierno). */
function warmth(it: EngineItem): number {
  const a = it.attributes;
  switch (it.modelKey) {
    case 'coat':
      return str(a, 'style') === 'raincoat' || str(a, 'style') === 'trench'
        ? 2
        : 3;
    case 'jacket': {
      const s = str(a, 'style');
      if (s === 'puffer') return 3;
      if (
        s === 'windbreaker' ||
        s === 'track' ||
        s === 'puffer_vest' ||
        s === 'coach'
      )
        return 1;
      if (s === 'fleece') return 1.5;
      return 2;
    }
    case 'sweater':
      if (str(a, 'neckline') === 'vest') return 1;
      return str(a, 'knit') === 'chunky' || str(a, 'knit') === 'cable'
        ? 2.5
        : 2;
    case 'shirt':
      return str(a, 'sleeve') === 'short' ? 0 : 1;
    case 'tshirt':
      return str(a, 'sleeve') === 'sleeveless'
        ? -1
        : str(a, 'sleeve') === 'long' || str(a, 'sleeve') === 'raglan'
          ? 0.6
          : 0;
    case 'top':
      return ['bodysuit', 'waistcoat', 'waistcoat_db'].includes(
        str(a, 'style') ?? '',
      )
        ? 0.5
        : -1;
    case 'shorts':
      return -1;
    case 'skirt':
      return str(a, 'length') === 'mini' ? -1 : 0;
    case 'dress':
      return str(a, 'sleeve') === 'long'
        ? 0.5
        : str(a, 'length') === 'mini'
          ? -1
          : 0;
    case 'pants':
      return has(str(a, 'material'), /lino|linen/) ? 0.3 : 1;
    case 'boots':
      return 1;
    default:
      return 0;
  }
}

const isWaterproof = (it: EngineItem) =>
  it.attributes.waterproof === true ||
  ['raincoat', 'trench', 'parka'].includes(str(it.attributes, 'style') ?? '');

const SEASON_FROM_WEATHER: Record<Weather, SeasonKey> = {
  cold: 'WINTER',
  cool: 'AUTUMN',
  mild: 'SPRING',
  hot: 'SUMMER',
};

function seasonPenalty(it: EngineItem, season?: SeasonKey): number {
  if (
    !season ||
    season === 'ALL_SEASON' ||
    it.season === 'ALL_SEASON' ||
    it.season === season
  )
    return 0;
  const opposite = (a: SeasonKey, b: SeasonKey) =>
    (a === 'SUMMER' && b === 'WINTER') || (a === 'WINTER' && b === 'SUMMER');
  return opposite(it.season, season) ? 0.7 : 0.15;
}

/** Hueco que ocupa la prenda en un outfit. */
export function slotOf(it: EngineItem): Slot | null {
  switch (it.category) {
    case 'TOP':
      return 'top';
    case 'BOTTOM':
      return it.modelKey === 'underwear' ? null : 'bottom';
    case 'FULL_BODY':
      return 'full';
    case 'OUTERWEAR':
      return 'outer';
    case 'FOOTWEAR':
      return 'shoes';
    case 'ACCESSORY':
      return it.modelKey === 'scarf' ? 'neck' : 'head';
  }
  return null;
}

// ---------------------------------------------------------------- puntuación de un conjunto
interface Ctx {
  style?: StyleTag;
  occasion?: Occasion;
  weather?: Weather;
  season?: SeasonKey;
  target: number;
  prefs: Preferences;
  discover: boolean;
}

interface ColorVerdict {
  score: number;
  kind: 'neutral' | 'accent' | 'analogous' | 'complementary' | 'mono' | 'busy';
  accents: string[];
  contrast: 'high' | 'tonal' | 'flat' | 'none';
}

/** Ropa que se ve (sin accesorios para el color, que pueden ser el toque). */
const clothes = (set: EngineItem[]) =>
  set.filter((i) => i.category !== 'ACCESSORY');

export function judgeColors(
  set: EngineItem[],
  style?: StyleTag,
  occasion?: Occasion,
): ColorVerdict {
  const items = clothes(set);
  const accentItems = items.filter((i) => colorFamily(i.color) === 'color');
  // agrupa los acentos por tono (±28°)
  const groups: { h: number; color: string }[] = [];
  for (const it of accentItems) {
    const h = hexToHsl(it.color).h;
    if (!groups.some((g) => hueDist(g.h, h) < 28))
      groups.push({ h, color: it.color });
  }
  const bold =
    style === 'streetwear' || style === 'y2k' || occasion === 'party';
  let score: number;
  let kind: ColorVerdict['kind'];
  if (groups.length === 0) {
    score = 0.7;
    kind = 'neutral';
  } else if (groups.length === 1) {
    score =
      accentItems.length >= 2 && accentItems.length === items.length
        ? 0.85
        : 0.95;
    kind =
      accentItems.length >= 2 && accentItems.length === items.length
        ? 'mono'
        : 'accent';
  } else if (groups.length === 2) {
    const d = hueDist(groups[0].h, groups[1].h);
    if (d < 45) {
      score = 0.78;
      kind = 'analogous';
    } else if (d > 150) {
      score = 0.72;
      kind = 'complementary';
    } else {
      score = bold ? 0.5 : 0.25;
      kind = 'busy';
    }
  } else {
    score = bold ? 0.4 : 0.05;
    kind = 'busy';
  }
  // contraste de luz entre la parte de arriba y la de abajo
  const top = items.find((i) => slotOf(i) === 'top');
  const bottom = items.find((i) => slotOf(i) === 'bottom');
  let contrast: ColorVerdict['contrast'] = 'none';
  if (top && bottom) {
    const a = hexToHsl(top.color);
    const b = hexToHsl(bottom.color);
    const dl = Math.abs(a.l - b.l);
    if (dl > 0.2) {
      contrast = 'high';
      score += 0.12;
    } else if (
      dl < 0.1 &&
      (hueDist(a.h, b.h) < 25 || (a.s < 0.15 && b.s < 0.15))
    ) {
      contrast = 'tonal';
      score += style === 'minimalist' ? 0.2 : 0.04;
      if (kind === 'neutral' && style === 'minimalist') kind = 'mono';
    } else if (dl < 0.08) {
      contrast = 'flat';
      score -= 0.08;
    }
  }
  if ((style === 'old_money' || style === 'minimalist') && groups.length > 0)
    score -= 0.15 * groups.length;
  if (
    style === 'old_money' &&
    items.some((i) => colorFamily(i.color) === 'earth')
  )
    score += 0.08;
  return { score, kind, accents: groups.map((g) => g.color), contrast };
}

interface Judgement {
  total: number;
  color: ColorVerdict;
  formalityMean: number;
  formalitySpread: number;
  styleItems: EngineItem[];
  rare: EngineItem[];
}

const CORE: Slot[] = ['top', 'mid', 'bottom', 'full', 'outer', 'shoes'];

function judge(set: EngineItem[], ctx: Ctx, jitter: number): Judgement {
  const color = judgeColors(set, ctx.style, ctx.occasion);
  const core = set.filter((i) => CORE.includes(slotOf(i) as Slot));
  const fs = core.map(formality);
  const mean = fs.reduce((a, b) => a + b, 0) / Math.max(1, fs.length);
  const spread = fs.length ? Math.max(...fs) - Math.min(...fs) : 0;
  const fScore =
    1 - 1.5 * Math.abs(mean - ctx.target) - 0.9 * Math.max(0, spread - 0.38);

  // estilo: cuántas prendas «son» del estilo (u ocasión) pedido
  const wanted: string[] = ctx.style
    ? [ctx.style]
    : ctx.occasion
      ? [...OCCASIONS[ctx.occasion].styles]
      : [];
  const styleItems = wanted.length
    ? core.filter((i) => wanted.some((w) => stylesOf(i).has(w)))
    : [];
  const sScore = wanted.length
    ? styleItems.length / Math.max(1, core.length)
    : 0.5;

  // tiempo y temporada
  let wScore = 0;
  const season =
    ctx.season ?? (ctx.weather ? SEASON_FROM_WEATHER[ctx.weather] : undefined);
  for (const it of set) wScore -= seasonPenalty(it, season);
  const outer = set.filter((i) => slotOf(i) === 'outer');
  const heat = set.reduce((acc, i) => acc + warmth(i), 0);
  if (ctx.weather === 'cold') {
    if (!outer.length) wScore -= 0.7;
    wScore += Math.min(0.4, 0.06 * heat);
    if (set.some((i) => warmth(i) < 0)) wScore -= 0.6;
  } else if (ctx.weather === 'cool') {
    if (!outer.length && !set.some((i) => i.modelKey === 'sweater'))
      wScore -= 0.3;
    if (set.some((i) => i.modelKey === 'shorts')) wScore -= 0.3;
  } else if (ctx.weather === 'hot') {
    if (outer.length) wScore -= 0.8;
    if (
      set.some(
        (i) =>
          i.modelKey === 'sweater' ||
          i.modelKey === 'beanie' ||
          i.modelKey === 'scarf',
      )
    )
      wScore -= 0.7;
    if (set.some((i) => i.modelKey === 'boots')) wScore -= 0.2;
    wScore -= Math.max(0, heat - 1.5) * 0.12;
  } else if (ctx.weather === 'mild') {
    if (outer.some((i) => warmth(i) >= 3)) wScore -= 0.4;
  }

  // estampados: uno es protagonista; dos compiten
  const patterned = clothes(set).filter((i) => i.patterned).length;
  const pScore =
    patterned > 1
      ? -(patterned - 1) *
        (ctx.style === 'streetwear' || ctx.style === 'y2k' ? 0.15 : 0.35)
      : 0;

  // aprendizaje: afinidad por prenda, estilos que gustan y conjuntos rechazados
  let prefScore = 0;
  for (const it of set)
    prefScore += 0.04 * clamp(ctx.prefs.item[it.id] ?? 0, -5, 5);
  if (ctx.prefs.disliked.includes(setKey(set.map((i) => i.id))))
    prefScore -= 1.5;
  if (ctx.style)
    prefScore += 0.02 * clamp(ctx.prefs.styles[ctx.style] ?? 0, -5, 5);

  // descubrir: prendas que casi no salen en tus outfits
  const rare = set.filter(
    (i) => (ctx.prefs.usage[i.id] ?? 0) === 0 && slotOf(i) !== 'shoes',
  );
  const rScore = ctx.discover ? 0.12 * rare.length : 0;

  const total =
    1.2 * color.score +
    1.0 * fScore +
    1.1 * sScore +
    wScore +
    pScore +
    prefScore +
    rScore +
    jitter;
  return {
    total,
    color,
    formalityMean: mean,
    formalitySpread: spread,
    styleItems,
    rare,
  };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export const setKey = (ids: string[]) => [...ids].sort().join(',');

/** Generador pseudoaleatorio con semilla (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCtx(opts: GenerateOptions, prefs: Preferences): Ctx {
  const target = opts.occasion
    ? OCCASIONS[opts.occasion].formality
    : opts.style
      ? STYLE_FORMALITY[opts.style]
      : 0.35;
  return {
    style: opts.style,
    occasion: opts.occasion,
    weather: opts.weather,
    season: opts.season,
    target,
    prefs,
    discover: !!opts.discover,
  };
}

// ---------------------------------------------------------------- generador
/**
 * Genera hasta `count` outfits distintos con las prendas del armario.
 * Base (parte de arriba + abajo, o vestido) → capa intermedia si hace frío →
 * prenda de abrigo según el tiempo → calzado → accesorios si suman.
 */
export function generateOutfits(
  pool: EngineItem[],
  opts: GenerateOptions = {},
  prefs: Preferences = EMPTY_PREFERENCES,
): OutfitSuggestion[] {
  const ctx = makeCtx(opts, prefs);
  const random = rng(opts.seed ?? 1);
  const exclude = new Set(opts.excludeIds ?? []);
  const locked = pool.filter((i) => (opts.lockedIds ?? []).includes(i.id));
  const items = pool.filter((i) => !exclude.has(i.id) && slotOf(i) !== null);
  const by = (slot: Slot) => items.filter((i) => slotOf(i) === slot);
  const lockedIn = (slot: Slot) => locked.find((i) => slotOf(i) === slot);

  // preselección por prenda suelta (para no probar todas las combinaciones)
  const single = (it: EngineItem) => judge([it], ctx, 0).total;
  const top = (slot: Slot, k: number) => {
    const fixed = lockedIn(slot);
    if (fixed) return [fixed];
    return by(slot)
      .map((it) => ({ it, s: single(it) + random() * 0.15 }))
      .sort((a, b) => b.s - a.s)
      .slice(0, k)
      .map((x) => x.it);
  };

  const bases: EngineItem[][] = [];
  const lockedFull = lockedIn('full');
  const wantsPair = lockedIn('top') || lockedIn('bottom');
  if (!lockedFull) {
    for (const t of top('top', 14))
      for (const b of top('bottom', 12)) bases.push([t, b]);
  }
  if (!wantsPair) for (const d of top('full', 8)) bases.push([d]);
  if (!bases.length) return [];

  const scored = bases
    .map((set) => ({ set, s: judge(set, ctx, random() * 0.12).total }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 40);

  const outers = top('outer', 8);
  const shoes = top('shoes', 8);
  const heads =
    ctx.weather === 'hot'
      ? by('head').filter((i) => i.modelKey !== 'beanie')
      : top('head', 6);
  const necks =
    ctx.weather === 'cold' || ctx.weather === 'cool' ? top('neck', 4) : [];
  const mids =
    ctx.weather === 'cold' || ctx.weather === 'cool'
      ? by('top').filter((i) => i.modelKey === 'sweater')
      : [];

  const complete = (base: EngineItem[]): EngineItem[] => {
    let set = [...base];
    const best = (cands: EngineItem[], optional: boolean): EngineItem[] => {
      let bestSet = set;
      let bestScore = optional ? judge(set, ctx, 0).total : -Infinity;
      for (const c of cands) {
        if (set.includes(c)) continue;
        const s = judge([...set, c], ctx, random() * 0.06).total;
        if (s > bestScore) {
          bestScore = s;
          bestSet = [...set, c];
        }
      }
      return bestSet;
    };
    // capa intermedia: jersey sobre camiseta o camisa, si hace fresco
    const t = set.find((i) => slotOf(i) === 'top');
    if (t && t.modelKey !== 'sweater' && mids.length) {
      const lockedMid = locked.find((i) => i !== t && i.modelKey === 'sweater');
      set = lockedMid ? [...set, lockedMid] : best(mids, true);
    }
    const lockedOuter = lockedIn('outer');
    set = lockedOuter
      ? [...set, lockedOuter]
      : best(outers, ctx.weather !== 'cold');
    const lockedShoes = lockedIn('shoes');
    set = lockedShoes
      ? [...set, lockedShoes]
      : shoes.length
        ? best(shoes, false)
        : set;
    const lockedHead = lockedIn('head');
    set = lockedHead ? [...set, lockedHead] : best(heads, true);
    const lockedNeck = lockedIn('neck');
    set = lockedNeck ? [...set, lockedNeck] : best(necks, true);
    return set;
  };

  const candidates = scored.map(({ set }) => {
    const full = complete(set);
    return { set: full, j: judge(full, ctx, random() * 0.1) };
  });

  // variedad: cada outfit nuevo se penaliza por las prendas que comparte con los ya elegidos
  const count = clamp(opts.count ?? 3, 1, 6);
  const chosen: { set: EngineItem[]; j: Judgement }[] = [];
  const seen = new Set<string>();
  while (chosen.length < count) {
    let pick: (typeof candidates)[number] | undefined;
    let pickScore = -Infinity;
    for (const c of candidates) {
      const key = setKey(c.set.map((i) => i.id));
      if (seen.has(key)) continue;
      const overlap = chosen.reduce(
        (acc, o) =>
          acc +
          c.set.filter((i) => o.set.includes(i) && slotOf(i) !== 'shoes')
            .length /
            c.set.length,
        0,
      );
      const s = c.j.total - 0.9 * overlap;
      if (s > pickScore) {
        pickScore = s;
        pick = c;
      }
    }
    if (!pick) break;
    seen.add(setKey(pick.set.map((i) => i.id)));
    chosen.push(pick);
  }

  return chosen.map(({ set, j }) => describe(set, j, ctx, items));
}

// ---------------------------------------------------------------- explicaciones y consejos
const LEVEL = (f: number) =>
  f < 0.22
    ? 'muy informal'
    : f < 0.42
      ? 'informal'
      : f < 0.62
        ? 'smart casual'
        : f < 0.8
          ? 'arreglado'
          : 'formal';

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const names = (its: EngineItem[]) => {
  const n = its.map((i) => `«${i.name}»`);
  return n.length <= 1
    ? n.join('')
    : `${n.slice(0, -1).join(', ')} y ${n[n.length - 1]}`;
};

function describe(
  set: EngineItem[],
  j: Judgement,
  ctx: Ctx,
  pool: EngineItem[],
): OutfitSuggestion {
  const reasons: string[] = [];
  const c = j.color;
  const neutrals = clothes(set)
    .filter((i) => colorFamily(i.color) !== 'color')
    .map((i) => colorName(i.color));
  const uniq = [...new Set(neutrals)];
  switch (c.kind) {
    case 'neutral':
      reasons.push(
        `Paleta neutra (${uniq.slice(0, 3).join(', ')}): limpia y fácil de combinar.`,
      );
      break;
    case 'accent':
      reasons.push(
        `Base neutra con un toque de ${colorName(c.accents[0])}: el color destaca sin cargar el conjunto.`,
      );
      break;
    case 'mono':
      reasons.push(
        `Look en tonos de ${colorName(clothes(set)[0].color)}: un solo color alarga la silueta.`,
      );
      break;
    case 'analogous':
      reasons.push(
        `${cap(colorName(c.accents[0]))} y ${colorName(c.accents[1])} son tonos vecinos: combinan de forma natural.`,
      );
      break;
    case 'complementary':
      reasons.push(
        `${cap(colorName(c.accents[0]))} y ${colorName(c.accents[1])} son complementarios: un contraste con intención.`,
      );
      break;
    case 'busy':
      reasons.push(
        'Mucho color: funciona si quieres que el outfit llame la atención.',
      );
      break;
  }
  if (c.contrast === 'high') {
    const t = set.find((i) => slotOf(i) === 'top');
    const b = set.find((i) => slotOf(i) === 'bottom');
    if (t && b)
      reasons.push(
        `El contraste de luz entre ${lower(t.name)} y ${lower(b.name)} da equilibrio.`,
      );
  }
  if (j.formalitySpread < 0.3) {
    const occ = ctx.occasion
      ? `, justo para ${lower(OCCASIONS[ctx.occasion].label)}`
      : '';
    reasons.push(
      `Todas las prendas tienen el mismo nivel de arreglo (${LEVEL(j.formalityMean)})${occ}.`,
    );
  } else if (ctx.occasion) {
    reasons.push(
      `Mezcla prendas más y menos arregladas: buen punto para ${lower(OCCASIONS[ctx.occasion].label)}.`,
    );
  }
  if (ctx.style && j.styleItems.length) {
    reasons.push(
      `Estilo ${STYLE_TAGS[ctx.style].toLowerCase()}: ${names(j.styleItems.slice(0, 3))} son prendas clave.`,
    );
  }
  const outer = set.find((i) => slotOf(i) === 'outer');
  if (ctx.weather === 'cold' && outer)
    reasons.push(`Para el frío: ${lower(outer.name)} y capas que abrigan.`);
  if (ctx.weather === 'hot')
    reasons.push('Para el calor: prendas ligeras y sin capas.');
  if (ctx.discover && j.rare.length)
    reasons.push(
      `Incluye ${names(j.rare.slice(0, 2))}, que aún no usas en ningún outfit.`,
    );

  const items: OutfitPick[] = set.map((it) => ({
    itemId: it.id,
    slot: slotOf(it) as Slot,
  }));
  const mid = set.filter((i) => slotOf(i) === 'top');
  if (mid.length === 2) {
    const sweater = mid.find((i) => i.modelKey === 'sweater');
    const p = items.find((x) => x.itemId === sweater?.id);
    if (p) p.slot = 'mid';
  }
  return {
    key: setKey(set.map((i) => i.id)),
    items,
    score: Math.round(j.total * 100) / 100,
    reasons,
    tips: tipsFor(set, j, ctx, pool),
    palette: clothes(set).map((i) => ({
      color: i.color,
      name: colorName(i.color),
    })),
  };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ROLLABLE_FITS = [
  'straight',
  'regular',
  'relaxed',
  'wide',
  'baggy',
  'boyfriend',
  'mom',
  'barrel',
  'oversized',
];

/** Consejos para un outfit: hasta 4, sin repetir los que el usuario suele rechazar. */
export function tipsFor(
  set: EngineItem[],
  j: Judgement,
  ctx: Ctx,
  pool: EngineItem[],
): Tip[] {
  const tips: Tip[] = [];
  const inSet = new Set(set.map((i) => i.id));
  const slot = (s: Slot) => set.find((i) => slotOf(i) === s);
  const others = (s: Slot) =>
    pool.filter((i) => slotOf(i) === s && !inSet.has(i.id));
  const score = (alt: EngineItem[]) => judge(alt, ctx, 0).total;
  const base = score(set);
  const push = (t: Tip) => {
    if ((ctx.prefs.rejectedTips[t.code] ?? 0) >= 3) return;
    tips.push(t);
  };

  if (j.color.score >= 0.85) {
    push({
      id: 'colors_work',
      code: 'colors_work',
      kind: 'praise',
      text: '¡Los colores funcionan genial juntos!',
    });
  }

  // otro calzado que también funciona y cambia el aire
  const shoes = slot('shoes');
  if (shoes) {
    const alt = bestSwap(set, shoes, others('shoes'), score);
    if (alt && alt.s > base - 0.15) {
      push({
        id: `try_shoes:${alt.it.id}`,
        code: 'try_shoes',
        kind: 'swap',
        text: `Estas «${alt.it.name}» quedarían increíbles con este outfit.`,
        action: { type: 'swap', fromItemId: shoes.id, toItemId: alt.it.id },
      });
    }
  } else if (others('shoes').length) {
    const alt = bestAdd(set, others('shoes'), score);
    if (alt)
      push({
        id: `add_shoes:${alt.id}`,
        code: 'add_shoes',
        kind: 'add',
        text: `Ponle «${alt.name}» para cerrar el look.`,
        action: { type: 'add', itemId: alt.id },
      });
  }

  // poco contraste: una pieza más oscura (o más clara) que lo levante
  if (j.color.contrast === 'flat' && ctx.style !== 'minimalist') {
    const outer = slot('outer');
    const target = outer ?? slot('top');
    if (target) {
      const l0 = hexToHsl(target.color).l;
      const cands = others(slotOf(target) as Slot).filter(
        (i) => Math.abs(hexToHsl(i.color).l - l0) > 0.3,
      );
      const alt = bestSwap(set, target, cands, score);
      if (alt) {
        push({
          id: `more_contrast:${alt.it.id}`,
          code: 'more_contrast',
          kind: 'swap',
          text: `Prueba con «${alt.it.name}» para crear más contraste.`,
          action: { type: 'swap', fromItemId: target.id, toItemId: alt.it.id },
        });
      }
    }
  }

  // accesorio
  if (!slot('head') && !slot('neck')) {
    const acc = pool.filter(
      (i) =>
        i.category === 'ACCESSORY' &&
        !(ctx.weather === 'hot' && i.modelKey !== 'cap'),
    );
    if (acc.length) {
      const alt = bestAdd(set, acc, score);
      if (alt && ctx.occasion !== 'formal_event' && ctx.occasion !== 'work') {
        push({
          id: `add_accessory:${alt.id}`,
          code: 'add_accessory',
          kind: 'add',
          text: `Te falta un accesorio para completar el look: prueba con «${alt.name}».`,
          action: { type: 'add', itemId: alt.id },
        });
      }
    } else {
      push({
        id: 'missing_accessory',
        code: 'missing_accessory',
        kind: 'missing',
        text: 'Te falta un accesorio para completar el look: una gorra, un gorro o una bufanda le darían el toque final.',
      });
    }
  }

  // cómo se lleva: vuelta en el bajo, por dentro, abierta, remangada
  const bottom = slot('bottom');
  const casualish =
    ['casual', 'streetwear', 'vintage', 'y2k'].includes(ctx.style ?? '') ||
    ['everyday', 'vacation', 'university', 'party'].includes(
      ctx.occasion ?? '',
    ) ||
    (!ctx.style && !ctx.occasion);
  if (
    bottom?.modelKey === 'pants' &&
    ROLLABLE_FITS.includes(str(bottom.attributes, 'fit') ?? 'regular') &&
    casualish &&
    ctx.weather !== 'cold'
  ) {
    push({
      id: `roll_hem:${bottom.id}`,
      code: 'roll_hem',
      kind: 'styling',
      text: `Prueba a dar una vuelta a los bajos de «${bottom.name}» para un aire más relajado.`,
      action: {
        type: 'styling',
        itemId: bottom.id,
        styling: { hem: 'cuffed' },
      },
    });
  }
  const topItem = set.find(
    (i) =>
      slotOf(i) === 'top' &&
      (i.modelKey === 'shirt' || i.modelKey === 'tshirt'),
  );
  const dressy =
    ['smart_casual', 'old_money', 'formal', 'elegant', 'minimalist'].includes(
      ctx.style ?? '',
    ) || ['work', 'date', 'formal_event'].includes(ctx.occasion ?? '');
  if (
    topItem &&
    bottom &&
    dressy &&
    !set.some((i) => i.modelKey === 'sweater')
  ) {
    push({
      id: `tuck_in:${topItem.id}`,
      code: 'tuck_in',
      kind: 'styling',
      text: `Mete «${topItem.name}» por dentro: marca la cintura y queda más limpio.`,
      action: { type: 'styling', itemId: topItem.id, styling: { tuck: 'in' } },
    });
  }
  const outer = slot('outer');
  if (
    outer &&
    (ctx.weather === 'mild' || ctx.weather === 'cool') &&
    ['jacket', 'coat'].includes(outer.modelKey)
  ) {
    push({
      id: `open_front:${outer.id}`,
      code: 'open_front',
      kind: 'styling',
      text: `Prueba a llevar «${outer.name}» sin cerrar: así se ve lo de debajo.`,
      action: { type: 'styling', itemId: outer.id, styling: { front: 'open' } },
    });
  }
  const sleeved = set.find(
    (i) => ['shirt', 'sweater'].includes(i.modelKey) && slotOf(i) === 'top',
  );
  if (sleeved && ctx.weather === 'hot') {
    push({
      id: `roll_sleeves:${sleeved.id}`,
      code: 'roll_sleeves',
      kind: 'styling',
      text: `Remanga «${sleeved.name}»: más fresco y más desenfadado.`,
      action: {
        type: 'styling',
        itemId: sleeved.id,
        styling: { sleeves: 'rolled' },
      },
    });
  }

  // lo que falta en el armario para este tiempo
  if (ctx.weather === 'cold' && !pool.some((i) => slotOf(i) === 'outer')) {
    push({
      id: 'missing_coat',
      code: 'missing_coat',
      kind: 'missing',
      text: 'Para este frío te falta un abrigo en el armario.',
    });
  }

  // los consejos que el usuario ha rechazado alguna vez van al final
  tips.sort(
    (a, b) =>
      (ctx.prefs.rejectedTips[a.code] ?? 0) -
      (ctx.prefs.rejectedTips[b.code] ?? 0),
  );
  return tips.slice(0, 4);
}

function bestSwap(
  set: EngineItem[],
  from: EngineItem,
  cands: EngineItem[],
  score: (s: EngineItem[]) => number,
) {
  let best: { it: EngineItem; s: number } | undefined;
  for (const c of cands) {
    const s = score(set.map((i) => (i === from ? c : i)));
    if (!best || s > best.s) best = { it: c, s };
  }
  return best;
}

function bestAdd(
  set: EngineItem[],
  cands: EngineItem[],
  score: (s: EngineItem[]) => number,
) {
  let best: { it: EngineItem; s: number } | undefined;
  for (const c of cands) {
    const s = score([...set, c]);
    if (!best || s > best.s) best = { it: c, s };
  }
  return best?.it;
}

// ---------------------------------------------------------------- cambiar una prenda
export interface Alternative {
  itemId: string;
  score: number;
  reason: string;
}

/** Prendas que pueden sustituir a `replaceId` en el outfit, de mejor a peor. */
export function alternativesFor(
  pool: EngineItem[],
  currentIds: string[],
  replaceId: string,
  opts: GenerateOptions = {},
  prefs: Preferences = EMPTY_PREFERENCES,
  limit = 6,
): Alternative[] {
  const ctx = makeCtx(opts, prefs);
  const byId = new Map(pool.map((i) => [i.id, i]));
  const current = currentIds
    .map((id) => byId.get(id))
    .filter((i): i is EngineItem => !!i);
  const target = byId.get(replaceId);
  if (!target) return [];
  const slot = slotOf(target);
  const others = current.filter((i) => i.id !== replaceId);
  const cands = pool.filter(
    (i) =>
      slotOf(i) === slot &&
      !currentIds.includes(i.id) &&
      !(opts.excludeIds ?? []).includes(i.id),
  );
  return cands
    .map((c) => {
      const set = [...others, c];
      const j = judge(set, ctx, 0);
      return {
        itemId: c.id,
        score: Math.round(j.total * 100) / 100,
        reason: shortReason(c, j, ctx),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function shortReason(it: EngineItem, j: Judgement, ctx: Ctx): string {
  if (ctx.style && stylesOf(it).has(ctx.style))
    return `Encaja con el estilo ${STYLE_TAGS[ctx.style].toLowerCase()}.`;
  if (j.color.kind === 'accent')
    return `Aporta un toque de ${colorName(j.color.accents[0])}.`;
  if (j.color.kind === 'neutral' || j.color.kind === 'mono')
    return `${cap(colorName(it.color))}: mantiene la paleta tranquila.`;
  if (j.color.contrast === 'high') return 'Da contraste con el resto.';
  return `Nivel de arreglo ${LEVEL(formality(it))}.`;
}

// ---------------------------------------------------------------- lo que le falta al armario
/** Hueco del armario que cubriría la prenda sugerida. */
export type SuggestSlot = 'top' | 'bottom' | 'shoes' | 'outer' | 'accessory';

export interface Insight {
  code: string;
  priority: 1 | 2 | 3;
  text: string;
  /**
   * Prenda que lo resolvería (para mostrarla y llevarla a la wishlist) y lo
   * que ganaría tu armario: combinaciones posibles antes y después de
   * añadirla, contadas con tus prendas reales. Sin `gain` si no se puede contar
   * (accesorios).
   */
  suggestion?: {
    slot: SuggestSlot;
    wishlistCategory:
      'SNEAKERS' | 'TSHIRTS' | 'PANTS' | 'JACKETS' | 'ACCESSORIES';
    color: string;
    gain: { before: number; after: number } | null;
  };
}

/** Prenda sugerida para cada aviso (las que no son una prenda no tienen). */
const SUGGESTIONS: Record<
  string,
  {
    slot: SuggestSlot;
    wishlistCategory: NonNullable<Insight['suggestion']>['wishlistCategory'];
    color: string;
  }
> = {
  no_shoes: { slot: 'shoes', wishlistCategory: 'SNEAKERS', color: '#F2F2F2' },
  neutral_shoes: {
    slot: 'shoes',
    wishlistCategory: 'SNEAKERS',
    color: '#F2F2F2',
  },
  no_tops: { slot: 'top', wishlistCategory: 'TSHIRTS', color: '#F2F2F2' },
  basic_tee: { slot: 'top', wishlistCategory: 'TSHIRTS', color: '#F2F2F2' },
  no_bottoms: { slot: 'bottom', wishlistCategory: 'PANTS', color: '#4A6A98' },
  more_bottoms: { slot: 'bottom', wishlistCategory: 'PANTS', color: '#4A6A98' },
  no_outerwear: {
    slot: 'outer',
    wishlistCategory: 'JACKETS',
    color: '#4A6A98',
  },
  no_coat: { slot: 'outer', wishlistCategory: 'JACKETS', color: '#8A8A8A' },
  smart_piece: { slot: 'outer', wishlistCategory: 'JACKETS', color: '#1D2A44' },
  no_accessory: {
    slot: 'accessory',
    wishlistCategory: 'ACCESSORIES',
    color: '#111111',
  },
  add_color: { slot: 'top', wishlistCategory: 'TSHIRTS', color: '#C0282D' },
  add_neutrals: { slot: 'top', wishlistCategory: 'TSHIRTS', color: '#8A8A8A' },
};

export interface SlotCounts {
  top: number;
  bottom: number;
  full: number;
  shoes: number;
  outer: number;
}

/**
 * Combinaciones posibles con estas prendas: (arriba × abajo + vestidos) ×
 * calzado, con o sin una prenda de abrigo encima. Es un recuento (no mira
 * colores ni estilos): sirve para comparar cuánto gana el armario.
 */
export function combinations(c: SlotCounts): number {
  return (c.top * c.bottom + c.full) * c.shoes * (c.outer + 1);
}

/** Combinaciones antes y después de añadir una prenda en ese hueco. */
export function slotGain(
  c: SlotCounts,
  slot: SuggestSlot,
): { before: number; after: number } | null {
  if (slot === 'accessory') return null;
  return {
    before: combinations(c),
    after: combinations({ ...c, [slot]: c[slot] + 1 }),
  };
}

export interface WardrobeAnalysis {
  insights: Insight[];
  stats: {
    total: number;
    byCategory: Record<string, number>;
    colorFamilies: Record<ColorFamily, number>;
    topColors: { name: string; count: number }[];
    styles: { style: string; label: string; count: number }[];
    unusedItemIds: string[];
    /** Combinaciones posibles con lo que tienes (ver `combinations`). */
    combinations: number;
  };
}

export function analyzeWardrobe(
  pool: EngineItem[],
  prefs: Preferences = EMPTY_PREFERENCES,
): WardrobeAnalysis {
  const byCategory: Record<string, number> = {};
  const families: Record<ColorFamily, number> = {
    neutral: 0,
    earth: 0,
    color: 0,
  };
  const colors = new Map<string, number>();
  const styles = new Map<string, number>();
  for (const it of pool) {
    byCategory[it.category] = (byCategory[it.category] ?? 0) + 1;
    families[colorFamily(it.color)] += 1;
    const n = colorName(it.color);
    colors.set(n, (colors.get(n) ?? 0) + 1);
    for (const s of stylesOf(it)) styles.set(s, (styles.get(s) ?? 0) + 1);
  }
  const count = (c: Category) => byCategory[c] ?? 0;
  const insights: Insight[] = [];
  const add = (code: string, priority: 1 | 2 | 3, text: string) =>
    insights.push({ code, priority, text });
  const tops = count('TOP');
  const bottoms = pool.filter((i) => slotOf(i) === 'bottom').length;
  const shoes = pool.filter((i) => i.category === 'FOOTWEAR');

  if (!pool.length) {
    add(
      'empty',
      1,
      'Aún no hay prendas: añade unas cuantas y te propongo outfits con ellas.',
    );
  } else {
    if (!shoes.length)
      add(
        'no_shoes',
        1,
        'No tienes calzado en el armario: sin él no puedo cerrar ningún outfit.',
      );
    else if (!shoes.some((s) => colorFamily(s.color) === 'neutral'))
      add(
        'neutral_shoes',
        2,
        'Unas zapatillas blancas o negras combinan con casi todo lo que tienes.',
      );
    if (!tops)
      add(
        'no_tops',
        1,
        'Te falta alguna parte de arriba: una camiseta básica es el punto de partida.',
      );
    if (!bottoms && !count('FULL_BODY'))
      add(
        'no_bottoms',
        1,
        'Te falta un pantalón o una falda para poder montar outfits.',
      );
    if (tops >= 3 * Math.max(1, bottoms) && bottoms < 3)
      add(
        'more_bottoms',
        2,
        `Tienes ${tops} partes de arriba y solo ${bottoms} de abajo: otro pantalón multiplicaría tus outfits.`,
      );
    if (!count('OUTERWEAR'))
      add(
        'no_outerwear',
        2,
        'Una chaqueta ligera (vaquera, bomber o sobrecamisa) te serviría para entretiempo.',
      );
    if (
      !pool.some((i) => i.modelKey === 'coat') &&
      pool.some((i) => i.season === 'WINTER' || i.season === 'AUTUMN')
    )
      add(
        'no_coat',
        2,
        'Para invierno te falta un abrigo: uno recto en gris, negro o camel va con todo.',
      );
    if (!pool.some((i) => formality(i) >= 0.6 && slotOf(i) !== 'shoes'))
      add(
        'smart_piece',
        2,
        'Una camisa o una americana te abriría outfits para el trabajo o una cita.',
      );
    if (
      !pool.some(
        (i) =>
          slotOf(i) === 'top' &&
          colorFamily(i.color) === 'neutral' &&
          i.modelKey === 'tshirt',
      )
    )
      add(
        'basic_tee',
        3,
        'Una camiseta básica blanca, negra o gris es la prenda más versátil que puedes tener.',
      );
    if (!count('ACCESSORY'))
      add(
        'no_accessory',
        3,
        'Sin accesorios: una gorra, un gorro o una bufanda le dan el toque final a un look.',
      );
    if (pool.length >= 6 && families.color === 0)
      add(
        'add_color',
        3,
        'Casi todo es neutro: una prenda de color daría juego a tus outfits.',
      );
    if (pool.length >= 6 && families.color > pool.length * 0.6)
      add(
        'add_neutrals',
        3,
        'Tienes mucho color: unos básicos neutros harían que todo combine más fácil.',
      );
  }
  const unused = pool
    .filter((i) => (prefs.usage[i.id] ?? 0) === 0 && slotOf(i) !== null)
    .map((i) => i.id);
  if (unused.length >= 3)
    add(
      'unused',
      3,
      `Tienes ${unused.length} prendas que no usas en ningún outfit: prueba el modo «Descubrir».`,
    );
  const slots: SlotCounts = { top: 0, bottom: 0, full: 0, shoes: 0, outer: 0 };
  for (const it of pool) {
    const sl = slotOf(it);
    if (
      sl === 'top' ||
      sl === 'bottom' ||
      sl === 'full' ||
      sl === 'shoes' ||
      sl === 'outer'
    )
      slots[sl] += 1;
  }
  for (const ins of insights) {
    const sug = SUGGESTIONS[ins.code];
    if (sug) ins.suggestion = { ...sug, gain: slotGain(slots, sug.slot) };
  }
  insights.sort((a, b) => a.priority - b.priority);
  return {
    insights,
    stats: {
      total: pool.length,
      byCategory,
      colorFamilies: families,
      topColors: [...colors.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([name, c]) => ({ name, count: c })),
      styles: [...styles.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([style, c]) => ({
          style,
          label: STYLE_TAGS[style as StyleTag] ?? style,
          count: c,
        })),
      unusedItemIds: unused,
      combinations: combinations(slots),
    },
  };
}
