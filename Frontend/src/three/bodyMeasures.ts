/**
 * Maniquí a partir de medidas reales (cm) y al revés.
 *
 * El maniquí se dibuja con una silueta paramétrica (`BodyShape`: semianchos en
 * metros, profundidad, grosor de brazos...). Aquí se traducen las medidas de una
 * cinta métrica (altura, contorno de pecho, cintura y cadera, ancho de hombros y
 * contorno del brazo) a esa silueta, ajustando los contornos de las secciones del
 * torso hasta que miden lo pedido.
 *
 * El maniquí esculpido queda 9 mm por dentro de la superficie de referencia (para
 * que la ropa ceñida no lo atraviese), así que el contorno que se ve es 2π·9 mm
 * menor que el de la sección: se compensa para que el maniquí mida lo que dice.
 */
import { BODY_SHAPES, makeBody, type Body, type BodyShape } from './body';

export type Sex = BodyShape['sex'];

export interface Measures {
  heightCm: number;
  shoulderCm: number;
  chestCm: number;
  waistCm: number;
  hipCm: number;
  armCm: number;
}

export type MeasureKey = keyof Measures;

/** Límites (los mismos que valida el backend en mannequin-measures.ts). */
export const MEASURE_LIMITS: Record<MeasureKey, { min: number; max: number; label: string; hint: string }> = {
  heightCm: { min: 140, max: 210, label: 'Altura', hint: 'De pies a cabeza, descalzo' },
  shoulderCm: { min: 30, max: 56, label: 'Hombros', hint: 'Ancho de hombro a hombro, por detrás' },
  chestCm: { min: 65, max: 150, label: 'Pecho', hint: 'Contorno por la parte más ancha' },
  waistCm: { min: 45, max: 150, label: 'Cintura', hint: 'Contorno por la parte más estrecha' },
  hipCm: { min: 65, max: 160, label: 'Cadera', hint: 'Contorno por la parte más ancha de los glúteos' },
  armCm: { min: 18, max: 45, label: 'Brazo', hint: 'Contorno del brazo, a media altura' },
};

export const MEASURE_KEYS = Object.keys(MEASURE_LIMITS) as MeasureKey[];

/** Lo que el maniquí esculpido queda por dentro de la sección (m), ver arriba. */
const INSET = 0.009;
const INSET_CIRC = 2 * Math.PI * INSET;
/** Contorno del brazo con grosor 1 (radio 4,5 cm a media altura del brazo). */
const ARM_CIRC_PER_LIMB = 2 * Math.PI * 0.045;

const BASE: Record<Sex, BodyShape> = {
  male: BODY_SHAPES.find((b) => b.id === 'standard')!,
  female: BODY_SHAPES.find((b) => b.id === 'woman')!,
};

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const round = (v: number, step = 0.5) => Math.round(v / step) * step;

/** Perímetro de la sección del torso a la altura y (m). */
function perimeter(body: Body, y: number): number {
  const N = 96;
  const sec = body.section(y);
  let L = 0;
  let prev = body.surface(y, 0, 0, sec);
  for (let i = 1; i <= N; i++) {
    const p = body.surface(y, (i / N) * Math.PI * 2, 0, sec);
    L += Math.hypot(p[0] - prev[0], p[2] - prev[2]);
    prev = p;
  }
  return L;
}

/** Contornos que se ven en el maniquí (m), ya sin el margen interior. */
function circumferences(body: Body): { chest: number; waist: number; hip: number } {
  const { y } = body;
  let hip = 0;
  for (let i = 0; i <= 8; i++) hip = Math.max(hip, perimeter(body, y.crotch + ((y.waist - y.crotch) * i) / 8 * 0.7));
  return {
    chest: perimeter(body, y.chest) - INSET_CIRC,
    waist: perimeter(body, y.waist) - INSET_CIRC,
    hip: hip - INSET_CIRC,
  };
}

/** Altura total (m) para una escala vertical s (ver makeBody: coronilla). */
const crownFor = (s: number) => s * (1.49 + 0.052) + 0.235 * (0.94 + 0.06 * s);
const scaleFor = (heightM: number) => (heightM - 0.235 * 0.94) / (1.49 + 0.052 + 0.235 * 0.06);

/**
 * Id estable para una silueta calculada: makeBody guarda en caché por id, así
 * que dos siluetas con las mismas medidas comparten el cuerpo ya calculado. El
 * prefijo «~» hace que la caché las trate como temporales (se descartan las más
 * antiguas mientras se mueven los deslizadores).
 */
function measuresKey(sex: Sex, m: Measures): string {
  return `~${sex}:${MEASURE_KEYS.map((k) => round(m[k]).toFixed(1)).join(',')}`;
}

/** Silueta del maniquí con estas medidas. */
export function shapeFromMeasures(sex: Sex, raw: Measures, id?: string, label = 'Personalizado'): BodyShape {
  const m = clampMeasures(raw);
  const base = BASE[sex];
  const wh = m.waistCm / m.hipCm;
  const wh0 = sex === 'male' ? 0.9 : 0.74;
  // Con más cintura respecto a la cadera, más vientre y más fondo de torso.
  const belly = clamp(base.belly + 2.4 * (wh - wh0), 0.84, 1.4);
  const depth = clamp(base.depth + 0.35 * Math.max(0, wh - wh0), 0.62, 0.86);
  const shape: BodyShape = {
    ...base,
    id: id ?? measuresKey(sex, m),
    label,
    height: scaleFor(m.heightCm / 100),
    shoulder: m.shoulderCm / 200,
    limb: clamp(m.armCm / 100 / ARM_CIRC_PER_LIMB, 0.68, 1.5),
    belly,
    depth,
  };
  // Los semianchos de pecho, cintura y cadera se ajustan hasta que los
  // contornos miden lo pedido (casi proporcionales: converge en 3-4 pasos).
  const target = { chest: m.chestCm / 100, waist: m.waistCm / 100, hip: m.hipCm / 100 };
  let work = { ...shape, id: `~~fit:${shape.id}` };
  for (let it = 0; it < 4; it++) {
    const c = circumferences(makeBody({ ...work, id: `${work.id}:${it}` }));
    work = {
      ...work,
      chest: clamp(work.chest * (target.chest / c.chest), 0.1, 0.3),
      waist: clamp(work.waist * (target.waist / c.waist), 0.08, 0.3),
      hip: clamp(work.hip * (target.hip / c.hip), 0.1, 0.32),
    };
  }
  return { ...shape, chest: work.chest, waist: work.waist, hip: work.hip };
}

/** Medidas (cm) de una silueta: para partir de un maniquí genérico. */
export function measuresFromShape(shape: BodyShape): Measures {
  const body = makeBody(shape);
  const c = circumferences(body);
  return {
    heightCm: round(crownFor(shape.height) * 100),
    shoulderCm: round(shape.shoulder * 200),
    chestCm: round(c.chest * 100),
    waistCm: round(c.waist * 100),
    hipCm: round(c.hip * 100),
    armCm: round(shape.limb * ARM_CIRC_PER_LIMB * 100),
  };
}

/** Medidas medidas sobre un cuerpo ya calculado (para comprobar el ajuste). */
export function measureBody(body: Body): Pick<Measures, 'chestCm' | 'waistCm' | 'hipCm'> {
  const c = circumferences(body);
  return { chestCm: c.chest * 100, waistCm: c.waist * 100, hipCm: c.hip * 100 };
}

export function clampMeasures(m: Measures): Measures {
  const out = { ...m };
  for (const k of MEASURE_KEYS) {
    const v = Number(m[k]);
    out[k] = clamp(Number.isFinite(v) ? v : MEASURE_LIMITS[k].min, MEASURE_LIMITS[k].min, MEASURE_LIMITS[k].max);
  }
  return out;
}

/** Medidas por defecto para un maniquí nuevo: una talla media de adulto. */
export function defaultMeasures(sex: Sex): Measures {
  return sex === 'male'
    ? { heightCm: 178, shoulderCm: 44, chestCm: 98, waistCm: 84, hipCm: 97, armCm: 30 }
    : { heightCm: 165, shoulderCm: 38, chestCm: 90, waistCm: 72, hipCm: 98, armCm: 27 };
}
