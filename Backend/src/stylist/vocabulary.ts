/**
 * Vocabulario del estilista: estilos, ocasiones, tiempo y dónde se compró una
 * prenda. Las claves son ESTABLES (se guardan en la base de datos y las usa el
 * frontend): se pueden añadir, pero no renombrar ni borrar.
 */

/** Estilos de una prenda (WardrobeItem.styles) y de los outfits que se piden. */
export const STYLE_TAGS = {
  casual: 'Casual',
  streetwear: 'Streetwear',
  minimalist: 'Minimalista',
  old_money: 'Old money',
  formal: 'Formal',
  sporty: 'Deportivo',
  vintage: 'Vintage',
  elegant: 'Elegante',
  y2k: 'Y2K',
  smart_casual: 'Smart casual',
} as const;
export type StyleTag = keyof typeof STYLE_TAGS;
export const STYLE_TAG_KEYS = Object.keys(STYLE_TAGS) as StyleTag[];
export const MAX_STYLES_PER_ITEM = 4;

/** Ocasiones: cuánto de arreglado (0 = muy informal, 1 = etiqueta) y qué estilos encajan. */
export const OCCASIONS = {
  everyday: { label: 'Día a día', formality: 0.3, styles: ['casual', 'streetwear', 'minimalist'] },
  work: { label: 'Trabajo', formality: 0.62, styles: ['smart_casual', 'minimalist', 'formal', 'old_money'] },
  university: { label: 'Universidad', formality: 0.28, styles: ['casual', 'streetwear', 'sporty', 'vintage'] },
  date: { label: 'Cita', formality: 0.5, styles: ['smart_casual', 'elegant', 'minimalist', 'old_money'] },
  party: { label: 'Fiesta', formality: 0.48, styles: ['streetwear', 'y2k', 'elegant', 'vintage'] },
  vacation: { label: 'Vacaciones', formality: 0.22, styles: ['casual', 'minimalist', 'sporty'] },
  sport: { label: 'Deporte', formality: 0.1, styles: ['sporty'] },
  formal_event: { label: 'Evento formal', formality: 0.85, styles: ['formal', 'elegant', 'old_money'] },
} as const satisfies Record<string, { label: string; formality: number; styles: readonly StyleTag[] }>;
export type Occasion = keyof typeof OCCASIONS;
export const OCCASION_KEYS = Object.keys(OCCASIONS) as Occasion[];

/** Formalidad típica de cada estilo (cuando se pide un estilo sin ocasión). */
export const STYLE_FORMALITY: Record<StyleTag, number> = {
  casual: 0.3,
  streetwear: 0.25,
  minimalist: 0.45,
  old_money: 0.65,
  formal: 0.85,
  sporty: 0.12,
  vintage: 0.4,
  elegant: 0.72,
  y2k: 0.3,
  smart_casual: 0.55,
};

/** Tiempo que hace (lo elige el usuario; no se consulta ningún servicio externo). */
export const WEATHER = {
  cold: { label: 'Frío (menos de 10 °C)' },
  cool: { label: 'Fresco (10–17 °C)' },
  mild: { label: 'Templado (17–24 °C)' },
  hot: { label: 'Calor (más de 24 °C)' },
} as const;
export type Weather = keyof typeof WEATHER;
export const WEATHER_KEYS = Object.keys(WEATHER) as Weather[];

/** Dónde se compró una prenda (WardrobeItem.purchasePlatform). */
export const PURCHASE_PLATFORMS = {
  store: 'Tienda física',
  online: 'Tienda online',
  marketplace: 'Marketplace',
  second_hand: 'Segunda mano',
  gift: 'Regalo',
  other: 'Otro',
} as const;
export type PurchasePlatform = keyof typeof PURCHASE_PLATFORMS;
export const PURCHASE_PLATFORM_KEYS = Object.keys(PURCHASE_PLATFORMS) as PurchasePlatform[];

/** Señales con las que aprende el estilista (StylistFeedback.signal). */
export const SIGNAL_WEIGHTS = {
  LIKE: 1,
  SAVE: 2,
  WEAR: 2,
  DISLIKE: -2,
  ACCEPT_TIP: 0.5,
  REJECT_TIP: -0.5,
  SWAP: -0.5,
} as const;
