/**
 * Qué se puede personalizar en cada tipo de prenda (por `modelKey`).
 *
 * - colors: componentes con color propio (botones, pespuntes, cremallera...).
 *   Si el usuario no elige uno, el 3D usa un color derivado del principal.
 * - parts: piezas que se pueden poner o quitar. `default: null` significa
 *   "lo decide el estilo/corte" (por ejemplo, una gabardina lleva cinturón).
 *
 * Igual que los cortes del catálogo, las claves son ESTABLES: se pueden añadir,
 * pero no renombrar ni borrar (las prendas guardadas dejarían de validar).
 */

export const COLOR_SLOTS = [
  'buttons',
  'stitching',
  'zipper',
  'hardware',
  'trim',
  'lining',
  'secondary',
  'sole',
  'laces',
  'pattern',
  'pattern2',
] as const;
export type ColorSlot = (typeof COLOR_SLOTS)[number];

export const COLOR_SLOT_LABELS: Record<ColorSlot, string> = {
  buttons: 'Botones',
  stitching: 'Pespuntes (costuras)',
  zipper: 'Cremallera',
  hardware: 'Herrajes (remaches, ojales, hebillas)',
  trim: 'Ribetes (cuello, puños, cintura)',
  lining: 'Forro',
  secondary: 'Color secundario (paneles)',
  sole: 'Suela',
  laces: 'Cordones',
  pattern: 'Estampado: color 1',
  pattern2: 'Estampado: color 2',
};

export const METAL_FINISHES = ['silver', 'gold', 'gunmetal', 'brass', 'copper', 'black'] as const;
export const BUTTON_STYLES = ['four_hole', 'two_hole', 'shank', 'snap', 'toggle', 'covered'] as const;
export const STITCH_STYLES = ['single', 'double', 'none'] as const;
/**
 * Estampados de la tela (los dibuja el 3D sobre el color principal con los
 * colores `pattern` y `pattern2`).
 */
export const PATTERNS = ['solid', 'stripes', 'breton', 'pinstripe', 'gingham', 'check', 'tartan', 'retro'] as const;
export const PATTERN_SIZES = ['small', 'medium', 'large'] as const;

/**
 * Estampado configurable (`customization.pattern`), que sustituye a
 * `options.pattern` / `options.patternSize` (se siguen aceptando en prendas
 * antiguas). Lo dibuja el 3D (Frontend/src/lib/patterns.ts) sobre el color
 * de la prenda. Se permite en los tipos que tienen la opción `pattern`.
 */
export const PATTERN_KINDS = [
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
] as const;
export const PATTERN_TARGETS = ['main', 'secondary', 'all'] as const;

/** Rangos de cada ajuste del estampado (y su valor si no se da). */
export const PATTERN_RANGES = {
  /** Lo que mide una repetición, en metros. */
  size: { min: 0.005, max: 0.4, default: 0.03 },
  thickness: { min: 0.02, max: 0.98, default: 0.5 },
  /** Entero. */
  count: { min: 1, max: 6, default: 1 },
  /** Grados. */
  angle: { min: -180, max: 180, default: 0 },
  opacity: { min: 0.05, max: 1, default: 1 },
  softness: { min: 0, max: 1, default: 0 },
  offsetX: { min: 0, max: 1, default: 0 },
  offsetY: { min: 0, max: 1, default: 0 },
} as const;
export const PATTERN_MAX_COLORS = 4;

export const OPTION_LABELS = {
  metal: {
    label: 'Acabado del metal',
    values: { silver: 'Plata', gold: 'Dorado', gunmetal: 'Pavonado', brass: 'Latón', copper: 'Cobre', black: 'Negro mate' },
  },
  buttonStyle: {
    label: 'Tipo de botón',
    values: {
      four_hole: 'Cuatro agujeros',
      two_hole: 'Dos agujeros',
      shank: 'De pie (metálico)',
      snap: 'Automático (presión)',
      toggle: 'Trenca (alamar)',
      covered: 'Forrado de tela',
    },
  },
  stitchStyle: {
    label: 'Pespunte',
    values: { single: 'Sencillo', double: 'Doble', none: 'Sin pespunte visible' },
  },
  pattern: {
    label: 'Estampado',
    values: {
      solid: 'Liso',
      stripes: 'Rayas',
      breton: 'Marinera (rayas finas)',
      pinstripe: 'Raya diplomática (vertical)',
      gingham: 'Vichy (cuadro pequeño)',
      check: 'Cuadros (leñador)',
      tartan: 'Escocés (tartán)',
      retro: 'Bloques retro (años 80)',
    },
  },
  patternSize: {
    label: 'Tamaño del estampado',
    values: { small: 'Pequeño', medium: 'Mediano', large: 'Grande' },
  },
} as const;

export type OptionKey = keyof typeof OPTION_LABELS;

export interface PartOption {
  key: string;
  label: string;
  /** true/false = valor por defecto; null = depende del estilo o corte. */
  default: boolean | null;
}

export interface ModelCustomizationOptions {
  colors: ColorSlot[];
  parts: PartOption[];
  /** Qué opciones generales tienen sentido (tipo de botón, metal, pespunte, estampado). */
  options: OptionKey[];
}

const p = (key: string, label: string, def: boolean | null = false): PartOption => ({ key, label, default: def });

export const CUSTOMIZATION_BY_MODEL: Record<string, ModelCustomizationOptions> = {
  tshirt: {
    // secondary: mangas de la camiseta raglán
    colors: ['stitching', 'trim', 'buttons', 'secondary', 'pattern', 'pattern2'],
    parts: [p('chestPocket', 'Bolsillo de pecho'), p('rolledSleeves', 'Mangas vueltas'), p('sideSlits', 'Aberturas laterales'), p('hemLabel', 'Etiqueta en el bajo')],
    options: ['stitchStyle', 'buttonStyle', 'pattern', 'patternSize'],
  },
  top: {
    // secondary: espalda de satén del chaleco; trim: tira del halter y cordones del corsé; hardware: ojetes y broches del body
    colors: ['buttons', 'secondary', 'trim', 'hardware', 'stitching', 'pattern', 'pattern2'],
    parts: [],
    options: ['buttonStyle', 'pattern', 'patternSize'],
  },
  shirt: {
    // hardware: broches de la camisa vaquera
    colors: ['buttons', 'stitching', 'trim', 'hardware', 'pattern', 'pattern2'],
    parts: [
      p('chestPocket', 'Bolsillo de pecho', true),
      p('secondPocket', 'Segundo bolsillo de pecho'),
      p('pocketFlaps', 'Solapas en los bolsillos'),
      p('epaulettes', 'Hombreras (charreteras)'),
      p('rolledSleeves', 'Mangas remangadas'),
    ],
    options: ['buttonStyle', 'stitchStyle', 'pattern', 'patternSize'],
  },
  sweater: {
    // zipper: sudaderas con cremallera (completa, media o cuarto)
    colors: ['trim', 'buttons', 'hardware', 'zipper', 'pattern', 'pattern2'],
    parts: [p('ribHem', 'Canalé en el bajo', true), p('ribCuffs', 'Puños de canalé', true), p('elbowPatches', 'Coderas'), p('pockets', 'Bolsillos (cárdigan)')],
    options: ['buttonStyle', 'metal', 'pattern', 'patternSize'],
  },
  jacket: {
    colors: ['buttons', 'zipper', 'stitching', 'trim', 'lining', 'secondary', 'hardware', 'pattern', 'pattern2'],
    parts: [
      p('chestPockets', 'Bolsillos de pecho', null),
      p('hipPockets', 'Bolsillos delanteros', true),
      p('epaulettes', 'Hombreras (charreteras)'),
      p('belt', 'Cinturón'),
      p('hood', 'Capucha'),
      p('ribCuffs', 'Puños de canalé', null),
      p('sleevePocket', 'Bolsillo en la manga'),
    ],
    options: ['buttonStyle', 'metal', 'stitchStyle', 'pattern', 'patternSize'],
  },
  coat: {
    colors: ['buttons', 'zipper', 'stitching', 'trim', 'lining', 'hardware', 'pattern', 'pattern2'],
    parts: [
      p('belt', 'Cinturón', null),
      p('epaulettes', 'Hombreras (charreteras)', null),
      p('pockets', 'Bolsillos', true),
      p('stormFlap', 'Solapa de tormenta', null),
      p('cuffStraps', 'Trabillas en los puños', null),
    ],
    options: ['buttonStyle', 'metal', 'stitchStyle', 'pattern', 'patternSize'],
  },
  pants: {
    colors: ['buttons', 'zipper', 'stitching', 'hardware', 'trim', 'pattern', 'pattern2'],
    parts: [
      p('frontPockets', 'Bolsillos delanteros', true),
      p('backPockets', 'Bolsillos traseros', true),
      p('coinPocket', 'Bolsillo relojero', null),
      p('beltLoops', 'Trabillas', true),
      p('belt', 'Cinturón'),
      p('cargoPockets', 'Bolsillos cargo', null),
      p('turnUps', 'Bajos vueltos'),
      p('rivets', 'Remaches', null),
    ],
    options: ['buttonStyle', 'metal', 'stitchStyle', 'pattern', 'patternSize'],
  },
  shorts: {
    colors: ['buttons', 'zipper', 'stitching', 'hardware', 'trim', 'pattern', 'pattern2'],
    parts: [
      p('frontPockets', 'Bolsillos delanteros', true),
      p('backPockets', 'Bolsillos traseros', true),
      p('beltLoops', 'Trabillas', true),
      p('belt', 'Cinturón'),
      p('cargoPockets', 'Bolsillos cargo', null),
      p('turnUps', 'Bajos vueltos'),
    ],
    options: ['buttonStyle', 'metal', 'stitchStyle', 'pattern', 'patternSize'],
  },
  skirt: {
    colors: ['buttons', 'zipper', 'stitching', 'trim', 'lining', 'pattern', 'pattern2'],
    parts: [p('pockets', 'Bolsillos'), p('belt', 'Cinturón'), p('frontSlit', 'Abertura delantera'), p('buttonFront', 'Botones delanteros')],
    options: ['buttonStyle', 'metal', 'stitchStyle', 'pattern', 'patternSize'],
  },
  dress: {
    colors: ['buttons', 'zipper', 'stitching', 'trim', 'lining', 'pattern', 'pattern2'],
    parts: [p('belt', 'Cinturón', null), p('pockets', 'Bolsillos'), p('buttonFront', 'Botones delanteros', null)],
    options: ['buttonStyle', 'metal', 'stitchStyle', 'pattern', 'patternSize'],
  },
  sneakers: {
    colors: ['secondary', 'sole', 'laces', 'stitching', 'trim', 'hardware'],
    parts: [p('laces', 'Cordones', null), p('heelTab', 'Lengüeta del talón', true), p('toeCap', 'Puntera'), p('sidePanel', 'Panel lateral', true)],
    options: ['stitchStyle', 'metal', 'pattern', 'patternSize'],
  },
  boots: {
    colors: ['sole', 'laces', 'stitching', 'hardware', 'trim'],
    parts: [p('laces', 'Cordones', null), p('pullTab', 'Tirador', true), p('buckle', 'Hebilla'), p('elasticSides', 'Elástico lateral', null)],
    options: ['metal', 'stitchStyle', 'pattern', 'patternSize'],
  },
  underwear: {
    colors: ['trim', 'stitching'],
    parts: [],
    options: ['stitchStyle', 'pattern', 'patternSize'],
  },
  scarf: {
    colors: ['trim', 'pattern', 'pattern2'],
    parts: [p('fringe', 'Flecos', true)],
    options: ['pattern', 'patternSize'],
  },
  cap: {
    colors: ['secondary', 'buttons', 'stitching', 'hardware'],
    parts: [p('topButton', 'Botón superior', true), p('eyelets', 'Ojetes de ventilación', true), p('backStrap', 'Cierre trasero', true)],
    options: ['stitchStyle', 'metal', 'pattern', 'patternSize'],
  },
  beanie: {
    colors: ['trim'],
    parts: [p('label', 'Etiqueta', true)],
    options: ['pattern', 'patternSize'],
  },
};

// ---------------------------------------------------------------------------
// Detalles colocados a mano sobre la prenda
// ---------------------------------------------------------------------------

export const DETAIL_KINDS = [
  'patch',
  'embroidery',
  'print',
  'label',
  'button',
  'rivet',
  'stud',
  'pin',
  'pocket',
  'zipper',
  'drawing',
] as const;
export type DetailKind = (typeof DETAIL_KINDS)[number];

export const DETAIL_KIND_LABELS: Record<DetailKind, string> = {
  patch: 'Parche',
  embroidery: 'Bordado',
  print: 'Estampado',
  label: 'Etiqueta',
  button: 'Botón',
  rivet: 'Remache',
  stud: 'Tachuela',
  pin: 'Chapa',
  pocket: 'Bolsillo de parche',
  zipper: 'Cremallera decorativa',
  drawing: 'Dibujo',
};

/** Detalles que pueden llevar texto o imagen. */
export const DETAILS_WITH_GRAPHIC: readonly DetailKind[] = ['patch', 'embroidery', 'print', 'label', 'pin', 'drawing'];

/**
 * Dibujo a mano alzada sobre la prenda: la imagen (PNG transparente, guardada
 * como asset) se proyecta desde el punto de vista en que se dibujó. Solo
 * imagen, sin texto, y puede ser más grande que el resto de detalles.
 */
export const IMAGE_ONLY_DETAILS: readonly DetailKind[] = ['drawing'];

/** `cutout`: parche recortado con la silueta de la imagen o del texto, sin fondo ni ribete. */
export const DETAIL_SHAPES = ['rect', 'rounded', 'circle', 'oval', 'shield', 'cutout'] as const;
export const DETAIL_FONTS = ['sans', 'serif', 'script', 'mono', 'college'] as const;

export const LIMITS = {
  maxDetails: 30,
  maxText: 40,
  minSize: 0.005,
  maxSize: 0.5,
  /** Lado mayor de un dibujo (puede cubrir media prenda). */
  maxDrawingSize: 1.0,
  maxCoord: 2.5,
} as const;

/** Opciones para un modelKey (o un conjunto vacío si es desconocido). */
export function optionsFor(modelKey: string): ModelCustomizationOptions {
  return CUSTOMIZATION_BY_MODEL[modelKey] ?? { colors: ['stitching'], parts: [], options: [] };
}
