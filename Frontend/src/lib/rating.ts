import type { IconName } from '../components/Icon';
import type { RatingCategory, RatingTier, RatingTrigger } from '../api/types';

/** Niveles de OUTFIT RATING (mismos tramos que el backend). */
export const TIERS: { key: RatingTier; label: string; min: number; max: number; color: string; ink: string }[] = [
  { key: 'BEGINNER', label: 'Beginner', min: 0, max: 39, color: '#8d8a85', ink: '#0c0b0c' },
  { key: 'CASUAL', label: 'Casual', min: 40, max: 59, color: '#f2efe8', ink: '#0c0b0c' },
  { key: 'GOOD_STYLE', label: 'Good Style', min: 60, max: 79, color: '#c6ff2e', ink: '#0d1204' },
  { key: 'FASHION_KILLER', label: 'Fashion Killer', min: 80, max: 94, color: '#ff2d4a', ink: '#ffffff' },
  { key: 'STREETWEAR_LEGEND', label: 'Streetwear Legend', min: 95, max: 100, color: '#ffb020', ink: '#150f03' },
];

export const TIER_BY_KEY = Object.fromEntries(TIERS.map((t) => [t.key, t])) as Record<RatingTier, (typeof TIERS)[number]>;

export function tierOf(score: number): (typeof TIERS)[number] {
  return TIERS.find((t) => score >= t.min && score <= t.max) ?? TIERS[0];
}

export const CATEGORIES: { key: RatingCategory; label: string; icon: IconName }[] = [
  { key: 'colors', label: 'Combinación de colores', icon: 'palette' },
  { key: 'style', label: 'Coherencia del estilo', icon: 'target' },
  { key: 'balance', label: 'Equilibrio de prendas', icon: 'scale' },
  { key: 'details', label: 'Accesorios y detalles', icon: 'gem' },
];

export const TRIGGER_LABEL: Record<RatingTrigger, string> = {
  CREATE: 'Al crearlo',
  UPDATE: 'Al editarlo',
  MANUAL: 'Recalculada',
  BACKFILL: 'Primera nota',
};

/** Color de una barra según lo llena que esté. */
export function barTone(score: number, max = 25): 'high' | 'mid' | 'low' {
  const r = score / max;
  return r >= 0.8 ? 'high' : r >= 0.5 ? 'mid' : 'low';
}
