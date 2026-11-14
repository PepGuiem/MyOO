/**
 * Modelo de cuerpo paramétrico.
 *
 * Un cuerpo se describe con unas pocas medidas (BodyShape). A partir de ellas
 * calculamos alturas de referencia (cadera, cintura, hombros...), la SECCIÓN
 * del torso a cada altura (anchura, profundidad delantera y trasera) y las
 * curvas de brazos y piernas. Tanto el maniquí como TODAS las prendas se
 * generan con estas mismas funciones, así que la ropa se adapta a cada silueta.
 *
 * Unidades: aproximadamente metros. Pies en y = 0, el cuerpo mira hacia +Z,
 * θ = 0 es el costado derecho y θ = π/2 el frente.
 */
import * as THREE from 'three';
import { paramSurface, smoothstep, spow, tubeAlong, TEX_DENSITY, type P3 } from './surface';
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

/** Sección del torso: semi-anchura y profundidad hacia delante y hacia atrás. */
export interface Section {
  rx: number;
  rzf: number;
  rzb: number;
}

/** Brazo o pierna: curva del eje y radio a lo largo (t de 0 a 1). */
export interface Limb {
  curve: THREE.CatmullRomCurve3;
  radius: (t: number) => number;
  side: 1 | -1;
}

/** Pie: sistema de coordenadas local (x lateral, z hacia la punta). */
export interface Foot {
  origin: THREE.Vector3;
  angle: number;
  length: number;
  side: 1 | -1;
  /** Semi-anchura y altura del pie a lo largo (s de 0 = talón a 1 = punta). */
  width: (s: number) => number;
  height: (s: number) => number;
  /** Pasa de coordenadas del pie a coordenadas del mundo. */
  toWorld: (x: number, y: number, z: number) => THREE.Vector3;
}

export interface Body {
  shape: BodyShape;
  s: number;
  limb: number;
  y: {
    ankle: number;
    knee: number;
    crotch: number;
    hip: number;
    waist: number;
    chest: number;
    shoulder: number;
    neck: number;
    chin: number;
    crown: number;
  };
  neckR: number;
  /** Semi-anchura del torso a la altura y (atajo de section(y).rx). */
  torso: (y: number) => number;
  section: (y: number) => Section;
  /** Punto de la superficie del torso a la altura y, ángulo θ y holgura e. */
  surface: (y: number, theta: number, e: number, sec?: Section) => P3;
  /** Punto de la cabeza: u de 0 (barbilla) a 1 (coronilla). */
  headPoint: (u: number, theta: number, e: number) => P3;
  arms: [Limb, Limb];
  legs: [Limb, Limb];
  feet: [Foot, Foot];
  kneeT: number;
  elbowT: number;
  /** Separación extra de los brazos (rad), ver makeBody. */
  armSpread: number;
}

/**
 * Interpolación cúbica monótona (Fritsch–Carlson): pasa por todos los puntos
 * sin "pasarse" entre ellos, así el contorno queda suave y sin bultos raros.
 */
export function monotone(points: [number, number][]): (x: number) => number {
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    );
  };
}

/** Exponente de la superelipse del torso (2 = óvalo; más = más "cuadrado"). */
const TORSO_N = 2.35;

const cache = new Map<string, Body>();
/**
 * Siluetas temporales (id con «~», p. ej. mientras se mueven los deslizadores de
 * medidas): solo se guardan las últimas. Con «~~» no se guardan nunca.
 */
const VOLATILE_MAX = 16;
const volatileKeys: string[] = [];

/**
 * Calcula (y guarda en caché) el cuerpo para una silueta. `armSpread` (rad)
 * separa un poco más los brazos del cuerpo: en los outfits, para que las
 * mangas caigan por fuera del pantalón (sobre todo con la parte de arriba
 * metida por dentro).
 */
export function makeBody(shape: BodyShape = DEFAULT_BODY, armSpread = 0): Body {
  const key = armSpread ? `${shape.id}|${armSpread}` : shape.id;
  const cached = cache.get(key);
  if (cached) return cached;

  const s = shape.height;
  const limb = shape.limb;
  const d = shape.depth;
  const neckR = 0.056 * (0.85 + 0.15 * limb);
  const y = {
    ankle: 0.08 * s,
    knee: 0.49 * s,
    crotch: 0.83 * s,
    hip: 0.92 * s,
    waist: 1.06 * s,
    chest: 1.27 * s,
    shoulder: 1.42 * s,
    neck: 1.49 * s,
    chin: 0,
    crown: 0,
  };
  const headH = 0.235 * (0.94 + 0.06 * s);
  // Cuello visible entre los hombros y la mandíbula (como un maniquí de escaparate)
  y.chin = y.neck + 0.052 * s;
  y.crown = y.chin + headH;

  // --- Torso: anchura y profundidades a cada altura -----------------------
  const rx = monotone([
    [y.crotch - 0.03 * s, shape.hip * 0.84],
    [y.hip, shape.hip],
    [y.waist, shape.waist],
    [y.chest, shape.chest],
    [y.shoulder - 0.05 * s, Math.max(shape.chest * 1.02, shape.shoulder * 0.92)],
    [y.shoulder, shape.shoulder * 0.84],
    [y.shoulder + 0.035 * s, neckR * 2.1],
    [y.neck, neckR],
  ]);
  const rzf = monotone([
    [y.crotch - 0.03 * s, shape.hip * d * 0.62],
    [y.hip, shape.hip * d * 0.86],
    [y.waist, shape.waist * d * 0.96 * shape.belly],
    [y.waist + (y.chest - y.waist) * 0.45, Math.max(shape.waist * d * 0.95 * shape.belly, shape.chest * d * 0.9)],
    [y.chest, shape.chest * d * 1.06 * shape.bust],
    [y.shoulder - 0.05 * s, shape.chest * d * 0.86],
    [y.shoulder, shape.shoulder * d * 0.56],
    [y.shoulder + 0.035 * s, neckR * 1.3],
    [y.neck, neckR * 0.95],
  ]);
  // En el cuerpo femenino el glúteo baja más (hasta la entrepierna): sin este
  // punto el pantalón o la falda procedurales quedaban por dentro del
  // maniquí esculpido en el pliegue del glúteo.
  const gluteFold: [number, number][] =
    shape.sex === 'female' ? [[y.crotch + 0.012 * s, shape.hip * d * 1.06 * shape.glutes]] : [];
  const rzb = monotone([
    [y.crotch - 0.03 * s, shape.hip * d * 0.92],
    ...gluteFold,
    [y.hip - 0.03 * s, shape.hip * d * 1.12 * shape.glutes],
    [y.waist, shape.waist * d * 0.82],
    [y.chest, shape.chest * d * 0.92],
    [y.shoulder - 0.05 * s, shape.chest * d * 0.9],
    [y.shoulder, shape.shoulder * d * 0.6],
    [y.shoulder + 0.035 * s, neckR * 1.5],
    [y.neck, neckR * 1.05],
  ]);
  const section = (py: number): Section => ({ rx: rx(py), rzf: rzf(py), rzb: rzb(py) });
  const surface = (py: number, theta: number, e: number, sec = section(py)): P3 => {
    const c = Math.cos(theta);
    const sn = Math.sin(theta);
    const k = 2 / TORSO_N;
    return [(sec.rx + e) * spow(c, k), py, (sn >= 0 ? sec.rzf + e : sec.rzb + e) * spow(sn, k)];
  };

  // --- Cabeza: óvalo "en huevo" con mandíbula, barbilla y cráneo -----------
  const hs = headH / 0.235;
  // Óvalo base (elipse vertical) modulado: mandíbula y barbilla más
  // estrechas abajo, cráneo más amplio arriba y detrás.
  const jaw = monotone([[0, 0.68], [0.3, 0.84], [0.55, 0.97], [0.75, 1], [1, 0.96]]);
  const chinFwd = monotone([[0, 0.92], [0.25, 0.86], [0.5, 0.97], [0.75, 0.93], [1, 0.88]]);
  const skull = monotone([[0, 0.5], [0.3, 0.74], [0.6, 1.04], [0.8, 1.06], [1, 0.98]]);
  const headPoint = (u: number, theta: number, e: number): P3 => {
    const env = Math.sqrt(Math.max(0, 1 - Math.pow(2 * u - 1, 2)));
    const c = Math.cos(theta);
    const sn = Math.sin(theta);
    const depth = sn >= 0 ? 0.094 * chinFwd(u) : 0.1 * skull(u);
    // La cabeza se inclina un poco hacia delante
    const zOff = 0.014 + 0.01 * u;
    return [
      (0.077 * hs * env * jaw(u) + e * env) * c,
      y.chin + u * headH,
      zOff + (depth * hs * env + e * env) * sn,
    ];
  };

  // --- Brazos: hombro -> codo (algo doblado) -> muñeca --------------------
  const widest = Math.max(shape.waist, shape.hip) * (0.85 + 0.15 * shape.belly);
  const angle = 0.11 + Math.max(0, widest - shape.shoulder * 0.75) * 2.2 + armSpread;
  const upperLen = 0.3 * s;
  const foreLen = 0.27 * s;
  const elbowT = upperLen / (upperLen + foreLen);
  const armRadius = monotone([
    [-0.12, 0.022 * limb],
    [-0.05, 0.044 * limb],
    [0.04, 0.052 * limb],
    [0.25, 0.045 * limb],
    [elbowT, 0.036 * limb],
    [elbowT + 0.12, 0.04 * limb],
    [1, 0.027 * limb],
  ]);
  const makeArm = (side: 1 | -1): Limb => {
    const joint = new THREE.Vector3(side * shape.shoulder * 0.9, y.shoulder - 0.045 * s, -0.008);
    const dir = new THREE.Vector3(side * Math.sin(angle), -Math.cos(angle), -0.04).normalize();
    const elbow = joint.clone().addScaledVector(dir, upperLen);
    const foreDir = new THREE.Vector3(side * Math.sin(angle) * 0.6, -Math.cos(angle), 0.2).normalize();
    const wrist = elbow.clone().addScaledVector(foreDir, foreLen);
    return { curve: new THREE.CatmullRomCurve3([joint, elbow, wrist], false, 'centripetal'), radius: armRadius, side };
  };

  // --- Piernas: cadera -> rodilla -> tobillo -------------------------------
  const legX = shape.hip * 0.46;
  const legTop = y.crotch + 0.06 * s;
  const makeLegCurve = (side: 1 | -1) =>
    new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(side * legX, legTop, -0.004),
        new THREE.Vector3(side * (legX + 0.006), y.knee, 0.012),
        new THREE.Vector3(side * (legX + 0.014), y.ankle, -0.014),
      ],
      false,
      'centripetal',
    );
  const kneeT = (legTop - y.knee) / (legTop - y.ankle);
  const legRadius = monotone([
    [-0.06, shape.hip * 0.46],
    [0, shape.hip * 0.53],
    [kneeT * 0.4, shape.hip * 0.43],
    [kneeT * 0.85, 0.062 * limb],
    [kneeT, 0.054 * limb],
    [kneeT + (1 - kneeT) * 0.3, 0.061 * limb],
    [kneeT + (1 - kneeT) * 0.75, 0.042 * limb],
    [1, 0.035 * limb],
  ]);

  // --- Pies -----------------------------------------------------------------
  const footK = (0.92 + 0.08 * s) * Math.pow(limb, 0.25);
  const footWidth = monotone([[0, 0.03], [0.35, 0.033], [0.7, 0.045], [1, 0.034]]);
  const footHeight = monotone([[0, 0.062], [0.25, 0.085], [0.45, 0.066], [0.75, 0.04], [1, 0.026]]);
  const makeFoot = (leg: Limb): Foot => {
    const ankle = leg.curve.getPointAt(1);
    const angle = leg.side * 0.12; // puntas ligeramente hacia fuera
    const origin = new THREE.Vector3(ankle.x, 0, ankle.z - 0.055 * footK);
    const length = 0.255 * footK;
    const env = (v: number) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * v - 1), 3)), 1 / 3);
    const width = (v: number) => footK * env(v) * footWidth(v);
    const height = (v: number) => footK * footHeight(v);
    const toWorld = (lx: number, ly: number, lz: number) =>
      new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(origin);
    return { origin, angle, length, side: leg.side, width, height, toWorld };
  };

  const legs: [Limb, Limb] = [
    { curve: makeLegCurve(1), radius: legRadius, side: 1 },
    { curve: makeLegCurve(-1), radius: legRadius, side: -1 },
  ];

  const body: Body = {
    shape,
    s,
    limb,
    y,
    neckR,
    torso: rx,
    section,
    surface,
    headPoint,
    arms: [makeArm(1), makeArm(-1)],
    legs,
    feet: [makeFoot(legs[0]), makeFoot(legs[1])],
    kneeT,
    elbowT,
    armSpread,
  };
  if (!key.startsWith('~~')) cache.set(key, body);
  if (key.startsWith('~') && !key.startsWith('~~')) {
    volatileKeys.push(key);
    if (volatileKeys.length > VOLATILE_MAX) cache.delete(volatileKeys.shift()!);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Utilidades compartidas por el maniquí y las prendas
// ---------------------------------------------------------------------------

/** Muestras [x, f(x)] equiespaciadas entre a y b. */
export function sample(a: number, b: number, n: number, f: (x: number) => number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const x = a + ((b - a) * i) / n;
    out.push([x, f(x)]);
  }
  return out;
}

/**
 * Punto de la superficie de un pie (o de un zapato, con holgura e).
 * v: de 0 (talón) a 1 (punta). angle: 0 = costado exterior derecho,
 * π/2 = parte de arriba, π = costado izquierdo, > π = suela.
 * `floor` = altura donde empieza la parte de arriba (grosor de la suela).
 */
export function footPoint(
  foot: Foot,
  v: number,
  angle: number,
  e: number,
  floor = 0.004,
  heightScale?: (v: number) => number,
): THREE.Vector3 {
  const env = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * v - 1), 3)), 1 / 3);
  const w = foot.width(v) + e * env;
  const top = (foot.height(v) * (heightScale ? heightScale(v) : 1) + e) * env + floor * (1 - env);
  const k = 2 / 2.6;
  const cx = w * spow(Math.cos(angle), k);
  const sy = Math.sin(angle);
  // Mitad de arriba: del suelo a `top`; mitad de abajo: casi plana
  const ly = sy >= 0 ? floor + (top - floor) * spow(sy, k) : floor + spow(sy, k) * 0.004;
  return foot.toWorld(cx, ly, v * foot.length);
}

/** Superficie de un pie; con `upperOnly`, solo el empeine (para zapatos). */
export function footSurface(
  foot: Foot,
  e: number,
  opts: { floor?: number; upperOnly?: boolean; heightScale?: (v: number) => number; from?: number } = {},
): THREE.BufferGeometry {
  const from = opts.from ?? 0;
  return paramSurface({
    rows: from > 0 ? 10 : 30,
    cols: 32,
    closed: !opts.upperOnly,
    uvScale: [0.25 * TEX_DENSITY, foot.length * (1 - from) * TEX_DENSITY],
    point: (vv, phi) => {
      const v = from + vv * (1 - from);
      const a = opts.upperOnly ? phi * Math.PI : phi * Math.PI * 2;
      const p = footPoint(foot, v, a, e, opts.floor, opts.heightScale);
      return [p.x, p.y, p.z];
    },
  });
}

/**
 * Relieve anatómico suave del torso del maniquí (m, siempre hacia dentro, para
 * que ninguna prenda ajustada lo atraviese): esternón, borde de los pectorales,
 * clavículas, línea alba y columna.
 */
function torsoRelief(body: Body, py: number, theta: number): number {
  const { y, s } = body;
  const g = (v: number, w: number) => Math.exp(-(v * v) / (w * w));
  const front = Math.atan2(Math.sin(theta), Math.cos(theta)); // −π..π, π/2 delante
  const dF = front - Math.PI / 2; // 0 en el centro del pecho
  const dB = front + Math.PI / 2; // 0 en el centro de la espalda
  const win = (a: number, b: number) => smoothstep(a, a + 0.03 * s, py) * (1 - smoothstep(b - 0.03 * s, b, py));
  let e = 0;
  // Esternón y línea alba
  e -= 0.0028 * g(dF, 0.07) * win(y.chest - 0.07 * s, y.shoulder - 0.01 * s);
  e -= 0.0016 * g(dF, 0.05) * win(y.waist - 0.05 * s, y.chest - 0.06 * s);
  // Borde inferior de los pectorales (un pliegue que sube hacia la axila)
  const pecY = y.chest - 0.045 * s + 0.03 * s * Math.min(1, Math.abs(dF) / 0.9);
  e -= 0.0035 * g(py - pecY, 0.014 * s) * smoothstep(0.08, 0.2, Math.abs(dF)) * (1 - smoothstep(0.85, 1.05, Math.abs(dF)));
  // Hueco bajo las clavículas
  e -= 0.0024 * g(py - (y.shoulder - 0.012 * s), 0.01 * s) * smoothstep(0.12, 0.3, Math.abs(dF)) * (1 - smoothstep(0.8, 1.0, Math.abs(dF)));
  // Columna y omóplatos
  e -= 0.0032 * g(dB, 0.06) * win(y.waist - 0.04 * s, y.shoulder);
  e -= 0.0015 * g(Math.abs(dB) - 0.45, 0.09) * g(py - (y.chest + 0.02 * s), 0.05 * s);
  return e;
}

export interface MannequinOptions {
  /** Sin cabeza ni manos (las pone el modelo 3D esculpido, ver Mannequin.tsx). */
  sculpted?: boolean;
}

/** Geometrías del maniquí (estilo escaparate). */
export function buildMannequin(body: Body, opts: MannequinOptions = {}): THREE.BufferGeometry[] {
  const { y, s } = body;
  const parts: THREE.BufferGeometry[] = [];

  // Torso (cerrado por abajo)
  const bottom = y.crotch - 0.07 * s;
  parts.push(
    paramSurface({
      rows: 60,
      cols: 64,
      closed: true,
      point: (u, phi) => {
        const py = bottom + (y.neck - bottom) * u;
        // Cierra el fondo de forma redondeada (sin escalón en la entrepierna)
        const close = smoothstep(bottom, y.crotch + 0.04 * s, py);
        const sec = body.section(py);
        const theta = phi * Math.PI * 2;
        return body.surface(py, theta, torsoRelief(body, py, theta) * close, {
          rx: sec.rx * Math.sqrt(close),
          rzf: sec.rzf * Math.sqrt(close),
          rzb: sec.rzb * Math.sqrt(close),
        });
      },
    }),
  );

  // Cuello, ligeramente inclinado hacia delante
  parts.push(
    paramSurface({
      rows: 10,
      cols: 32,
      closed: true,
      point: (u, phi) => {
        const a = phi * Math.PI * 2;
        const py = y.neck - 0.04 * s + u * (y.chin + 0.05 - (y.neck - 0.04 * s));
        const r = body.neckR * (0.97 - 0.1 * u);
        return [r * Math.cos(a), py, 0.004 + 0.016 * u + r * 0.95 * Math.sin(a)];
      },
    }),
  );

  // Cabeza ovalada (si no se usa la esculpida)
  if (!opts.sculpted) {
    parts.push(
      paramSurface({
        rows: 36,
        cols: 48,
        closed: true,
        point: (u, phi) => body.headPoint(u, phi * Math.PI * 2, 0),
      }),
    );
  }

  // Brazos y manos
  for (const arm of body.arms) {
    // Hombro redondeado: el brazo empieza con una cúpula en la articulación
    const r0 = arm.radius(0);
    const dt = (r0 * 0.8) / arm.curve.getLength();
    const r = (t: number) => (t >= 0 ? arm.radius(t) : r0 * Math.sqrt(Math.max(0, 1 - (t / dt) ** 2)));
    parts.push(tubeAlong(arm.curve, -dt, 1.0, r, 40, 28));
    if (!opts.sculpted) parts.push(handGeometry(body, arm));
  }

  // Piernas y pies
  for (const leg of body.legs) {
    parts.push(tubeAlong(leg.curve, -0.06, 1.02, (t) => leg.radius(t), 40, 30));
  }
  for (const foot of body.feet) parts.push(footSurface(foot, 0));
  return parts;
}

/**
 * Ejes de la mano en la muñeca: `dir` hacia los dedos, `out` hacia el dorso
 * (fuera del cuerpo) y `front` hacia el pulgar (delante), en los dos lados.
 */
export function handFrame(arm: Limb): { wrist: THREE.Vector3; dir: THREE.Vector3; out: THREE.Vector3; front: THREE.Vector3 } {
  const wrist = arm.curve.getPointAt(1);
  const tangent = arm.curve.getTangentAt(1);
  // Dirección de la mano: sigue el antebrazo y se recoge un poco hacia el muslo
  const dir = new THREE.Vector3(tangent.x * 0.4, tangent.y, tangent.z * 0.7).normalize();
  const out = new THREE.Vector3(arm.side, 0, 0).addScaledVector(dir, -dir.x * arm.side).normalize();
  const front = new THREE.Vector3().crossVectors(dir, out).multiplyScalar(arm.side).normalize();
  return { wrist, dir, out, front };
}

/** Mano tipo "manopla", aplanada, con la palma mirando al cuerpo. */
function handGeometry(body: Body, arm: Limb): THREE.BufferGeometry {
  const { wrist, dir, out: thickAxis } = handFrame(arm);
  const widthAxis = new THREE.Vector3().crossVectors(dir, thickAxis).normalize();
  const len = 0.175 * body.s;
  const k = Math.sqrt(body.limb);
  const width = monotone([[0, 0.025], [0.3, 0.04], [0.6, 0.043], [0.85, 0.037], [1, 0.03]]);
  const thick = monotone([[0, 0.021], [0.3, 0.018], [0.7, 0.013], [1, 0.011]]);
  return paramSurface({
    rows: 18,
    cols: 24,
    closed: true,
    point: (u, phi) => {
      const a = phi * Math.PI * 2;
      const env = Math.pow(1 - Math.pow(u, 4), 0.25);
      const c = wrist
        .clone()
        .addScaledVector(dir, u * len)
        .addScaledVector(thickAxis, -0.012 * u * u * arm.side); // curva suave hacia dentro
      const p = c
        .addScaledVector(thickAxis, Math.cos(a) * thick(u) * k * env)
        .addScaledVector(widthAxis, Math.sin(a) * width(u) * k * env);
      return [p.x, p.y, p.z];
    },
  });
}
