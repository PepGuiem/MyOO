/**
 * Medidas de un maniquí personalizado (cm). Los mismos límites usa el frontend
 * (Frontend/src/three/bodyMeasures.ts, MEASURE_LIMITS): fuera de ellos el
 * maniquí 3D se deformaría demasiado y la ropa dejaría de encajar.
 */
export const MANNEQUIN_SEXES = ['male', 'female'] as const;
export type MannequinSex = (typeof MANNEQUIN_SEXES)[number];

export const MEASURE_RANGES = {
  heightCm: { min: 140, max: 210 },
  shoulderCm: { min: 30, max: 56 },
  chestCm: { min: 65, max: 150 },
  waistCm: { min: 45, max: 150 },
  hipCm: { min: 65, max: 160 },
  armCm: { min: 18, max: 45 },
} as const;

export type MeasureKey = keyof typeof MEASURE_RANGES;
export type MannequinMeasures = Record<MeasureKey, number>;

/** Redondea a medio centímetro (la cinta métrica no da más precisión). */
export function normalizeMeasures(m: MannequinMeasures): MannequinMeasures {
  const out = {} as MannequinMeasures;
  for (const key of Object.keys(MEASURE_RANGES) as MeasureKey[]) {
    out[key] = Math.round(m[key] * 2) / 2;
  }
  return out;
}
