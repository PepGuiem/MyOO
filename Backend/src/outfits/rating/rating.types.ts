/**
 * Tipos del sistema de puntuación de outfits (OUTFIT RATING).
 *
 * El cálculo lo hace un «motor» intercambiable (`RatingEngine`): hoy hay uno
 * de reglas propias (`RulesRatingEngine`). Un motor de IA futuro solo tiene
 * que devolver el mismo `RatingResult` (por ejemplo, partiendo del resultado
 * de las reglas y reescribiendo los comentarios) y registrarse con el token
 * `OUTFIT_RATING_ENGINE` en `outfits.module.ts`.
 */
import type { EngineItem, SeasonKey } from '../../stylist/engine';

export type RatingCategory = 'colors' | 'style' | 'balance' | 'details';
export const RATING_CATEGORIES: RatingCategory[] = [
  'colors',
  'style',
  'balance',
  'details',
];
/** Puntos máximos de cada categoría (4 × 25 = 100). */
export const CATEGORY_MAX = 25;

/** Mismos valores que el enum OutfitStyle de Prisma (aquí sin depender del cliente). */
export type OutfitStyleKey =
  | 'STREETWEAR'
  | 'TECHWEAR'
  | 'OLD_MONEY'
  | 'CASUAL'
  | 'SKATE'
  | 'GRUNGE'
  | 'Y2K'
  | 'MINIMAL'
  | 'TRAP'
  | 'LUXURY_STREETWEAR';

export type RatingTierKey =
  'BEGINNER' | 'CASUAL' | 'GOOD_STYLE' | 'FASHION_KILLER' | 'STREETWEAR_LEGEND';

/** Rangos de cada nivel (incluidos). */
export const TIERS: { key: RatingTierKey; label: string; min: number }[] = [
  { key: 'STREETWEAR_LEGEND', label: 'Streetwear Legend', min: 95 },
  { key: 'FASHION_KILLER', label: 'Fashion Killer', min: 80 },
  { key: 'GOOD_STYLE', label: 'Good Style', min: 60 },
  { key: 'CASUAL', label: 'Casual', min: 40 },
  { key: 'BEGINNER', label: 'Beginner', min: 0 },
];

export function tierFor(total: number): RatingTierKey {
  return (TIERS.find((t) => total >= t.min) ?? TIERS[TIERS.length - 1]).key;
}

/** Una prenda tal y como la ve el motor: la del estilista más cómo se lleva. */
export interface RatingItem extends EngineItem {
  /** Cómo se lleva en el outfit (por dentro, remangada...). */
  styling: Record<string, string>;
  /** Colores de piezas personalizadas (cremallera, costuras, cordones...). */
  detailColors: string[];
  /** Detalles colocados en la prenda (parches, bordados, textos). */
  details: number;
}

export interface RatingInput {
  items: RatingItem[];
  style?: OutfitStyleKey | null;
  /** Ocasión libre que escribe el usuario («Fiesta», «Curro»...). */
  occasion?: string | null;
  season?: SeasonKey | null;
}

/** Una regla que se ha cumplido (puntos > 0), que resta (< 0) o informativa (0). */
export interface RatingCheck {
  code: string;
  points: number;
  text: string;
  /** Prendas a las que se refiere (para resaltarlas). */
  itemIds?: string[];
}

export interface CategoryResult {
  score: number;
  max: number;
  checks: RatingCheck[];
}

export type RatingTipAction =
  | { type: 'add'; itemId: string }
  | { type: 'swap'; fromItemId: string; toItemId: string }
  | { type: 'remove'; itemId: string }
  | { type: 'style'; style: OutfitStyleKey };

export interface RatingTip {
  code: string;
  text: string;
  /** Puntos que se ganan al aplicarlo (calculados con el propio motor). */
  gain?: number;
  action?: RatingTipAction;
}

export interface RatingBadge {
  code: string;
  label: string;
}

export interface RatingResult {
  /** Versión del formato del resultado (se guarda en el historial). */
  version: 1;
  /** Motor que lo calculó: «rules@1», y en el futuro p. ej. «ai@1». */
  engine: string;
  total: number;
  tier: RatingTierKey;
  categories: Record<RatingCategory, CategoryResult>;
  /** Comentarios sobre el outfit (en castellano). */
  comments: string[];
  /** Consejos para mejorarlo, los concretos con los puntos que suman. */
  tips: RatingTip[];
  badges: RatingBadge[];
  palette: { color: string; name: string }[];
  /** Estilo que mejor encaja (sirve para sugerir marcarlo). */
  detectedStyle: OutfitStyleKey | null;
}

/**
 * Un motor de puntuación. `pool` son las demás prendas del usuario: con ellas
 * se proponen cambios concretos («añade estas zapatillas: +6»).
 */
export interface RatingEngine {
  readonly id: string;
  rate(
    input: RatingInput,
    pool?: RatingItem[],
  ): RatingResult | Promise<RatingResult>;
}

/** Token de inyección del motor activo. */
export const OUTFIT_RATING_ENGINE = Symbol('OUTFIT_RATING_ENGINE');
