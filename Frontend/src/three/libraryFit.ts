/**
 * Ajuste de los modelos 3D de la biblioteca (prendas_3d_glb) a cualquier cuerpo.
 *
 * Los .glb están modelados sobre un CUERPO DE REFERENCIA (≈1,78 m, en pose A:
 * brazos a 44° de la vertical). El maniquí de la web tiene 7 siluetas y los
 * brazos casi pegados al cuerpo, así que, para vestirlo, deformamos la prenda:
 *
 * - Tronco: a cada altura, escalamos anchura y profundidad (delante y detrás)
 *   por la relación entre la sección del maniquí y la del cuerpo de referencia.
 *   Las alturas se reparten por tramos (tobillo, rodilla, entrepierna, cadera,
 *   cintura, pecho, hombro, cuello, cabeza).
 * - Mangas: "esqueleto" de dos huesos (brazo y antebrazo). Cada vértice de la
 *   manga se lleva del hueso de referencia al del maniquí (giro, largo y
 *   grosor), mezclando con el tronco cerca de la sisa (skinning lineal).
 * - Perneras: cada vértice se recoloca respecto al eje de la pierna y se escala
 *   por la relación de grosores.
 * - Gorra: se lleva a la cabeza del maniquí (posición y tamaño).
 *
 * La prenda sola (sin maniquí) se muestra tal cual se modeló.
 */
import * as THREE from 'three';
import { monotone, type Body } from './body';

import type { HeadFit, LibraryRegion } from './libraryCatalog';

// ---------------------------------------------------------------------------
// Cuerpo de referencia (coordenadas glTF: Y arriba, frente hacia +Z, metros)
// ---------------------------------------------------------------------------

const TZ = [0.74, 0.8, 0.86, 0.92, 0.98, 1.04, 1.1, 1.16, 1.22, 1.28, 1.34, 1.38, 1.42, 1.455, 1.48, 1.5];
const TRX = [0.15, 0.168, 0.178, 0.18, 0.172, 0.16, 0.152, 0.156, 0.165, 0.172, 0.178, 0.18, 0.17, 0.135, 0.085, 0.062];
const TRF = [0.09, 0.098, 0.102, 0.1, 0.098, 0.1, 0.1, 0.104, 0.112, 0.118, 0.114, 0.106, 0.09, 0.072, 0.058, 0.05];
const TRB = [0.09, 0.112, 0.118, 0.108, 0.094, 0.088, 0.09, 0.094, 0.098, 0.1, 0.102, 0.102, 0.096, 0.08, 0.062, 0.052];
// Interpolación suave (monótona) del tronco de referencia: con la lineal, el
// cociente con las secciones del maniquí tenía picos en cada nudo y se veían
// bandas horizontales en las superficies lisas.
const refRX = monotone(TZ.map((z, i) => [z, TRX[i]] as [number, number]));
const refRF = monotone(TZ.map((z, i) => [z, TRF[i]] as [number, number]));
const refRB = monotone(TZ.map((z, i) => [z, TRB[i]] as [number, number]));

function table(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0];
  const n = xs.length - 1;
  if (x >= xs[n]) return ys[n];
  let i = 0;
  while (x > xs[i + 1]) i++;
  const t = (x - xs[i]) / (xs[i + 1] - xs[i]);
  return ys[i] + (ys[i + 1] - ys[i]) * t;
}

const REF = {
  ankle: 0.085,
  knee: 0.485,
  crotch: 0.79,
  hip: 0.92,
  waist: 1.1,
  chest: 1.28,
  shoulder: 1.405,
  neck: 1.5,
  headC: 1.655,
  crown: 1.773,
};

const deg = Math.PI / 180;
function refArm(side: 1 | -1, armDeg: number) {
  const S = new THREE.Vector3(0.168 * side, 1.405, -0.004);
  const d1 = new THREE.Vector3(Math.sin(armDeg * deg) * side, -Math.cos(armDeg * deg), 0).normalize();
  const E = S.clone().addScaledVector(d1, 0.285);
  const d2 = new THREE.Vector3(Math.sin((armDeg - 6) * deg) * side, -Math.cos((armDeg - 6) * deg), 0.12).normalize();
  return { S, d1, E, d2, upper: 0.285, fore: 0.255, r: [0.054, 0.04, 0.031] as const };
}
/**
 * Brazos del cuerpo de referencia según el ángulo con que se modeló la
 * colección (44° la clásica, 32° la de punto), y normal (hacia el brazo) del
 * plano bisector de la axila, a la mitad de ese ángulo.
 */
type RefArms = { arms: Record<1 | -1, ReturnType<typeof refArm>>; bnx: number; bny: number };
const refArmsCache = new Map<number, RefArms>();
function refArms(armDeg: number): RefArms {
  let r = refArmsCache.get(armDeg);
  if (!r) {
    r = {
      arms: { 1: refArm(1, armDeg), [-1]: refArm(-1, armDeg) } as Record<1 | -1, ReturnType<typeof refArm>>,
      bnx: Math.cos((armDeg / 2) * deg),
      bny: Math.sin((armDeg / 2) * deg),
    };
    refArmsCache.set(armDeg, r);
  }
  return r;
}

/** Eje de la pierna de referencia (cadera, rodilla, pantorrilla, tobillo). */
const REF_LEG = [
  { y: 0.84, x: 0.09, z: -0.004, r: 0.088 },
  { y: 0.485, x: 0.098, z: 0.004, r: 0.054 },
  { y: 0.33, x: 0.101, z: -0.01, r: 0.056 },
  { y: 0.085, x: 0.103, z: -0.016, r: 0.035 },
];
/** Línea de los hombros del maniquí esculpido, en el cuerpo de referencia (altura del tronco por arriba según |x|). */
const SHOULDER_TOP_X = [0.09, 0.12, 0.15, 0.18, 0.2];
const SHOULDER_TOP_Y = [1.474, 1.462, 1.457, 1.454, 1.447];
const REF_HEAD = { c: new THREE.Vector3(0, 1.655, -0.016), rx: 0.083, ry: 0.118, rz: 0.1 };

// Radio de la pierna de referencia interpolado con suavidad (como el tronco).
const refLegR = monotone([...REF_LEG].reverse().map((n) => [n.y, n.r] as [number, number]));

function refLegAt(y: number) {
  const L = REF_LEG;
  if (y >= L[0].y) return L[0];
  if (y <= L[L.length - 1].y) return L[L.length - 1];
  let i = 0;
  while (y < L[i + 1].y) i++;
  const t = (L[i].y - y) / (L[i].y - L[i + 1].y);
  const a = L[i];
  const b = L[i + 1];
  return { y, x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, r: refLegR(y) };
}

/** Máximo suave (redondea la esquina en un ancho ~k). */
const softMax = (a: number, b: number, k: number) => 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + k * k));
const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Datos del maniquí destino (se calculan una vez por cuerpo)
// ---------------------------------------------------------------------------

type ArmBones = Record<1 | -1, { S: THREE.Vector3; E: THREE.Vector3; d1: THREE.Vector3; d2: THREE.Vector3; upper: number; fore: number; q1: THREE.Quaternion; q2: THREE.Quaternion; radius: (t: number) => number }>;

interface Target {
  mapY: (y: number) => number;
  bonesFor: (armDeg: number) => ArmBones;
  leg: (side: 1 | -1, y: number) => { x: number; z: number; r: number };
  head: { c: THREE.Vector3; sx: number; sy: number; sz: number };
  elbowT: number;
}

const targetCache = new WeakMap<Body, Target>();

/**
 * Centro y semiejes (ancho x, fondo z) de la cabeza del maniquí a la altura de
 * la copa de una gorra, ya ajustados al cuerpo `body` (para girar la gorra).
 */
export function capFrame(body: Body): { cx: number; cz: number; a: number; b: number } {
  const h = targetOf(body).head;
  return { cx: h.c.x, cz: h.c.z - 0.004 * h.sz, a: 0.088 * h.sx, b: 0.112 * h.sz };
}

function targetOf(body: Body): Target {
  const cached = targetCache.get(body);
  if (cached) return cached;
  const y = body.y;
  const s = body.s;
  const joint = body.arms[0].curve.points[0];
  const headH = y.crown - y.chin;
  const refKnots = [REF.ankle, REF.knee, REF.crotch, REF.hip, REF.waist, REF.chest, REF.shoulder, REF.neck, REF.headC, REF.crown];
  const tgtKnots = [y.ankle, y.knee, y.crotch - 0.02 * s, y.hip, y.waist + 0.03 * s, y.chest, joint.y, y.neck, y.chin + headH * 0.5, y.crown];
  const mapY = (v: number) => {
    if (v <= refKnots[0]) return tgtKnots[0] + (v - refKnots[0]) * s;
    const n = refKnots.length - 1;
    if (v >= refKnots[n]) return tgtKnots[n] + (v - refKnots[n]) * s;
    let i = 0;
    while (v > refKnots[i + 1]) i++;
    const t = (v - refKnots[i]) / (refKnots[i + 1] - refKnots[i]);
    return tgtKnots[i] + (tgtKnots[i + 1] - tgtKnots[i]) * t;
  };

  // Huesos del brazo del maniquí y giro desde los de referencia (según el
  // ángulo con que se modeló la colección).
  const bonesCache = new Map<number, ArmBones>();
  const bonesFor = (armDeg: number): ArmBones => {
    const hit = bonesCache.get(armDeg);
    if (hit) return hit;
    const armBones = {} as ArmBones;
    const refs = refArms(armDeg).arms;
    for (const arm of body.arms) {
      const side = arm.side;
      const [S, E, W] = arm.curve.points;
      const d1 = E.clone().sub(S);
      const upper = d1.length();
      d1.normalize();
      const d2 = W.clone().sub(E);
      const fore = d2.length();
      d2.normalize();
      const ref = refs[side];
      armBones[side] = {
        S: S.clone(),
        E: E.clone(),
        d1,
        d2,
        upper,
        fore,
        q1: new THREE.Quaternion().setFromUnitVectors(ref.d1, d1),
        q2: new THREE.Quaternion().setFromUnitVectors(ref.d2, d2),
        radius: arm.radius,
      };
    }
    bonesCache.set(armDeg, armBones);
    return armBones;
  };

  const legs = body.legs;
  const leg = (side: 1 | -1, yT: number) => {
    const L = legs[side === 1 ? 0 : 1];
    const [A, K, C] = L.curve.points; // cadera, rodilla, tobillo
    let x: number;
    let z: number;
    if (yT >= K.y) {
      const t = Math.min(1, (A.y - yT) / (A.y - K.y));
      x = A.x + (K.x - A.x) * t;
      z = A.z + (K.z - A.z) * t;
    } else {
      const t = Math.min(1, (K.y - yT) / (K.y - C.y));
      x = K.x + (C.x - K.x) * t;
      z = K.z + (C.z - K.z) * t;
    }
    const tt = Math.min(1, Math.max(0, (A.y - yT) / (A.y - C.y)));
    return { x, z, r: L.radius(tt) };
  };

  const hs = headH / 0.235;
  const head = {
    // Ajustado a ojo sobre el maniquí (su cabeza es algo mayor que la de referencia).
    c: new THREE.Vector3(0, y.chin + headH * 0.5 - 0.004 * hs, 0.012),
    sx: ((0.077 * hs) / REF_HEAD.rx) * 1.16,
    sy: (headH / (REF.crown - (REF_HEAD.c.y - REF_HEAD.ry))) * 1.1,
    sz: ((0.097 * hs) / REF_HEAD.rz) * 1.12,
  };

  const t: Target = { mapY, bonesFor, leg, head, elbowT: body.elbowT };
  targetCache.set(body, t);
  return t;
}

// ---------------------------------------------------------------------------
// Deformación
// ---------------------------------------------------------------------------

export interface FitOptions {
  region: LibraryRegion;
  /** Holgura extra del corte (1 = como se modeló; 1,08 = oversize). */
  fit: number;
  /** Capa (0, 1...): separa prendas superpuestas. */
  layer: number;
  /** Ángulo de los brazos del modelo (grados desde la vertical; 44 por defecto). */
  armDeg?: number;
  /** Colocación de una pieza de cabeza (gorra) sobre la cabeza esculpida. */
  headFit?: HeadFit;
}

/**
 * Lleva un punto del espacio de la prenda modelada al cuerpo `body`.
 * Devuelve el punto nuevo en `out`.
 */
export function warpPoint(p: THREE.Vector3, body: Body, o: FitOptions, out = new THREE.Vector3()): THREE.Vector3 {
  const T = targetOf(body);
  lastArmWeight = 0;
  if (o.region === 'head') {
    const h = T.head;
    const f = o.headFit;
    const px = f ? p.x * f.sx : p.x;
    const py = f ? p.y + f.lift : p.y;
    const pz = f ? REF_HEAD.c.z + (p.z - REF_HEAD.c.z) * f.sz + f.dz : p.z;
    return out.set(
      h.c.x + (px - REF_HEAD.c.x) * h.sx * o.fit,
      h.c.y + (py - REF_HEAD.c.y) * h.sy,
      h.c.z + (pz - REF_HEAD.c.z) * h.sz * o.fit,
    );
  }

  // Hombros: los modelos llevan la misma holgura en todas direcciones, también
  // hacia arriba, y la tela quedaba 2-4 cm por encima del hombro (como con
  // hombreras). En la vida real descansa sobre él: se baja lo que sobra.
  if (o.region === 'upper') {
    const ax = Math.abs(p.x);
    // Solo la tela que va sobre el hombro (no capuchas ni cuellos altos).
    const k = smooth(0.075, 0.1, ax) * smooth(0.34, 0.28, ax) * smooth(1.55, 1.5, p.y);
    if (k > 0) {
      // Del hombro hacia fuera manda la parte de arriba del brazo de referencia
      // (según el ángulo con que se modeló la colección).
      const a = ((o.armDeg ?? 44) * Math.PI) / 180;
      const armTop = 1.405 - (ax - 0.168) / Math.tan(a) + 0.054 / Math.sin(a);
      const top = ax < 0.2 ? table(SHOULDER_TOP_X, SHOULDER_TOP_Y, ax) : 1.447 + (armTop - 1.447) * smooth(0.2, 0.235, ax);
      const d = p.y - top;
      if (d > 0.004) p = _pin.copy(p).setY(top + 0.004 + (d - 0.004) * (1 - 0.85 * k));
    }
  }

  // Tronco
  const yT = T.mapY(p.y);
  // Por debajo de la cadera se escala como en la cadera: el maniquí se abre
  // en piernas y su sección "de tronco" ahí ya no representa su contorno.
  // (Tope suave: con uno duro quedaba una arista horizontal en la cadera del
  // maniquí y de los pantalones, donde la escala dejaba de cambiar de golpe.)
  const yR = Math.min(softMax(p.y, REF.hip, 0.06), TZ[TZ.length - 1]);
  const yTc = Math.min(softMax(yT, body.y.hip, 0.06 * body.s), body.y.neck);
  let sec = body.section(yTc);
  if (o.region === 'upper' && yTc < body.y.chest) {
    // La ropa de arriba cuelga del pecho: no se mete en la cintura (en las
    // siluetas de cintura marcada se ceñía y luego se abría en la cadera,
    // como una campana).
    const c = body.section(body.y.chest);
    const dy = body.y.chest - yTc;
    sec = {
      rx: Math.max(sec.rx, c.rx - dy * 0.3),
      rzf: Math.max(sec.rzf, c.rzf - dy * 0.2),
      rzb: Math.max(sec.rzb, c.rzb - dy * 0.35),
    };
  }
  let kx = sec.rx / refRX(yR);
  let kz = p.z >= 0 ? sec.rzf / refRF(yR) : sec.rzb / refRB(yR);
  // Del cuello hacia arriba (cuellos, capuchas) no se escala con el tronco.
  const up = smooth(1.43, 1.53, p.y);
  const hk = T.head.sx;
  kx = kx * (1 - up) + hk * up;
  kz = kz * (1 - up) + T.head.sz * up;
  // Por encima o por debajo: la parte de arriba cae sobre el pantalón (algo
  // más holgada de cintura para abajo) y el pantalón se ciñe un poco.
  const tuck =
    o.region === 'upper'
      ? 1 + 0.08 * smooth(REF.waist, REF.hip - 0.03, p.y)
      : o.region === 'lower'
        ? 1 - 0.045 * smooth(REF.crotch - 0.02, REF.hip, p.y) * (1 - smooth(REF.waist, REF.waist + 0.08, p.y))
        : 1;
  let tuckEff = tuck;
  if (tuck < 1) {
    // El pantalón se ciñe, pero nunca hasta pegarse al cuerpo (si no, una
    // camisa metida por dentro asomaría a través de la pretina).
    const nx = (p.x * kx * o.fit) / sec.rx;
    const nz = (p.z * kz * o.fit) / (p.z >= 0 ? sec.rzf : sec.rzb);
    const q = Math.pow(Math.pow(Math.abs(nx), 2.35) + Math.pow(Math.abs(nz), 2.35), 1 / 2.35);
    const qMin = 1 + 0.012 / Math.min(sec.rx, sec.rzf);
    // Transición suave y ancha: con un tope duro (radio = qMin) todas las
    // capas del modelo (tela, bolsillos, pretina, su cara interior) caían a
    // la misma distancia y se veían manchas oscuras; así conservan su orden.
    tuckEff = 1 - (1 - tuck) * smooth(qMin, qMin + 0.15, q);
  }
  const tx = p.x * kx * o.fit * tuckEff;
  const tz = p.z * kz * o.fit * tuckEff;
  let ox = tx;
  let oy = yT;
  let oz = tz;

  let legFree = 1;
  if (o.region === 'upper' || o.region === 'body') {
    const side: 1 | -1 = p.x >= 0 ? 1 : -1;
    const refs = refArms(o.armDeg ?? 44);
    const ref = refs.arms[side];
    const rel = _v.copy(p).sub(ref.S);
    const u = rel.dot(ref.d1);
    // ¿Es manga? Lado del brazo respecto al plano bisector de la axila (a medio
    // camino entre el costado, vertical, y el brazo, a 44°). Cerca del hombro
    // el giro mueve poco, así que ahí podemos ser generosos. En el maniquí
    // (brazos casi pegados al cuerpo) decide qué está más cerca: brazo o tronco.
    const w = o.region === 'body' ? bodyArmWeight(p, ref, u) : armWeightAt(p, refs, ref, u);
    lastArmWeight = w;
    legFree = 1 - w;
    if (w > 0) {
      const bone = T.bonesFor(o.armDeg ?? 44)[side];
      const len = ref.upper + ref.fore;
      // Grosor: escala progresiva del hombro a la muñeca (como en las piernas).
      // Con el perfil del brazo paramétrico (antebrazo más grueso que el codo)
      // la manga se estrechaba en el codo y se hinchaba debajo, como un globo.
      const kTop = bone.radius(0) / ref.r[0];
      const kBot = bone.radius(1) / ref.r[2];
      const garment = o.region === 'upper';
      /** Radio (vector perpendicular al hueso) ya escalado; la holgura de la manga se afina hacia el puño. */
      const scaleRadial = (v: THREE.Vector3, along: number) => {
        const f = Math.min(1, Math.max(0, along / len));
        const kr = Math.min(1.35, Math.max(0.7, kTop + (kBot - kTop) * f)) * o.fit;
        v.multiplyScalar(kr);
        if (garment) {
          const arm = kr * table([0, ref.upper, len], [ref.r[0], ref.r[1], ref.r[2]], along) + 0.004;
          const L = v.length();
          if (L > arm) v.multiplyScalar((arm + (L - arm) * (1 - 0.3 * Math.pow(f, 1.2))) / L);
        }
        return v;
      };
      // Brazo. En las prendas, junto al hombro el giro entra poco a poco: si no,
      // lo que queda por encima de la articulación se abría hacia fuera y los
      // hombros parecían llevar hombreras.
      const along1 = u;
      const rad1 = scaleRadial(_a.copy(rel).addScaledVector(ref.d1, -along1), Math.max(0, along1));
      const q1 = garment ? _q.identity().slerp(bone.q1, smooth(-0.05, 0.11, u)) : bone.q1;
      const p1 = _b
        .copy(rad1)
        .applyQuaternion(q1)
        .add(_e.copy(ref.d1).applyQuaternion(q1).multiplyScalar(along1 * (bone.upper / ref.upper)))
        .add(bone.S);
      // Antebrazo
      const rel2 = _c.copy(p).sub(ref.E);
      const along2 = rel2.dot(ref.d2);
      const rad2 = scaleRadial(rel2.addScaledVector(ref.d2, -along2), ref.upper + Math.max(0, along2));
      const p2 = _d
        .copy(rad2)
        .applyQuaternion(bone.q2)
        .addScaledVector(bone.d2, along2 * (bone.fore / ref.fore))
        .add(bone.E);
      const w2 = smooth(ref.upper - 0.05, ref.upper + 0.05, u);
      p1.lerp(p2, w2);
      ox += (p1.x - ox) * w;
      oy += (p1.y - oy) * w;
      oz += (p1.z - oz) * w;
    }
  }
  if (o.region === 'lower' || o.region === 'body') {
    // Perneras
    const w = smooth(REF.crotch + 0.07, REF.crotch - 0.05, p.y) * legFree;
    if (w > 0) {
      const side: 1 | -1 = p.x >= 0 ? 1 : -1;
      const r = refLegAt(p.y);
      const t = T.leg(side, yT);
      // El grosor de la pierna se escala de forma progresiva (cadera → tobillo)
      // y no según el perfil de radios del maniquí paramétrico, que añadiría sus
      // propios bultos (pantorrilla, rodilla). Maniquí, pantalones y calzado
      // usan la misma escala, así que la ropa no atraviesa la pierna.
      const top = T.leg(side, T.mapY(REF_LEG[0].y)).r / REF_LEG[0].r;
      const bot = T.leg(side, T.mapY(REF_LEG[REF_LEG.length - 1].y)).r / REF_LEG[REF_LEG.length - 1].r;
      const f = Math.min(1, Math.max(0, (REF_LEG[0].y - p.y) / (REF_LEG[0].y - REF_LEG[REF_LEG.length - 1].y)));
      const kr = Math.min(1.35, Math.max(0.7, top + (bot - top) * f)) * o.fit;
      const lx = t.x + (p.x - r.x * side) * kr;
      const lz = t.z + (p.z - r.z) * kr;
      ox += (lx - ox) * w;
      oz += (lz - oz) * w;
    }
  }
  return out.set(ox, oy, oz);
}

/**
 * Peso de brazo de un punto del maniquí: 1 si está más cerca del brazo de
 * referencia que del tronco, con una transición corta; cerca del hombro se
 * funde con el tronco.
 */
function bodyArmWeight(p: THREE.Vector3, ref: ReturnType<typeof refArm>, u: number): number {
  // Distancia al eje del brazo (hombro-codo-muñeca) menos su radio
  const t1 = Math.min(ref.upper, Math.max(0, u));
  const a1 = _a.copy(ref.S).addScaledVector(ref.d1, t1).distanceTo(p) - table([0, ref.upper], [ref.r[0], ref.r[1]], t1);
  const rel2 = _b.copy(p).sub(ref.E);
  const t2 = Math.min(ref.fore + 0.05, Math.max(0, rel2.dot(ref.d2)));
  const a2 = _c.copy(ref.E).addScaledVector(ref.d2, t2).distanceTo(p) - table([0, ref.fore], [ref.r[1], ref.r[2]], t2);
  const da = Math.min(a1, a2);
  // Distancia (aprox.) al tronco de referencia (secciones elípticas)
  const yR = Math.min(Math.max(p.y, TZ[0]), TZ[TZ.length - 1]);
  const rx = refRX(yR);
  const rz = p.z >= 0 ? refRF(yR) : refRB(yR);
  const q = Math.hypot(p.x / rx, p.z / rz);
  const dt = (q - 1) * Math.min(rx, rz);
  return smooth(0.018, -0.018, da - dt) * smooth(-0.07, -0.01, u);
}

/** Peso de manga (0 tronco, 1 manga) de un punto de la prenda modelada. */
function armWeightAt(p: THREE.Vector3, refs: RefArms, ref: ReturnType<typeof refArm>, u: number): number {
  const sd = (Math.abs(p.x) - Math.abs(ref.S.x)) * refs.bnx + (p.y - ref.S.y) * refs.bny;
  return smooth(-0.04, 0.012, sd) * smooth(-0.08, 0.0, u) * (1 - smooth(1.5, 1.56, p.y));
}

function refArmWeight(p: THREE.Vector3, armDeg: number): number {
  const refs = refArms(armDeg);
  const ref = refs.arms[p.x >= 0 ? 1 : -1];
  const u = _v.copy(p).sub(ref.S).dot(ref.d1);
  return armWeightAt(p, refs, ref, u);
}

// ---------------------------------------------------------------------------
// Largo de la prenda (cortes que acaban en la cintura: boxy, crop, cazadoras)
// ---------------------------------------------------------------------------

/**
 * Altura del bajo de una prenda de arriba en el cuerpo de referencia: el
 * punto más bajo del tronco por delante y por detrás (|x| < 8 cm, sin mangas).
 */
export function hemHeight(geometries: THREE.BufferGeometry[], armDeg: number): number {
  let hem = Infinity;
  const p = new THREE.Vector3();
  for (const g of geometries) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (Math.abs(p.x) < 0.08 && p.y < hem && refArmWeight(p, armDeg) < 0.01) hem = p.y;
    }
  }
  return hem;
}

/** Alto de la tira del bajo (dobladillo y pespunte), que se sube sin deformar. */
const HEM_BAND = 0.03;
/** Ancho de la transición suave entre la parte que no cambia y la acortada. */
const BLEND = 0.08;

/**
 * Función que acorta el tronco para que el bajo pase de `from` a `to`
 * (alturas del cuerpo de referencia). Por encima del pecho no cambia nada; de
 * ahí hasta la tira del bajo se comprime de forma progresiva (sin aristas) y
 * la tira del bajo sube entera, con su dobladillo intacto.
 */
function hemRemap(from: number, to: number): (y: number) => number {
  const top = Math.max(to + HEM_BAND + BLEND + 0.02, REF.chest - 0.02);
  const span = top - (from + HEM_BAND);
  const want = top - (to + HEM_BAND);
  const half = BLEND / 2;
  // Derivada: 1 arriba, k abajo y suave en medio; k sale de que el bajo
  // tiene que quedar justo en `to`.
  const k = Math.max(0.05, (want - half) / Math.max(1e-3, span - half));
  /** ∫ de y a top de la parte suave (smoothstep) de la derivada. */
  const blendIntegral = (y: number) => {
    const u = Math.min(1, Math.max(0, (y - (top - BLEND)) / BLEND));
    return BLEND * (0.5 - (u * u * u - (u * u * u * u) / 2));
  };
  const at = (y: number) => top - (k * (top - y) + (1 - k) * blendIntegral(y));
  const bandTop = from + HEM_BAND;
  const shift = at(bandTop) - bandTop;
  return (y) => (y >= top ? y : y >= bandTop ? at(y) : y + shift);
}

/**
 * Copia de la geometría (en el espacio de la prenda modelada) con el tronco
 * acortado de `from` a `to`. Las mangas no se tocan.
 */
export function shortenGeometry(base: THREE.BufferGeometry, from: number, to: number, armDeg: number): THREE.BufferGeometry {
  if (!(to > from + 0.005)) return base;
  const remap = hemRemap(from, to);
  const g = base.clone();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const y = remap(p.y);
    if (y === p.y) continue;
    const torso = 1 - refArmWeight(p, armDeg);
    pos.setY(i, p.y + (y - p.y) * torso);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _pin = new THREE.Vector3();
/** Peso de manga del último punto deformado (0 tronco, 1 manga). */
let lastArmWeight = 0;

/**
 * Copia de la geometría ajustada al cuerpo. Si es una capa exterior, se separa
 * un poco hacia fuera. Guarda en `armW` qué vértices son de manga (en pose A se
 * distinguen sin ambigüedad), para los estilos del outfit (remangar, meter por
 * dentro...).
 *
 * Normales: se deforman las del archivo (salen del campo de distancia y son
 * suaves) con la propia deformación, en vez de recalcularlas desde los
 * triángulos. En las zonas lisas el simplificador deja triángulos largos y,
 * cuando la deformación los curva (la cintura de las siluetas femeninas, la
 * sisa), las normales recalculadas salían a rayas y con manchas oscuras.
 */
export function fitGeometry(base: THREE.BufferGeometry, body: Body, o: FitOptions): THREE.BufferGeometry {
  const g = base.clone();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const armW = new Float32Array(pos.count);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const n = new THREE.Vector3();
  const t1 = new THREE.Vector3();
  const t2 = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const newN = nor ? new Float32Array(pos.count * 3) : null;
  const H = 0.002;
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    if (newN && nor) {
      n.fromBufferAttribute(nor, i);
      if (n.lengthSq() > 1e-8) {
        n.normalize();
        // Dos tangentes, deformadas: su producto vectorial es la normal nueva
        t1.set(Math.abs(n.x) < 0.9 ? 1 : 0, Math.abs(n.x) < 0.9 ? 0 : 1, 0).cross(n).normalize();
        t2.crossVectors(n, t1);
        warpPoint(a.copy(p).addScaledVector(t1, H), body, o, a);
        warpPoint(b.copy(p).addScaledVector(t2, H), body, o, b);
        warpPoint(c.copy(p).addScaledVector(n, H), body, o, c);
      }
    }
    warpPoint(p, body, o, q);
    armW[i] = lastArmWeight;
    if (newN && nor && n.lengthSq() > 1e-8) {
      a.sub(q);
      b.sub(q);
      c.sub(q);
      const m = a.cross(b);
      if (m.dot(c) < 0) m.negate();
      const l = m.length();
      if (l > 1e-12) {
        newN[i * 3] = m.x / l;
        newN[i * 3 + 1] = m.y / l;
        newN[i * 3 + 2] = m.z / l;
      }
    }
    pos.setXYZ(i, q.x, q.y, q.z);
  }
  pos.needsUpdate = true;
  if (o.region === 'upper' || o.region === 'body') g.setAttribute('armW', new THREE.BufferAttribute(armW, 1));
  if (newN) g.setAttribute('normal', new THREE.BufferAttribute(newN, 3));
  else g.computeVertexNormals();
  if (o.layer > 0) {
    const nn = g.getAttribute('normal') as THREE.BufferAttribute;
    const d = 0.007 * o.layer;
    for (let i = 0; i < pos.count; i++) {
      pos.setXYZ(i, pos.getX(i) + nn.getX(i) * d, pos.getY(i) + nn.getY(i) * d, pos.getZ(i) + nn.getZ(i) * d);
    }
  }
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}


// ---------------------------------------------------------------------------
// Cuello de las prendas: que abrace el cuello del maniquí
// ---------------------------------------------------------------------------

/**
 * Cuello de la cabeza esculpida (generador `cabeza.py`) en el espacio de
 * referencia: un cono de (y0, z0, r0) a (y1, z1, r1). Se ajusta al maniquí con
 * la misma deformación que la cabeza (región 'head').
 */
const REF_NECK = { y0: 1.4, y1: 1.6, z0: -0.042, z1: -0.032, r0: 0.058, r1: 0.052 };
/** Radio del cuello de la cabeza femenina respecto al masculino. */
const NECK_FEMALE = 0.86;

/** Eje y radios (x, z) del cuello del maniquí a la altura `y` (ya ajustada). */
function neckAt(T: Target, y: number, k = 1): { cx: number; cz: number; rx: number; rz: number } {
  const h = T.head;
  const yR = REF_HEAD.c.y + (y - h.c.y) / h.sy;
  const t = Math.min(1, Math.max(0, (yR - REF_NECK.y0) / (REF_NECK.y1 - REF_NECK.y0)));
  const zR = REF_NECK.z0 + (REF_NECK.z1 - REF_NECK.z0) * t;
  const rR = (REF_NECK.r0 + (REF_NECK.r1 - REF_NECK.r0) * t) * k;
  return { cx: h.c.x, cz: h.c.z + (zR - REF_HEAD.c.z) * h.sz, rx: rR * h.sx, rz: rR * h.sz };
}

/** Distancia desde (cx, cz) hasta una elipse centrada en el origen, en la dirección `ang`. */
function rayToEllipse(cx: number, cz: number, ang: number, rx: number, rzf: number, rzb: number): number {
  const c = Math.cos(ang);
  const sn = Math.sin(ang);
  const rz = sn >= 0 ? rzf : rzb; // +z es el frente
  const A = (c * c) / (rx * rx) + (sn * sn) / (rz * rz);
  const B = 2 * ((cx * c) / (rx * rx) + (cz * sn) / (rz * rz));
  const C = (cx * cx) / (rx * rx) + (cz * cz) / (rz * rz) - 1;
  const disc = B * B - 4 * A * C;
  return disc > 0 ? Math.max(0, (-B + Math.sqrt(disc)) / (2 * A)) : 0;
}

/**
 * Las prendas se modelaron sobre un cuello genérico y, ajustadas al maniquí,
 * el escote o el cuello (camisa, canalé, bomber...) quedaba holgado: se veía
 * un hueco alrededor del cuello. Aquí se mide, por alturas y por sectores
 * alrededor del cuello, el borde interior de la prenda (todas sus piezas a la
 * vez) y se acerca al maniquí hasta dejar una holgura pequeña. El límite es la
 * superficie del maniquí en esa dirección: el cuello o, más abajo, el pecho, los
 * hombros y la espalda (la tela nunca se mete dentro del cuerpo). Se mueve la
 * tela cercana al borde (el cuello entero, con su grosor) y el efecto se
 * desvanece hacia los hombros y por encima de la barbilla (capuchas). Nunca se
 * ensancha nada.
 */
export function tightenCollar(geometries: THREE.BufferGeometry[], body: Body, layer = 0): void {
  const T = targetOf(body);
  const yLo = body.y.shoulder - 0.05 * body.s;
  const yHi = body.y.chin + 0.015;
  const BAND = 0.008;
  const SECT = 16;
  const nB = Math.max(1, Math.ceil((yHi - yLo) / BAND));
  // El cuello de la cabeza femenina es más fino (ver cabeza_f en el generador).
  const neckK = body.shape.sex === 'female' ? NECK_FEMALE : 1;
  const necks = Array.from({ length: nB + 1 }, (_, b) => neckAt(T, yLo + b * BAND, neckK));
  const clear = 0.007 + 0.007 * layer;
  // Superficie del maniquí desde el eje del cuello, por banda y sector
  const target = new Float64Array((nB + 1) * SECT);
  for (let b = 0; b <= nB; b++) {
    const y = Math.min(yLo + b * BAND, body.y.neck);
    const n = necks[b];
    const sec = body.section(y);
    for (let k = 0; k < SECT; k++) {
      const ang = (k / SECT) * Math.PI * 2;
      const c = Math.cos(ang);
      const sn = Math.sin(ang);
      const neckR = 1 / Math.sqrt((c * c) / (n.rx * n.rx) + (sn * sn) / (n.rz * n.rz));
      const torsoR = rayToEllipse(n.cx, n.cz, ang, sec.rx, sec.rzf, sec.rzb);
      target[b * SECT + k] = Math.max(neckR, torsoR) + clear;
    }
  }
  const where = (x: number, y: number, z: number) => {
    const b = Math.min(nB, Math.max(0, Math.round((y - yLo) / BAND)));
    const n = necks[b];
    const dx = x - n.cx;
    const dz = z - n.cz;
    const ang = Math.atan2(dz, dx);
    const k = ((Math.round((ang / (Math.PI * 2)) * SECT) % SECT) + SECT) % SECT;
    return { b, k, d: Math.hypot(dx, dz), n, dx, dz };
  };
  // 1) Borde interior de la prenda por banda y sector
  const inner = new Float64Array((nB + 1) * SECT).fill(Infinity);
  for (const g of geometries) {
    const pos = g.getAttribute('position');
    const arm = g.getAttribute('armW');
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < yLo || y > yHi) continue;
      if (arm && arm.getX(i) > 0.05) continue;
      const { b, k, d } = where(pos.getX(i), y, pos.getZ(i));
      if (d < 0.2 && d < inner[b * SECT + k]) inner[b * SECT + k] = d;
    }
  }
  // 2) Cuánto cerrar en cada celda, suavizado entre vecinas (alturas y sectores)
  const raw = Array.from(inner, (d, i) => (Number.isFinite(d) ? Math.max(0, d - target[i]) : 0));
  const shift = new Float64Array(raw.length);
  for (let b = 0; b <= nB; b++) {
    for (let k = 0; k < SECT; k++) {
      let acc = 0;
      let w = 0;
      let lo = Infinity;
      for (let db = -2; db <= 2; db++) {
        const bb = b + db;
        if (bb < 0 || bb > nB) continue;
        for (let dk = -1; dk <= 1; dk++) {
          const kk = (k + dk + SECT) % SECT;
          const i = bb * SECT + kk;
          if (!Number.isFinite(inner[i])) continue;
          const wk = (3 - Math.abs(db)) * (2 - Math.abs(dk));
          acc += raw[i] * wk;
          w += wk;
          lo = Math.min(lo, raw[i]);
        }
      }
      // Nunca más de lo que permite la propia celda ni sus vecinas (no meter tela en el cuerpo)
      shift[b * SECT + k] = w ? Math.min(acc / w, raw[b * SECT + k] + 0.004, lo + 0.012) : 0;
    }
  }
  if (!shift.some((v) => v > 1e-3)) return;
  // 3) Acercamos la tela del borde al maniquí. El desplazamiento se interpola
  //    entre alturas y sectores (si no, el borde quedaría escalonado).
  const sample = (y: number, ang: number): { sh: number; inn: number } => {
    const fb = Math.min(nB, Math.max(0, (y - yLo) / BAND));
    const fs = (((ang / (Math.PI * 2)) * SECT) % SECT + SECT) % SECT;
    const b0 = Math.floor(fb);
    const k0 = Math.floor(fs);
    let sh = 0;
    let inn = 0;
    let w = 0;
    for (const [bb, wb] of [[b0, 1 - (fb - b0)], [Math.min(nB, b0 + 1), fb - b0]] as const) {
      for (const [kk, wk] of [[k0, 1 - (fs - k0)], [(k0 + 1) % SECT, fs - k0]] as const) {
        const i = bb * SECT + kk;
        const wi = wb * wk;
        if (wi <= 0 || !Number.isFinite(inner[i])) continue;
        sh += shift[i] * wi;
        inn += inner[i] * wi;
        w += wi;
      }
    }
    return w > 0 ? { sh: sh / w, inn: inn / w } : { sh: 0, inn: Infinity };
  };
  for (const g of geometries) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const arm = g.getAttribute('armW');
    let moved = false;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (y < yLo - 0.02 || y > yHi + 0.02) continue;
      const { d, n, dx, dz } = where(x, y, z);
      if (d < 1e-4) continue;
      const { sh, inn } = sample(y, Math.atan2(dz, dx));
      if (sh <= 0 || !Number.isFinite(inn)) continue;
      // Todo el cuello (pie y caída de la camisa) se mueve igual; lejos, nada
      const fade =
        (1 - smooth(0.05, 0.1, d - inn)) *
        smooth(yLo - 0.02, yLo + 0.02, y) *
        (1 - smooth(yHi - 0.025, yHi + 0.01, y)) *
        (arm ? 1 - arm.getX(i) : 1);
      if (fade <= 0) continue;
      const kk = Math.max(0.3, (d - sh * fade) / d);
      pos.setXYZ(i, n.cx + dx * kk, y, n.cz + dz * kk);
      moved = true;
    }
    if (moved) {
      // Solo se estrecha alrededor del cuello: las normales casi no cambian y
      // recalcularlas desde los triángulos las estropearía (ver fitGeometry).
      pos.needsUpdate = true;
      g.computeBoundingBox();
      g.computeBoundingSphere();
    }
  }
}

/** Holgura del corte sin maniquí: escala anchura y fondo alrededor del eje. */
export function scaleGeometry(base: THREE.BufferGeometry, fit: number): THREE.BufferGeometry {
  if (fit === 1) return base;
  const g = base.clone();
  g.scale(fit, 1, fit);
  return g;
}

/**
 * Detalle guardado en el espacio de la prenda modelada → cuerpo `body`.
 * La normal se transforma con un pequeño paso finito.
 */
export function warpDetail(p: THREE.Vector3, n: THREE.Vector3, body: Body | null, o: FitOptions): { p: THREE.Vector3; n: THREE.Vector3 } {
  // Sin maniquí la prenda se ve tal cual (con su holgura): el detalle se guardó ahí.
  if (!body) return { p: p.clone(), n: n.clone() };
  const a = warpPoint(p, body, o);
  const b = warpPoint(p.clone().addScaledVector(n, 0.01), body, o);
  const dir = b.sub(a);
  return { p: a, n: dir.lengthSq() > 1e-10 ? dir.normalize() : n.clone() };
}
