/**
 * Motor de reglas de OUTFIT RATING: puntúa un outfit sobre 100 en cuatro
 * categorías de 25 puntos (colores, estilo, equilibrio y detalles).
 *
 * Todo sale de reglas explícitas sobre las prendas: color (#RRGGBB → tono,
 * saturación y luz; neutros y tierras), tipo de prenda y sus atributos
 * (corte, cuello...), nivel de arreglo y estilos que ya usa el estilista
 * (`stylist/engine.ts`), temporada, estampados, cómo se lleva cada prenda y
 * su personalización. Cada regla deja una «comprobación» con sus puntos y un
 * texto, así que la nota siempre se puede explicar. No se llama a ninguna IA.
 *
 * Los consejos concretos («añade estas zapatillas: +6») se calculan probando
 * las prendas del armario con este mismo motor.
 */
import { Injectable } from '@nestjs/common';
import {
  EngineItem,
  SeasonKey,
  Slot,
  colorFamily,
  colorName,
  formality,
  hexToHsl,
  slotOf,
  stylesOf,
} from '../../stylist/engine';
import { OCCASIONS, Occasion, StyleTag } from '../../stylist/vocabulary';
import {
  CATEGORY_MAX,
  CategoryResult,
  OutfitStyleKey,
  RATING_CATEGORIES,
  RatingBadge,
  RatingCategory,
  RatingCheck,
  RatingEngine,
  RatingInput,
  RatingItem,
  RatingResult,
  RatingTip,
  TIERS,
  tierFor,
} from './rating.types';

export const RULES_ENGINE_ID = 'rules@1';

// ---------------------------------------------------------------- perfiles de estilo
interface StyleProfile {
  label: string;
  /** Estilos del estilista que «hablan» este estilo. */
  tags: StyleTag[];
  /** Nivel de arreglo típico (0 chándal – 1 etiqueta). */
  formality: number;
  /** Admite colores fuertes y mezclas atrevidas. */
  bold: boolean;
  /** Admite total black / paleta oscura como sello propio. */
  dark: boolean;
  /** Prendas que lo delatan aunque no lleven la etiqueta. */
  marker?: (it: EngineItem) => boolean;
}

const attr = (it: EngineItem, k: string) =>
  typeof it.attributes[k] === 'string' ? (it.attributes[k] as string) : '';
const isDark = (hex: string) => hexToHsl(hex).l < 0.24;

export const STYLE_PROFILES: Record<OutfitStyleKey, StyleProfile> = {
  STREETWEAR: {
    label: 'Streetwear',
    tags: ['streetwear'],
    formality: 0.22,
    bold: true,
    dark: true,
  },
  TECHWEAR: {
    label: 'Techwear',
    tags: ['sporty'],
    formality: 0.22,
    bold: false,
    dark: true,
    marker: (it) =>
      ['windbreaker', 'anorak', 'coach', 'puffer', 'track', 'parka'].includes(
        attr(it, 'style'),
      ) ||
      ['cargo', 'parachute', 'jogger'].includes(attr(it, 'fit')) ||
      (it.category !== 'ACCESSORY' &&
        isDark(it.color) &&
        ['jacket', 'pants', 'sneakers', 'boots'].includes(it.modelKey)),
  },
  OLD_MONEY: {
    label: 'Old Money',
    tags: ['old_money', 'elegant'],
    formality: 0.62,
    bold: false,
    dark: false,
  },
  CASUAL: {
    label: 'Casual',
    tags: ['casual'],
    formality: 0.32,
    bold: false,
    dark: false,
  },
  SKATE: {
    label: 'Skate',
    tags: ['streetwear'],
    formality: 0.18,
    bold: true,
    dark: false,
    marker: (it) =>
      ['skate', 'high_top', 'mid_top'].includes(attr(it, 'style')) ||
      ['baggy', 'wide', 'relaxed', 'cargo'].includes(attr(it, 'fit')) ||
      ['shorts', 'cap', 'beanie'].includes(it.modelKey),
  },
  GRUNGE: {
    label: 'Grunge',
    tags: ['vintage'],
    formality: 0.3,
    bold: false,
    dark: true,
    marker: (it) =>
      it.patterned ||
      attr(it, 'style') === 'combat' ||
      ['biker', 'leather', 'denim'].includes(attr(it, 'style')) ||
      (it.modelKey === 'sweater' && attr(it, 'fit') === 'oversized'),
  },
  Y2K: { label: 'Y2K', tags: ['y2k'], formality: 0.3, bold: true, dark: false },
  MINIMAL: {
    label: 'Minimal',
    tags: ['minimalist'],
    formality: 0.45,
    bold: false,
    dark: true,
  },
  TRAP: {
    label: 'Trap',
    tags: ['streetwear', 'sporty'],
    formality: 0.2,
    bold: true,
    dark: true,
    marker: (it) =>
      attr(it, 'style') === 'chunky' ||
      attr(it, 'style') === 'track' ||
      attr(it, 'fit') === 'jogger',
  },
  LUXURY_STREETWEAR: {
    label: 'Luxury Streetwear',
    tags: ['streetwear', 'elegant'],
    formality: 0.4,
    bold: false,
    dark: true,
    marker: (it) =>
      ['leather', 'biker', 'overcoat', 'trench', 'chelsea'].includes(
        attr(it, 'style'),
      ) ||
      (it.modelKey === 'sneakers' && attr(it, 'style') === 'court'),
  },
};

const STYLE_KEYS = Object.keys(STYLE_PROFILES) as OutfitStyleKey[];

export function fitsStyle(it: EngineItem, style: OutfitStyleKey): boolean {
  const p = STYLE_PROFILES[style];
  const tags = stylesOf(it);
  return p.tags.some((t) => tags.has(t)) || !!p.marker?.(it);
}

// ---------------------------------------------------------------- utilidades
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const hueDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};
const q = (it: { name: string }) => `«${it.name}»`;
const list = (its: { name: string }[]) =>
  its.length <= 1
    ? its.map(q).join('')
    : `${its.slice(0, -1).map(q).join(', ')} y ${q(its[its.length - 1])}`;
const round1 = (n: number) => Math.round(n * 10) / 10;
const pts = (n: number) => `+${n} ${n === 1 ? 'punto' : 'puntos'}`;
const clothesOf = (items: RatingItem[]) =>
  items.filter((i) => i.category !== 'ACCESSORY' && slotOf(i) !== null);
const accessoriesOf = (items: RatingItem[]) =>
  items.filter((i) => i.category === 'ACCESSORY');

const SEASON_LABEL: Record<SeasonKey, string> = {
  SPRING: 'primavera',
  SUMMER: 'verano',
  AUTUMN: 'otoño',
  WINTER: 'invierno',
  ALL_SEASON: 'todo el año',
};

const WIDE_FITS = new Set([
  'oversized',
  'baggy',
  'wide',
  'relaxed',
  'boxy',
  'barrel',
  'cargo',
  'parachute',
  'flare',
  'boyfriend',
  'mom',
]);
const SLIM_FITS = new Set([
  'slim',
  'skinny',
  'fitted',
  'muscle',
  'cropped',
  'pencil',
  'bodycon',
  'tapered',
]);
const volumeOf = (it: EngineItem): 'wide' | 'slim' | 'regular' => {
  const fit = attr(it, 'fit');
  if (WIDE_FITS.has(fit) || attr(it, 'style') === 'puffer') return 'wide';
  if (SLIM_FITS.has(fit)) return 'slim';
  return 'regular';
};

const OCCASION_HINTS: [RegExp, Occasion][] = [
  [/trabaj|curro|oficina|reuni|entrevista/, 'work'],
  [/uni\b|universidad|clase|insti/, 'university'],
  [/cita|cena|date/, 'date'],
  [/fiesta|club|disco|concierto|party|noche|festival/, 'party'],
  [/vacacion|playa|viaje|verano/, 'vacation'],
  [/gym|gimnasio|deporte|correr|entren|running/, 'sport'],
  [/boda|evento|gala|formal|ceremonia|graduaci/, 'formal_event'],
  [/diario|dia a dia|casual|finde|domingo|paseo/, 'everyday'],
];

export function occasionOf(text?: string | null): Occasion | null {
  if (!text) return null;
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return OCCASION_HINTS.find(([re]) => re.test(t))?.[1] ?? null;
}

// ---------------------------------------------------------------- análisis de color
type Harmony =
  | 'none'
  | 'neutral'
  | 'total_black'
  | 'accent'
  | 'mono'
  | 'analogous'
  | 'complementary'
  | 'clash'
  | 'busy';

interface ColorAnalysis {
  harmony: Harmony;
  groups: { h: number; color: string; items: RatingItem[] }[];
}

/** Agrupa los colores «de verdad» (no neutros ni tierras) por tono (±28°). */
function analyzeColors(clothes: RatingItem[]): ColorAnalysis {
  const groups: ColorAnalysis['groups'] = [];
  for (const it of clothes) {
    if (colorFamily(it.color) !== 'color') continue;
    const h = hexToHsl(it.color).h;
    const g = groups.find((x) => hueDist(x.h, h) < 28);
    if (g) g.items.push(it);
    else groups.push({ h, color: it.color, items: [it] });
  }
  let harmony: Harmony;
  if (!clothes.length) harmony = 'none';
  else if (groups.length === 0)
    harmony = clothes.every((i) => hexToHsl(i.color).l < 0.2)
      ? 'total_black'
      : 'neutral';
  else if (groups.length === 1)
    harmony =
      groups[0].items.length >= 2 && groups[0].items.length === clothes.length
        ? 'mono'
        : 'accent';
  else if (groups.length === 2) {
    const d = hueDist(groups[0].h, groups[1].h);
    harmony = d < 45 ? 'analogous' : d > 150 ? 'complementary' : 'clash';
  } else harmony = 'busy';
  return { harmony, groups };
}

// ---------------------------------------------------------------- categorías
interface Ctx {
  input: RatingInput;
  items: RatingItem[];
  clothes: RatingItem[];
  accessories: RatingItem[];
  profile: StyleProfile;
  styleKey: OutfitStyleKey;
  declared: boolean;
  colors: ColorAnalysis;
}

function category(
  checks: RatingCheck[],
  base = 0,
  cap = CATEGORY_MAX,
): CategoryResult {
  const raw = base + checks.reduce((a, c) => a + c.points, 0);
  return {
    score: Math.round(clamp(raw, 0, Math.min(cap, CATEGORY_MAX))),
    max: CATEGORY_MAX,
    checks,
  };
}

function scoreColors(ctx: Ctx): CategoryResult {
  const { clothes, profile, colors } = ctx;
  const checks: RatingCheck[] = [];
  if (!clothes.length)
    return category([
      {
        code: 'colors.empty',
        points: 0,
        text: 'Sin prendas no hay colores que valorar.',
      },
    ]);
  const g = colors.groups;
  const label = profile.label;
  const add = (
    code: string,
    points: number,
    text: string,
    itemIds?: string[],
  ) => checks.push({ code, points, text, itemIds });

  switch (colors.harmony) {
    case 'total_black':
      add(
        'colors.total_black',
        profile.dark ? 21 : 17,
        profile.dark
          ? `Total black: el sello del ${label}.`
          : 'Todo oscuro: sobrio, aunque algo plano.',
      );
      break;
    case 'neutral':
      add(
        'colors.neutral',
        16,
        'Paleta neutra (negro, gris, blanco, crudo): segura y fácil de combinar.',
      );
      break;
    case 'accent':
      add(
        'colors.accent',
        21,
        `Un solo color protagonista (${colorName(g[0].color)}) sobre neutros: la combinación más limpia.`,
        g[0].items.map((i) => i.id),
      );
      break;
    case 'mono':
      add(
        'colors.mono',
        ctx.styleKey === 'MINIMAL' ? 21 : 18,
        `Monocromo en ${colorName(g[0].color)}: coherente y con intención.`,
      );
      break;
    case 'analogous':
      add(
        'colors.analogous',
        19,
        `${colorName(g[0].color)} y ${colorName(g[1].color)} son vecinos en la rueda de color: armonía suave.`,
      );
      break;
    case 'complementary':
      add(
        'colors.complementary',
        profile.bold ? 20 : 16,
        `${colorName(g[0].color)} y ${colorName(g[1].color)} son opuestos: contraste fuerte${profile.bold ? ', muy de calle' : ' que pide un estilo atrevido'}.`,
      );
      break;
    case 'clash':
      add(
        'colors.clash',
        profile.bold ? 12 : 9,
        `${colorName(g[0].color)} y ${colorName(g[1].color)} compiten entre sí (ni vecinos ni opuestos).`,
        [...g[0].items, ...g[1].items].map((i) => i.id),
      );
      break;
    case 'busy':
      add(
        'colors.busy',
        ctx.styleKey === 'Y2K' ? 13 : profile.bold ? 9 : 5,
        `${g.length} colores fuertes a la vez: ${g.map((x) => colorName(x.color)).join(', ')}.`,
        g.flatMap((x) => x.items.map((i) => i.id)),
      );
      break;
  }

  // Contraste de luz entre la parte de arriba y la de abajo.
  const top =
    clothes.find((i) => slotOf(i) === 'top') ??
    clothes.find((i) => slotOf(i) === 'outer');
  const bottom = clothes.find((i) => slotOf(i) === 'bottom');
  if (top && bottom) {
    const a = hexToHsl(top.color);
    const b = hexToHsl(bottom.color);
    const dl = Math.abs(a.l - b.l);
    const sameFamily = hueDist(a.h, b.h) < 25 || (a.s < 0.15 && b.s < 0.15);
    if (dl > 0.25)
      add(
        'colors.contrast',
        3,
        `${q(top)} y ${q(bottom)}: contraste claro-oscuro marcado.`,
        [top.id, bottom.id],
      );
    else if (dl < 0.1 && sameFamily && colors.harmony !== 'total_black')
      add(
        'colors.tonal',
        ctx.styleKey === 'MINIMAL' || ctx.styleKey === 'OLD_MONEY' ? 3 : 2,
        `${q(top)} y ${q(bottom)} van tono sobre tono.`,
        [top.id, bottom.id],
      );
    else if (dl < 0.08 && !sameFamily)
      add(
        'colors.flat',
        -2,
        `${q(top)} y ${q(bottom)} tienen la misma luz sin ser del mismo tono: se ven planos.`,
        [top.id, bottom.id],
      );
  }

  // Tonos tierra.
  if (g.length <= 1 && clothes.some((i) => colorFamily(i.color) === 'earth'))
    add('colors.earth', 1, 'Los tonos tierra suman calidez a la paleta.');

  // Eco: un color que se repite en varias prendas (o en un detalle o accesorio).
  for (const grp of g) {
    const echoes = ctx.items.filter(
      (i) =>
        !grp.items.includes(i) &&
        [i.color, ...i.detailColors].some(
          (c) =>
            colorFamily(c) === 'color' && hueDist(hexToHsl(c).h, grp.h) < 28,
        ),
    );
    if (echoes.length) {
      add(
        'colors.echo',
        2,
        `El ${colorName(grp.color)} se repite en ${list([grp.items[0], echoes[0]])}: el conjunto se ve pensado.`,
      );
      break;
    }
  }

  // Estampados que compiten.
  const patterned = clothes.filter((i) => i.patterned);
  if (patterned.length > 1)
    add(
      'colors.patterns',
      -(patterned.length - 1) * (profile.bold ? 1.5 : 3),
      `Varios estampados a la vez (${list(patterned)}) se pisan.`,
      patterned.map((i) => i.id),
    );

  // Lo que cada estilo pide de la paleta.
  if (
    ctx.declared &&
    (ctx.styleKey === 'OLD_MONEY' || ctx.styleKey === 'MINIMAL')
  ) {
    const loud = g.filter((x) => hexToHsl(x.color).s > 0.55);
    if (loud.length)
      add(
        'colors.too_loud',
        -3 * loud.length,
        `${label} pide colores apagados; ${colorName(loud[0].color)} grita demasiado.`,
        loud[0].items.map((i) => i.id),
      );
  }
  if (ctx.declared && ctx.styleKey === 'TECHWEAR') {
    const bright = clothes.filter(
      (i) => hexToHsl(i.color).s > 0.6 && hexToHsl(i.color).l > 0.4,
    );
    if (bright.length)
      add(
        'colors.techwear_bright',
        -2 * bright.length,
        `Techwear va con paleta oscura y técnica: ${list(bright)} brilla demasiado.`,
        bright.map((i) => i.id),
      );
  }

  // Con una o dos prendas hay poca combinación que valorar.
  return category(
    checks,
    0,
    clothes.length < 2 ? 12 : clothes.length < 3 ? 18 : CATEGORY_MAX,
  );
}

function scoreStyle(ctx: Ctx): CategoryResult {
  const { clothes, profile, styleKey } = ctx;
  const checks: RatingCheck[] = [];
  const add = (
    code: string,
    points: number,
    text: string,
    itemIds?: string[],
  ) => checks.push({ code, points, text, itemIds });
  if (!clothes.length)
    return category([
      {
        code: 'style.empty',
        points: 0,
        text: 'Añade prendas para valorar el estilo.',
      },
    ]);

  const fitting = clothes.filter((i) => fitsStyle(i, styleKey));
  const ratio = fitting.length / clothes.length;
  add(
    'style.fit',
    4 + 13 * ratio,
    ratio === 1
      ? `Todas las prendas encajan con ${profile.label}.`
      : `${fitting.length} de ${clothes.length} prendas encajan con ${profile.label}.`,
    fitting.map((i) => i.id),
  );
  const outliers = clothes.filter((i) => !fitting.includes(i));
  if (outliers.length && ratio < 1)
    add(
      'style.outliers',
      0,
      `${list(outliers.slice(0, 3))} ${outliers.length > 1 ? 'se salen' : 'se sale'} del estilo ${profile.label}.`,
      outliers.map((i) => i.id),
    );

  // Nivel de arreglo: medio y dispersión.
  const fs = clothes.map((i) => ({ it: i, f: formality(i) }));
  const mean = fs.reduce((a, b) => a + b.f, 0) / fs.length;
  const dist = Math.abs(mean - profile.formality);
  if (dist <= 0.12)
    add('style.formality', 4, `El nivel de arreglo es el de ${profile.label}.`);
  else if (dist <= 0.25)
    add(
      'style.formality',
      2,
      `Nivel de arreglo cercano al de ${profile.label}.`,
    );
  else
    add(
      'style.formality_off',
      -Math.min(4, round1((dist - 0.25) * 16)),
      mean > profile.formality
        ? `Demasiado arreglado para ${profile.label}.`
        : `Demasiado informal para ${profile.label}.`,
    );

  if (fs.length >= 2) {
    const sorted = [...fs].sort((a, b) => a.f - b.f);
    const spread = sorted[sorted.length - 1].f - sorted[0].f;
    if (spread <= 0.3)
      add('style.coherent', 3, 'Todas las prendas hablan el mismo idioma.');
    else if (spread <= 0.45)
      add('style.coherent', 1, 'Mezcla de arreglado e informal bien medida.');
    else
      add(
        'style.mixed',
        -3,
        `${q(sorted[sorted.length - 1].it)} es mucho más arreglada que ${q(sorted[0].it)}.`,
        [sorted[0].it.id, sorted[sorted.length - 1].it.id],
      );
  }

  if (ctx.declared)
    add('style.declared', 1, `Estilo marcado: ${profile.label}.`);
  else
    add(
      'style.detected',
      0,
      `Sin estilo marcado: por las prendas parece ${profile.label}.`,
    );

  // Ocasión (texto libre que se reconoce por palabras).
  const occ = occasionOf(ctx.input.occasion);
  if (occ) {
    const target = OCCASIONS[occ].formality;
    if (Math.abs(mean - target) > 0.25)
      add(
        'style.occasion_off',
        -2,
        mean > target
          ? `Para «${ctx.input.occasion}» va demasiado arreglado.`
          : `Para «${ctx.input.occasion}» se queda corto de arreglo.`,
      );
    else
      add(
        'style.occasion',
        0,
        `Encaja con la ocasión: «${ctx.input.occasion}».`,
      );
  }
  // Con menos de tres prendas la coherencia es fácil: no puede ser de nota máxima.
  return category(checks, 0, clothes.length < 3 ? 18 : CATEGORY_MAX);
}

function scoreBalance(ctx: Ctx): CategoryResult {
  const { clothes, input, styleKey } = ctx;
  const checks: RatingCheck[] = [];
  const add = (
    code: string,
    points: number,
    text: string,
    itemIds?: string[],
  ) => checks.push({ code, points, text, itemIds });
  if (!clothes.length)
    return category([
      { code: 'balance.empty', points: 0, text: 'El maniquí está vacío.' },
    ]);

  const by = (s: Slot) => clothes.filter((i) => slotOf(i) === s);
  const tops = by('top');
  const bottoms = by('bottom');
  const full = by('full');
  const outer = by('outer');
  const shoes = by('shoes');
  const upper = tops.length + full.length > 0;
  const lower = bottoms.length + full.length > 0;

  if (upper) add('balance.upper', 6, 'Parte de arriba resuelta.');
  else add('balance.no_upper', 0, 'Falta la parte de arriba.');
  if (lower) add('balance.lower', 6, 'Parte de abajo resuelta.');
  else add('balance.no_lower', 0, 'Falta la parte de abajo.');
  if (shoes.length) add('balance.shoes', 5, `Calzado: ${q(shoes[0])}.`);
  else
    add(
      'balance.no_shoes',
      0,
      'Falta el calzado: el outfit no está terminado.',
    );

  let clean = true;
  if (bottoms.length > 1) {
    clean = false;
    add(
      'balance.two_bottoms',
      -5,
      `Dos prendas de abajo a la vez (${list(bottoms)}).`,
      bottoms.map((i) => i.id),
    );
  }
  if (shoes.length > 1) {
    clean = false;
    add(
      'balance.two_shoes',
      -5,
      `Dos calzados a la vez (${list(shoes)}).`,
      shoes.map((i) => i.id),
    );
  }
  if (full.length && bottoms.length) {
    clean = false;
    add(
      'balance.full_and_bottom',
      -3,
      `${q(full[0])} ya cubre la parte de abajo.`,
      [full[0].id, bottoms[0].id],
    );
  }
  if (tops.length > 2) {
    clean = false;
    add(
      'balance.many_tops',
      -2,
      `${tops.length} prendas de arriba debajo de la capa: demasiado bulto.`,
      tops.map((i) => i.id),
    );
  }
  if (outer.length > 1) {
    clean = false;
    add(
      'balance.many_outer',
      -2,
      `Dos capas exteriores (${list(outer)}).`,
      outer.map((i) => i.id),
    );
  }
  if (upper && lower && shoes.length && clean)
    add('balance.complete', 2, 'Conjunto completo, sin piezas que sobren.');

  // Volúmenes: ancho arriba con ajustado abajo (o al revés) equilibra.
  const up = [...outer, ...tops, ...full][0];
  const down = bottoms[0];
  if (up && down) {
    const a = volumeOf(up);
    const b = volumeOf(down);
    if ((a === 'wide' && b === 'slim') || (a === 'slim' && b === 'wide'))
      add(
        'balance.volumes',
        4,
        `Juego de volúmenes: ${q(up)} ${a === 'wide' ? 'ancha' : 'ajustada'} con ${q(down)} ${b === 'wide' ? 'ancho' : 'ajustado'}.`,
        [up.id, down.id],
      );
    else if (a === 'wide' && b === 'wide')
      ['STREETWEAR', 'SKATE', 'TRAP'].includes(styleKey)
        ? add(
            'balance.volumes',
            3,
            'Todo ancho, arriba y abajo: silueta skater muy de calle.',
            [up.id, down.id],
          )
        : add(
            'balance.all_wide',
            -1,
            'Todo ancho arriba y abajo: la silueta se pierde.',
            [up.id, down.id],
          );
    else if (a === 'slim' && b === 'slim')
      add('balance.volumes', 1, 'Silueta ajustada de arriba abajo.');
    else add('balance.volumes', 2, 'Siluetas rectas y proporcionadas.');
  }

  // Capas y temporada.
  const season =
    input.season && input.season !== 'ALL_SEASON' ? input.season : null;
  if (outer.length) {
    if (season === 'SUMMER')
      add('balance.summer_layer', -2, `${q(outer[0])} sobra en verano.`, [
        outer[0].id,
      ]);
    else
      add('balance.layer', 2, `${q(outer[0])} añade una capa y profundidad.`, [
        outer[0].id,
      ]);
  } else if (
    season === 'WINTER' &&
    !clothes.some((i) => i.modelKey === 'sweater')
  )
    add(
      'balance.winter_no_layer',
      -2,
      'Para invierno le falta una capa de abrigo.',
    );
  if (season) {
    const opposite = (s: SeasonKey) =>
      (s === 'SUMMER' && season === 'WINTER') ||
      (s === 'WINTER' && season === 'SUMMER');
    const wrong = clothes.filter((i) => opposite(i.season));
    if (wrong.length)
      add(
        'balance.season',
        -Math.min(4, 2 * wrong.length),
        `${list(wrong.slice(0, 2))} ${wrong.length > 1 ? 'son' : 'es'} de ${SEASON_LABEL[wrong[0].season]} y el outfit es de ${SEASON_LABEL[season]}.`,
        wrong.map((i) => i.id),
      );
  }

  if (clothes.length < 3)
    add('balance.few', -2, 'Muy pocas prendas para un look completo.');
  if (clothes.length > 7)
    add('balance.too_many', -2, `${clothes.length} prendas: demasiadas capas.`);
  return category(checks);
}

const ACC_BASE = [7, 14, 18, 19, 16];
function scoreDetails(ctx: Ctx): CategoryResult {
  const { clothes, accessories, profile, styleKey, colors } = ctx;
  const checks: RatingCheck[] = [];
  const add = (
    code: string,
    points: number,
    text: string,
    itemIds?: string[],
  ) => checks.push({ code, points, text, itemIds });
  if (!ctx.items.length)
    return category([
      {
        code: 'details.empty',
        points: 0,
        text: 'Sin prendas no hay detalles.',
      },
    ]);

  const n = accessories.length;
  const base = n < ACC_BASE.length ? ACC_BASE[n] : 12;
  if (n === 0)
    add(
      'details.no_accessories',
      base,
      'Sin accesorios: le falta un toque final (gorra, gorro, bufanda...).',
    );
  else if (n <= 3)
    add(
      'details.accessories',
      base,
      `${n === 1 ? 'Un accesorio' : `${n} accesorios`}: ${list(accessories)}.`,
      accessories.map((i) => i.id),
    );
  else
    add(
      'details.too_many',
      base,
      `${n} accesorios: se carga demasiado.`,
      accessories.map((i) => i.id),
    );

  // Accesorios que encajan (o no) con el estilo.
  const accFit = accessories.filter((i) => fitsStyle(i, styleKey));
  if (accFit.length)
    add(
      'details.acc_style',
      Math.min(2, accFit.length),
      `${q(accFit[0])} encaja con ${profile.label}.`,
      [accFit[0].id],
    );
  const accOff = accessories.filter((i) => !fitsStyle(i, styleKey));
  if (accOff.length && ctx.declared)
    add(
      'details.acc_off',
      -1,
      `${q(accOff[0])} no pega con ${profile.label}.`,
      [accOff[0].id],
    );

  // El accesorio como punto de color.
  const colorAcc = accessories.filter((i) => colorFamily(i.color) === 'color');
  if (colorAcc.length) {
    const h = hexToHsl(colorAcc[0].color).h;
    if (colors.groups.length === 0)
      add(
        'details.acc_accent',
        3,
        `${q(colorAcc[0])} pone el único punto de color.`,
        [colorAcc[0].id],
      );
    else if (colors.groups.some((g) => hueDist(g.h, h) < 28))
      add(
        'details.acc_echo',
        2,
        `${q(colorAcc[0])} repite el color del outfit.`,
        [colorAcc[0].id],
      );
    else if (colors.groups.length >= 1 && !profile.bold)
      add(
        'details.acc_extra_color',
        -1,
        `${q(colorAcc[0])} suma otro color más.`,
        [colorAcc[0].id],
      );
  }

  // Cómo se lleva cada prenda (por dentro, remangada, abierta...).
  const styled = ctx.items.filter((i) => Object.keys(i.styling).length > 0);
  if (styled.length)
    add(
      'details.styling',
      Math.min(4, 2 * styled.length),
      `Detalles de cómo se lleva en ${list(styled.slice(0, 2))}.`,
      styled.map((i) => i.id),
    );

  // Personalización (colores de piezas, parches, bordados).
  const custom = ctx.items.filter(
    (i) => i.details > 0 || i.detailColors.length > 0,
  );
  if (custom.length)
    add(
      'details.custom',
      Math.min(3, 1.5 * custom.length),
      `Prendas personalizadas: ${list(custom.slice(0, 2))}.`,
      custom.map((i) => i.id),
    );

  // Un estampado protagonista.
  const patterned = clothes.filter((i) => i.patterned);
  if (patterned.length === 1)
    add(
      'details.pattern',
      2,
      `${q(patterned[0])} hace de estampado protagonista.`,
      [patterned[0].id],
    );

  // Calzado que pone el color.
  const shoes = clothes.find((i) => slotOf(i) === 'shoes');
  const rest = clothes.filter((i) => i !== shoes);
  if (
    shoes &&
    colorFamily(shoes.color) === 'color' &&
    rest.length &&
    rest.every((i) => colorFamily(i.color) !== 'color')
  )
    add('details.shoes_accent', 2, `${q(shoes)} ponen el color desde abajo.`, [
      shoes.id,
    ]);
  return category(checks);
}

// ---------------------------------------------------------------- nota
export interface Score {
  total: number;
  categories: Record<RatingCategory, CategoryResult>;
  styleKey: OutfitStyleKey;
  detected: OutfitStyleKey;
  colors: ColorAnalysis;
}

/** Estilo que mejor encaja con las prendas (más prendas y arreglo más parecido). */
export function detectStyle(items: RatingItem[]): OutfitStyleKey {
  const clothes = clothesOf(items);
  if (!clothes.length) return 'CASUAL';
  const mean = clothes.reduce((a, i) => a + formality(i), 0) / clothes.length;
  let best: OutfitStyleKey = 'CASUAL';
  let bestScore = -Infinity;
  for (const k of STYLE_KEYS) {
    const ratio =
      clothes.filter((i) => fitsStyle(i, k)).length / clothes.length;
    const s = ratio - 0.6 * Math.abs(mean - STYLE_PROFILES[k].formality);
    if (s > bestScore + 1e-9) {
      bestScore = s;
      best = k;
    }
  }
  return best;
}

/** Puntúa sin comentarios ni consejos (rápido: se usa para probar cambios). */
export function scoreOutfit(input: RatingInput): Score {
  const items = input.items;
  const detected = detectStyle(items);
  const styleKey = input.style ?? detected;
  const clothes = clothesOf(items);
  const ctx: Ctx = {
    input,
    items,
    clothes,
    accessories: accessoriesOf(items),
    profile: STYLE_PROFILES[styleKey],
    styleKey,
    declared: !!input.style,
    colors: analyzeColors(clothes),
  };
  const categories: Record<RatingCategory, CategoryResult> = {
    colors: scoreColors(ctx),
    style: scoreStyle(ctx),
    balance: scoreBalance(ctx),
    details: scoreDetails(ctx),
  };
  const total = RATING_CATEGORIES.reduce((a, c) => a + categories[c].score, 0);
  return { total, categories, styleKey, detected, colors: ctx.colors };
}

// ---------------------------------------------------------------- comentarios, consejos e insignias
const CATEGORY_LABEL: Record<RatingCategory, string> = {
  colors: 'combinación de colores',
  style: 'coherencia del estilo',
  balance: 'equilibrio de prendas',
  details: 'accesorios y detalles',
};

/** Consejo general para cada regla que resta o que falta. */
const GENERIC_TIPS: Record<string, string> = {
  'colors.busy':
    'Quédate con un color protagonista y pasa el resto a neutros (negro, gris, blanco, crudo).',
  'colors.clash':
    'Cambia uno de los dos colores por un neutro o por uno vecino en la rueda de color.',
  'colors.flat':
    'Separa arriba y abajo con un contraste de luz: claro con oscuro.',
  'colors.patterns': 'Deja un solo estampado y acompáñalo de prendas lisas.',
  'colors.too_loud':
    'Para este estilo, cambia el color fuerte por un tono apagado (camel, gris, marino).',
  'colors.techwear_bright':
    'En techwear, los colores vivos solo como detalle pequeño.',
  'colors.neutral':
    'Un único punto de color (gorra, zapatillas o una prenda) haría saltar el conjunto.',
  'style.formality_off':
    'Ajusta el nivel de arreglo: cambia la prenda que más desentona por otra del estilo.',
  'style.mixed':
    'Iguala el nivel de arreglo: evita juntar la prenda más formal con la más deportiva.',
  'style.occasion_off':
    'Revisa la ocasión: el outfit no tiene el nivel de arreglo que pide.',
  'balance.no_shoes': 'Añade calzado: sin él el outfit no está terminado.',
  'balance.no_lower': 'Añade un pantalón, una falda o unos shorts.',
  'balance.no_upper': 'Añade una prenda de arriba.',
  'balance.two_bottoms': 'Deja una sola prenda de abajo.',
  'balance.two_shoes': 'Deja un solo calzado.',
  'balance.full_and_bottom':
    'Con vestido o mono no hace falta otra prenda de abajo.',
  'balance.all_wide':
    'Compensa: si arriba va ancho, abajo algo más recto (o al revés).',
  'balance.summer_layer': 'En verano, quita la capa exterior.',
  'balance.winter_no_layer':
    'Para invierno añade un abrigo, una chaqueta o un jersey.',
  'balance.season':
    'Cambia la prenda de otra temporada por una de la temporada del outfit.',
  'balance.few':
    'Suma una tercera pieza (capa, calzado o accesorio) para completar el look.',
  'balance.too_many': 'Quita una capa: menos piezas se leen mejor.',
  'details.no_accessories':
    'Un accesorio (gorra, gorro o bufanda) remata el outfit.',
  'details.too_many': 'Quita algún accesorio: con dos o tres basta.',
  'details.acc_off': 'Cambia el accesorio por uno que vaya con el estilo.',
  'details.acc_extra_color':
    'Que el accesorio repita un color del outfit o sea neutro.',
};

function badgesFor(s: Score): RatingBadge[] {
  const tier = TIERS.find((t) => t.key === tierFor(s.total))!;
  const out: RatingBadge[] = [{ code: tier.key, label: tier.label }];
  const c = s.categories;
  if (c.colors.score >= 23)
    out.push({ code: 'palette_master', label: 'Paleta perfecta' });
  if (c.style.score >= 23)
    out.push({ code: 'style_locked', label: 'Estilo clavado' });
  if (c.balance.score >= 23)
    out.push({ code: 'balanced', label: 'Proporciones de catálogo' });
  if (c.details.score >= 22)
    out.push({ code: 'detail_freak', label: 'Obsesión por el detalle' });
  if (s.colors.harmony === 'total_black')
    out.push({ code: 'total_black', label: 'Total black' });
  if (s.colors.harmony === 'accent')
    out.push({ code: 'one_accent', label: 'Un solo acento' });
  return out;
}

function commentsFor(s: Score, input: RatingInput): string[] {
  if (!input.items.length)
    return ['Elige prendas para que el outfit tenga nota.'];
  const all = RATING_CATEGORIES.flatMap((c) =>
    s.categories[c].checks.map((k) => ({ ...k, c })),
  );
  const best = [...RATING_CATEGORIES].sort(
    (a, b) => s.categories[b].score - s.categories[a].score,
  )[0];
  const worst = [...RATING_CATEGORIES].sort(
    (a, b) => s.categories[a].score - s.categories[b].score,
  )[0];
  const tier = TIERS.find((t) => t.key === tierFor(s.total))!;
  const out = [
    `${s.total}/100, nivel ${tier.label}. Lo que más suma: ${CATEGORY_LABEL[best]} (${s.categories[best].score}/25)` +
      (s.categories[worst].score < CATEGORY_MAX - 3
        ? `; lo que más resta: ${CATEGORY_LABEL[worst]} (${s.categories[worst].score}/25).`
        : '.'),
  ];
  // Lo mejor (reglas que más suman, sin las estructurales de «tiene X»).
  const structural =
    /^(balance\.(upper|lower|shoes)|style\.fit|details\.accessories|details\.no_accessories)$/;
  const plus = all
    .filter((k) => k.points > 0 && !structural.test(k.code))
    .sort((a, b) => b.points - a.points)
    .slice(0, 2);
  const minus = all
    .filter(
      (k) => k.points < 0 || /^(balance\.no_|style\.outliers)/.test(k.code),
    )
    .sort((a, b) => a.points - b.points)
    .slice(0, 2);
  for (const k of plus) out.push(k.text);
  for (const k of minus) out.push(k.text);
  return out;
}

function sameSlot(a: EngineItem, b: EngineItem) {
  return (
    slotOf(a) === slotOf(b) &&
    (a.category !== 'ACCESSORY' || b.category === 'ACCESSORY')
  );
}

/** Consejos con cambios concretos del armario, probados con el propio motor. */
function concreteTips(
  input: RatingInput,
  s: Score,
  pool: RatingItem[],
): RatingTip[] {
  const inOutfit = new Set(input.items.map((i) => i.id));
  const cands = pool.filter((p) => !inOutfit.has(p.id) && slotOf(p) !== null);
  const total = (items: RatingItem[]) => scoreOutfit({ ...input, items }).total;
  const tips: RatingTip[] = [];
  const PER_SLOT = 150;

  const bestAdd = (pred: (i: RatingItem) => boolean) => {
    let best: { it: RatingItem; t: number } | null = null;
    for (const it of cands.filter(pred).slice(0, PER_SLOT)) {
      const t = total([...input.items, it]);
      if (!best || t > best.t) best = { it, t };
    }
    return best;
  };

  const clothes = clothesOf(input.items);
  const has = (slot: Slot) => clothes.some((i) => slotOf(i) === slot);
  const hasFull = has('full');
  const wants: {
    pred: (i: RatingItem) => boolean;
    code: string;
    verb: string;
  }[] = [];
  if (!has('shoes'))
    wants.push({
      pred: (i) => slotOf(i) === 'shoes',
      code: 'add.shoes',
      verb: 'Ponle',
    });
  if (!has('bottom') && !hasFull)
    wants.push({
      pred: (i) => slotOf(i) === 'bottom',
      code: 'add.bottom',
      verb: 'Añade',
    });
  if (!has('top') && !hasFull)
    wants.push({
      pred: (i) => slotOf(i) === 'top',
      code: 'add.top',
      verb: 'Añade',
    });
  if (!accessoriesOf(input.items).length)
    wants.push({
      pred: (i) => i.category === 'ACCESSORY',
      code: 'add.accessory',
      verb: 'Remata con',
    });
  if (input.season === 'WINTER' && !has('outer'))
    wants.push({
      pred: (i) => slotOf(i) === 'outer',
      code: 'add.outer',
      verb: 'Abrígalo con',
    });
  for (const w of wants) {
    const b = bestAdd(w.pred);
    if (b && b.t > s.total)
      tips.push({
        code: w.code,
        text: `${w.verb} ${q(b.it)}: ${pts(b.t - s.total)}.`,
        gain: b.t - s.total,
        action: { type: 'add', itemId: b.it.id },
      });
  }

  // El mejor cambio de una prenda por otra del mismo hueco.
  let swap: { from: RatingItem; to: RatingItem; t: number } | null = null;
  for (const from of input.items) {
    const others = input.items.filter((i) => i !== from);
    for (const to of cands
      .filter((c) => sameSlot(c, from))
      .slice(0, PER_SLOT)) {
      const t = total([...others, to]);
      if (t > (swap?.t ?? s.total + 2)) swap = { from, to, t };
    }
  }
  if (swap)
    tips.push({
      code: 'swap',
      text: `Cambia ${q(swap.from)} por ${q(swap.to)}: ${pts(swap.t - s.total)}.`,
      gain: swap.t - s.total,
      action: { type: 'swap', fromItemId: swap.from.id, toItemId: swap.to.id },
    });

  // Quitar una prenda que resta.
  if (input.items.length > 2) {
    let rem: { it: RatingItem; t: number } | null = null;
    for (const it of input.items) {
      const t = total(input.items.filter((i) => i !== it));
      if (t > (rem?.t ?? s.total + 1)) rem = { it, t };
    }
    if (rem)
      tips.push({
        code: 'remove',
        text: `Quita ${q(rem.it)}: ${pts(rem.t - s.total)}.`,
        gain: rem.t - s.total,
        action: { type: 'remove', itemId: rem.it.id },
      });
  }

  // Marcar el estilo detectado.
  if (!input.style && input.items.length) {
    const t = scoreOutfit({ ...input, style: s.detected }).total;
    const gain = t - s.total;
    tips.push({
      code: 'style',
      text: `Márcalo como ${STYLE_PROFILES[s.detected].label}${gain > 0 ? `: ${pts(gain)}` : ': así la nota se ajusta a lo que buscas'}.`,
      gain: gain > 0 ? gain : undefined,
      action: { type: 'style', style: s.detected },
    });
  }
  return tips.sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0));
}

/** Consejo general que ya cubre uno concreto (para no repetir). */
const COVERED_BY: Record<string, string[]> = {
  'balance.no_shoes': ['add.shoes'],
  'balance.no_lower': ['add.bottom'],
  'balance.no_upper': ['add.top'],
  'details.no_accessories': ['add.accessory'],
  'balance.winter_no_layer': ['add.outer'],
  'balance.few': [
    'add.shoes',
    'add.bottom',
    'add.top',
    'add.accessory',
    'add.outer',
  ],
  'balance.two_bottoms': ['remove'],
  'balance.two_shoes': ['remove'],
};

/** Si no hay nada que corregir: una idea para la categoría más floja. */
const CATEGORY_TIPS: Record<RatingCategory, string> = {
  colors:
    'Prueba a repetir un color en dos sitios (prenda y accesorio, o prenda y zapatillas).',
  style:
    'Cambia la prenda que menos encaja por otra más del estilo que buscas.',
  balance: 'Juega con los volúmenes: ancho arriba y recto abajo, o al revés.',
  details:
    'Dale un detalle: remanga, mete la camiseta por dentro o personaliza una prenda.',
};

function genericTips(s: Score, covered: Set<string>): RatingTip[] {
  const seen = new Set<string>();
  const out: RatingTip[] = [];
  const checks = RATING_CATEGORIES.flatMap((c) => s.categories[c].checks)
    .filter((k) => GENERIC_TIPS[k.code])
    .sort((a, b) => a.points - b.points);
  for (const k of checks) {
    if (seen.has(k.code) || (k.points > 0 && k.code !== 'colors.neutral'))
      continue;
    if (COVERED_BY[k.code]?.some((c) => covered.has(c))) continue;
    seen.add(k.code);
    out.push({ code: k.code, text: GENERIC_TIPS[k.code] });
  }
  if (!out.length && !covered.size && s.total < 100) {
    const weakest = [...RATING_CATEGORIES].sort(
      (a, b) => s.categories[a].score - s.categories[b].score,
    )[0];
    if (s.categories[weakest].score < CATEGORY_MAX)
      out.push({ code: `idea.${weakest}`, text: CATEGORY_TIPS[weakest] });
  }
  return out;
}

export function rateOutfit(
  input: RatingInput,
  pool: RatingItem[] = [],
): RatingResult {
  const s = scoreOutfit(input);
  const concrete = input.items.length ? concreteTips(input, s, pool) : [];
  const tips = [
    ...concrete,
    ...genericTips(s, new Set(concrete.map((t) => t.code))),
  ].slice(0, 5);
  const palette: RatingResult['palette'] = [];
  for (const it of clothesOf(input.items)) {
    if (!palette.some((p) => p.color.toLowerCase() === it.color.toLowerCase()))
      palette.push({ color: it.color, name: colorName(it.color) });
  }
  return {
    version: 1,
    engine: RULES_ENGINE_ID,
    total: s.total,
    tier: tierFor(s.total),
    categories: s.categories,
    comments: commentsFor(s, input),
    tips,
    badges: input.items.length ? badgesFor(s) : [],
    palette: palette.slice(0, 8),
    detectedStyle: input.items.length ? s.detected : null,
  };
}

/** El motor de reglas como proveedor de Nest. */
@Injectable()
export class RulesRatingEngine implements RatingEngine {
  readonly id = RULES_ENGINE_ID;
  rate(input: RatingInput, pool?: RatingItem[]): RatingResult {
    return rateOutfit(input, pool);
  }
}
