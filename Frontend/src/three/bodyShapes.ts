/**
 * Siluetas del maniquí (medidas sin geometría). Van aparte de body.ts para que
 * el arranque de la web (lib/bodyPref.tsx) las use sin descargar three.js;
 * body.ts las vuelve a exportar, así que se pueden seguir importando de allí.
 */
import { t } from '../i18n';

export interface BodyShape {
  id: string;
  label: string;
  /** Escala vertical (1 = unos 1,75 m). */
  height: number;
  /** Semi-anchura a la altura de los hombros. */
  shoulder: number;
  /** Semi-anchura del torso en pecho, cintura y cadera. */
  chest: number;
  waist: number;
  hip: number;
  /** Profundidad del torso respecto a su anchura. */
  depth: number;
  /** Grosor de brazos y piernas (1 = medio). */
  limb: number;
  /** Volumen de pecho, vientre y glúteos (1 = medio). */
  bust: number;
  belly: number;
  glutes: number;
  /** Maniquí masculino o femenino (cuerpo y cabeza esculpidos distintos). */
  sex: 'male' | 'female';
}

export const BODY_SHAPES: BodyShape[] = [
  { id: 'standard', label: t('Estándar##cuerpo'), height: 1, shoulder: 0.21, chest: 0.163, waist: 0.14, hip: 0.161, depth: 0.68, limb: 1.04, bust: 1, belly: 1, glutes: 0.96, sex: 'male' },
  { id: 'slim', label: t('Delgado##cuerpo'), height: 1.01, shoulder: 0.182, chest: 0.135, waist: 0.112, hip: 0.14, depth: 0.66, limb: 0.82, bust: 0.94, belly: 0.88, glutes: 0.94, sex: 'male' },
  { id: 'broad', label: t('Corpulento##cuerpo'), height: 1, shoulder: 0.228, chest: 0.205, waist: 0.212, hip: 0.215, depth: 0.82, limb: 1.32, bust: 1.04, belly: 1.32, glutes: 1.08, sex: 'male' },
  { id: 'tall', label: t('Alto##cuerpo'), height: 1.12, shoulder: 0.206, chest: 0.16, waist: 0.136, hip: 0.166, depth: 0.68, limb: 1.03, bust: 1, belly: 1, glutes: 1, sex: 'male' },
  { id: 'short', label: t('Bajo##cuerpo'), height: 0.87, shoulder: 0.19, chest: 0.155, waist: 0.134, hip: 0.163, depth: 0.7, limb: 0.97, bust: 1, belly: 1, glutes: 1, sex: 'male' },
  { id: 'athletic', label: t('Atlético##cuerpo'), height: 1.02, shoulder: 0.236, chest: 0.186, waist: 0.136, hip: 0.158, depth: 0.72, limb: 1.16, bust: 1.1, belly: 0.86, glutes: 1.06, sex: 'male' },

  // Siluetas femeninas: maniquí femenino (cuerpo_f/cabeza_f). La ropa se ajusta igual.
  { id: 'woman', label: t('Estándar##cuerpo'), height: 0.95, shoulder: 0.183, chest: 0.15, waist: 0.117, hip: 0.172, depth: 0.7, limb: 0.86, bust: 1.16, belly: 0.92, glutes: 1.14, sex: 'female' },
  { id: 'woman_slim', label: t('Delgada##cuerpo'), height: 0.96, shoulder: 0.172, chest: 0.136, waist: 0.104, hip: 0.156, depth: 0.68, limb: 0.76, bust: 1.08, belly: 0.86, glutes: 1.06, sex: 'female' },
  { id: 'woman_tall', label: t('Alta##cuerpo'), height: 1.04, shoulder: 0.186, chest: 0.15, waist: 0.118, hip: 0.172, depth: 0.7, limb: 0.87, bust: 1.14, belly: 0.92, glutes: 1.12, sex: 'female' },
  { id: 'woman_short', label: t('Baja##cuerpo'), height: 0.86, shoulder: 0.178, chest: 0.148, waist: 0.118, hip: 0.17, depth: 0.71, limb: 0.86, bust: 1.16, belly: 0.94, glutes: 1.14, sex: 'female' },
  { id: 'curvy', label: t('Curvilínea##cuerpo'), height: 0.95, shoulder: 0.186, chest: 0.164, waist: 0.128, hip: 0.206, depth: 0.74, limb: 1.0, bust: 1.26, belly: 0.98, glutes: 1.26, sex: 'female' },
];

export const DEFAULT_BODY = BODY_SHAPES[0];

export function findBodyShape(id: string | null | undefined): BodyShape {
  return BODY_SHAPES.find((b) => b.id === id) ?? DEFAULT_BODY;
}
