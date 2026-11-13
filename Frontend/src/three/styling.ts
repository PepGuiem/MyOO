/**
 * "Cómo se lleva" una prenda en un outfit: metida por dentro, medio metida,
 * mangas remangadas o subidas, delantera abierta o cerrada, bajo con vuelta,
 * pantalón metido en las botas, gorra hacia atrás...
 *
 * Se aplica DEFORMANDO la geometría ya construida para el maniquí (procedural
 * o de la biblioteca). Cada efecto es un campo que depende solo de la
 * posición, así que botones, pespuntes y tela se mueven juntos:
 *
 * - Por dentro: de la cintura del pantalón hacia abajo, la tela se ciñe al
 *   cuerpo y se oculta (queda dentro); justo encima se ahueca un poco, como
 *   la tela real al meterla.
 * - Mangas: la parte final se comprime hacia el codo y engorda (enrollada o
 *   arrugada).
 * - Delantera abierta: cada mitad gira sobre el costado, como una puerta.
 * - Bajo con vuelta / remangado: el bajo sube y forma una banda más gruesa.
 * - Metido en las botas: la pernera se ciñe a la pierna y se oculta dentro
 *   de la caña; encima se acumula un poco de tela.
 *
 * Es una aproximación visual (no hay simulación de la tela metida).
 */
import * as THREE from 'three';
import type { Styling } from '../api/types';
import type { Body } from './body';
import type { GarmentBuild } from './garments';
import { FRONT_GAP, HOOD_UP } from './libraryCatalog';
import { capFrame } from './libraryFit';

/** Datos del resto del outfit que necesitan algunos estilos. */
export interface OutfitContext {
  /** Altura de la cintura del pantalón o la falda (null si no hay). */
  waistY: number | null;
  /** Altura de la caña de las botas (null si no hay botas). */
  bootTop: number | null;
  /**
   * Altura del bajo de la parte de arriba que va por fuera (null si no hay o
   * va metida). Lo que el pantalón tenga por encima queda tapado: se ciñe al
   * cuerpo para que los bolsillos o la cadera no atraviesen la camiseta.
   */
  coverY?: number | null;
}

const BOTTOMS = ['pants', 'shorts', 'skirt', 'underwear'];

/** ¿Hay que deformar esta prenda en el outfit (por su estilo o por lo que lleva encima)? */
export function stylingNeeded(modelKey: string, s: Styling | undefined, ctx: OutfitContext | undefined): boolean {
  return stylingIsActive(s) || (BOTTOMS.includes(modelKey) && ctx?.coverY != null);
}

const NEUTRAL: Record<string, string> = { tuck: 'out', sleeves: 'down', hem: 'normal', boots: 'over', visor: 'forward', hood: 'up' };

/** ¿Cambia algo este estilo respecto a la prenda tal cual? */
export function stylingIsActive(s: Styling | undefined): boolean {
  if (!s) return false;
  return Object.entries(s).some(([k, v]) => v !== undefined && NEUTRAL[k] !== v);
}


const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// Geometría del cuerpo
// ---------------------------------------------------------------------------

interface ArmHit {
  /** Parámetro a lo largo del brazo (0 hombro, 1 muñeca). */
  t: number;
  /** Vector radial desde el eje. */
  rx: number;
  ry: number;
  rz: number;
  /** Distancia a la superficie del brazo (negativa = dentro). */
  d: number;
}

function armHit(body: Body, side: 0 | 1, x: number, y: number, z: number): ArmHit {
  const pts = body.arms[side].curve.points;
  const lens = [pts[0].distanceTo(pts[1]), pts[1].distanceTo(pts[2])];
  const total = lens[0] + lens[1];
  let best: ArmHit = { t: 0, rx: 0, ry: 0, rz: 0, d: Infinity };
  let bestDist = Infinity;
  let acc = 0;
  for (let s = 0; s < 2; s++) {
    const a = pts[s];
    const b = pts[s + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const l2 = dx * dx + dy * dy + dz * dz;
    let u = ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / l2;
    u = Math.min(1, Math.max(s === 0 ? -0.3 : 0, u));
    const cx = a.x + dx * u;
    const cy = a.y + dy * u;
    const cz = a.z + dz * u;
    const rx = x - cx;
    const ry = y - cy;
    const rz = z - cz;
    const dist = Math.hypot(rx, ry, rz);
    if (dist < bestDist) {
      bestDist = dist;
      const t = (acc + u * lens[s]) / total;
      best = { t, rx, ry, rz, d: dist - body.arms[side].radius(Math.max(0, t)) };
    }
    acc += lens[s];
  }
  return best;
}

/** Punto del eje del brazo en el parámetro t y dirección del eje ahí. */
function armAxis(body: Body, side: 0 | 1, t: number): { p: THREE.Vector3; dir: THREE.Vector3 } {
  const pts = body.arms[side].curve.points;
  const l0 = pts[0].distanceTo(pts[1]);
  const l1 = pts[1].distanceTo(pts[2]);
  const s = t * (l0 + l1);
  if (s <= l0) {
    const dir = pts[1].clone().sub(pts[0]).normalize();
    return { p: pts[0].clone().addScaledVector(dir, s), dir };
  }
  const dir = pts[2].clone().sub(pts[1]).normalize();
  return { p: pts[1].clone().addScaledVector(dir, s - l0), dir };
}

/** Distancia (aprox.) a la superficie del tronco y coordenadas normalizadas. */
function torsoInfo(body: Body, x: number, y: number, z: number) {
  const yc = Math.min(Math.max(y, body.y.crotch - 0.03 * body.s), body.y.neck);
  const sec = body.section(yc);
  const rz = z >= 0 ? sec.rzf : sec.rzb;
  const xn = x / sec.rx;
  const zn = z / rz;
  // Misma superelipse que el tronco del maniquí (body.ts), no una elipse: si
  // no, en las diagonales la tela "ceñida" quedaría dentro del cuerpo.
  const q = Math.pow(Math.pow(Math.abs(xn), TORSO_N) + Math.pow(Math.abs(zn), TORSO_N), 1 / TORSO_N);
  return { q, xn, zn, rx: sec.rx, rz, d: (q - 1) * Math.min(sec.rx, rz) };
}

/** Eje de la pierna a la altura y (lado 0 = derecho, x > 0). */
function legAxis(body: Body, side: 0 | 1, y: number): { x: number; z: number; r: number } {
  const L = body.legs[side];
  const [A, K, C] = L.curve.points;
  let x: number;
  let z: number;
  if (y >= K.y) {
    const t = Math.min(1, Math.max(0, (A.y - y) / (A.y - K.y)));
    x = A.x + (K.x - A.x) * t;
    z = A.z + (K.z - A.z) * t;
  } else {
    const t = Math.min(1, Math.max(0, (K.y - y) / (K.y - C.y)));
    x = K.x + (C.x - K.x) * t;
    z = K.z + (C.z - K.z) * t;
  }
  const tt = Math.min(1, Math.max(0, (A.y - y) / (A.y - C.y)));
  return { x, z, r: L.radius(tt) };
}

// ---------------------------------------------------------------------------
// Aplicación
// ---------------------------------------------------------------------------

interface VertexField {
  /**
   * Nueva posición del vértice (en el mismo array) y si queda oculto. `aw` es
   * el peso de manga del propio modelo si lo trae (biblioteca), o null.
   */
  apply: (p: THREE.Vector3, aw: number | null) => { hidden: boolean; split: number };
}

/**
 * Devuelve una copia de la prenda con el estilo aplicado (o la misma prenda
 * si el estilo no cambia nada). `layer` separa capas de la misma categoría.
 */
export function applyStyling(
  build: GarmentBuild,
  modelKey: string,
  styling: Styling,
  body: Body,
  ctx: OutfitContext,
  layer: number,
): GarmentBuild {
  if (!stylingNeeded(modelKey, styling, ctx)) return build;
  const fields: VertexField[] = [];
  const isTop = ['tshirt', 'shirt', 'sweater', 'dress', 'jacket', 'coat'].includes(modelKey);
  const all = build.parts.map((p) => p.geometry.getAttribute('position') as THREE.BufferAttribute);
  const armAttrs = build.parts.map((p) => (p.geometry.getAttribute('armW') as THREE.BufferAttribute | undefined) ?? null);
  const v = new THREE.Vector3();

  // Hasta dónde llega la manga en cada lado (parámetro del brazo). Hay manga
  // a una altura del brazo si la tela lo rodea (no basta con que el bajo de
  // la prenda quede junto a la mano).
  const tMax: [number, number] = [0, 0];
  if (isTop) {
    const TB = 0.05;
    const NB = Math.ceil(1.05 / TB);
    const cover = [new Uint8Array(NB), new Uint8Array(NB)];
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const r = new THREE.Vector3();
    all.forEach((pos, pi) => {
      const aws = armAttrs[pi];
      for (let i = 0; i < pos.count; i++) {
        if (aws && aws.getX(i) < 0.5) continue;
        v.fromBufferAttribute(pos, i);
        const side: 0 | 1 = v.x >= 0 ? 0 : 1;
        const h = armHit(body, side, v.x, v.y, v.z);
        if (h.d > 0.1 || h.t < 0) continue;
        const { dir } = armAxis(body, side, Math.min(1, h.t));
        e1.set(0, 0, 1).cross(dir).normalize();
        e2.crossVectors(dir, e1);
        r.set(h.rx, h.ry, h.rz);
        const ang = Math.atan2(r.dot(e2), r.dot(e1));
        const sector = ((Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8) % 8) + 8) % 8;
        const tb = Math.min(NB - 1, Math.floor(h.t / TB));
        cover[side][tb] |= 1 << sector;
      }
    });
    for (const side of [0, 1] as const) {
      let gaps = 0;
      for (let tb = 2; tb < NB; tb++) {
        let bits = 0;
        for (let m = cover[side][tb]; m; m >>= 1) bits += m & 1;
        if (bits >= 5) {
          tMax[side] = (tb + 1) * TB;
          gaps = 0;
        } else if (++gaps > 1) break;
      }
    }
  }
  /**
   * Peso de manga (1) frente a tronco (0): más cerca del brazo que del tronco
   * y dentro del largo de la manga (así el bajo de una camiseta de manga
   * corta, junto a la mano, sigue siendo tronco).
   */
  const armWeight = (p: THREE.Vector3, aw: number | null = null): number => {
    if (aw !== null) return aw;
    const side: 0 | 1 = p.x >= 0 ? 0 : 1;
    const h = armHit(body, side, p.x, p.y, p.z);
    if (h.t > tMax[side] + 0.03 || h.d > 0.1) return 0;
    const tor = torsoInfo(body, p.x, p.y, p.z);
    return smooth(0.012, -0.012, h.d - tor.d + 0.004);
  };

  // Mangas remangadas o subidas
  if (isTop && styling.sleeves && styling.sleeves !== 'down') {
    const rolled = styling.sleeves === 'rolled';
    // Contorno de cada manga (radio máximo por tramo del brazo): toda la tela
    // de un tramo se escala igual, así no se juntan sus dos caras.
    const SB = 0.025;
    const NS = Math.ceil(1.05 / SB);
    const sleeveEnv = [new Float32Array(NS), new Float32Array(NS)];
    all.forEach((pos, pi) => {
      const aws = armAttrs[pi];
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (armWeight(v, aws ? aws.getX(i) : null) < 0.5) continue;
        const side: 0 | 1 = v.x >= 0 ? 0 : 1;
        const h = armHit(body, side, v.x, v.y, v.z);
        const k = Math.min(NS - 1, Math.max(0, Math.floor(h.t / SB)));
        const r = Math.hypot(h.rx, h.ry, h.rz);
        if (r > sleeveEnv[side][k]) sleeveEnv[side][k] = r;
      }
    });
    const envAt = (side: 0 | 1, t: number) => {
      const k = Math.min(NS - 1, Math.max(0, Math.floor(t / SB)));
      return Math.max(sleeveEnv[side][Math.max(0, k - 1)], sleeveEnv[side][k], sleeveEnv[side][Math.min(NS - 1, k + 1)]);
    };
    fields.push({
      apply: (p, aw) => {
        const side: 0 | 1 = p.x >= 0 ? 0 : 1;
        const end = tMax[side];
        if (end < 0.12) return none; // sin manga
        const w = armWeight(p, aw);
        if (w <= 0) return none;
        const h = armHit(body, side, p.x, p.y, p.z);
        const long = end > 0.7;
        const newEnd = long ? (rolled ? 0.64 : 0.58) : Math.max(0.1, end - 0.06);
        const band = rolled ? (long ? 0.09 : 0.06) : 0.16;
        const a = Math.max(0.04, newEnd - band);
        if (h.t <= a || end <= newEnd) return none;
        const t2 = a + ((h.t - a) * (newEnd - a)) / (end - a);
        const k = (h.t - a) / Math.max(1e-4, end - a); // 0 al inicio de la zona, 1 al final
        const { p: axis, dir } = armAxis(body, side, t2);
        const rv = new THREE.Vector3(h.rx, h.ry, h.rz);
        rv.addScaledVector(dir, -rv.dot(dir));
        // Radio exterior deseado: el brazo más la tela enrollada o arrugada.
        const armR = body.arms[side].radius(Math.max(0, t2));
        const ripple = rolled ? 0 : 0.006 * Math.sin(k * Math.PI * 6);
        const outerNow = Math.max(envAt(side, h.t), 1e-3);
        const outerBefore = Math.max(envAt(side, t2), armR + 0.008);
        const startR = outerBefore; // donde empieza la zona, la manga sigue como estaba
        const endR = armR + (rolled ? 0.02 : 0.024);
        const outer = startR + (endR - startR) * smooth(0, rolled ? 0.35 : 0.25, k) + ripple * smooth(0, 0.2, k);
        const np = axis.addScaledVector(rv, outer / outerNow);
        p.lerp(np, w);
        return none;
      },
    });
  }

  // Por dentro / medio metida / de un lado
  if (isTop && modelKey !== 'dress' && styling.tuck && styling.tuck !== 'out' && ctx.waistY !== null) {
    const wy = ctx.waistY;
    const mode = styling.tuck;
    // Contorno exterior de la prenda por altura y ángulo: se ciñe todo el
    // grosor de la tela con el mismo factor (si cada vértice se llevara al
    // cuerpo por separado, la cara exterior y la interior se juntarían).
    const Y0 = wy - 0.3;
    const YB = 0.015;
    const NY = 32;
    const NA = 36;
    const env = new Float32Array(NY * NA);
    const angOf = (xn: number, zn: number) => (Math.atan2(zn, xn) + Math.PI) / (Math.PI * 2); // 0..1
    all.forEach((pos, pi) => {
      const aws = armAttrs[pi];
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (v.y < Y0 || v.y > wy + 0.17) continue;
        if (armWeight(v, aws ? aws.getX(i) : null) > 0.5) continue;
        const tor = torsoInfo(body, v.x, v.y, v.z);
        const iy = Math.min(NY - 1, Math.floor((v.y - Y0) / YB));
        const ia = Math.min(NA - 1, Math.floor(angOf(tor.xn, tor.zn) * NA));
        const k = iy * NA + ia;
        if (tor.q > env[k]) env[k] = tor.q;
      }
    });
    // Contorno suave: máximo de las celdas vecinas y luego media, para que no
    // haya escalones (dejaban picos en los pliegues).
    const at = (iy: number, ia: number) => env[Math.min(NY - 1, Math.max(0, iy)) * NA + (((ia % NA) + NA) % NA)];
    const envMax = new Float32Array(NY * NA);
    for (let iy = 0; iy < NY; iy++)
      for (let ia = 0; ia < NA; ia++) {
        let m = 0;
        for (let dy = -1; dy <= 1; dy++) for (let da = -1; da <= 1; da++) m = Math.max(m, at(iy + dy, ia + da));
        envMax[iy * NA + ia] = m;
      }
    const atM = (iy: number, ia: number) => envMax[Math.min(NY - 1, Math.max(0, iy)) * NA + (((ia % NA) + NA) % NA)];
    const envS = new Float32Array(NY * NA);
    for (let iy = 0; iy < NY; iy++)
      for (let ia = 0; ia < NA; ia++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) for (let da = -1; da <= 1; da++) sum += atM(iy + dy, ia + da);
        envS[iy * NA + ia] = sum / 9;
      }
    const atS = (iy: number, ia: number) => envS[Math.min(NY - 1, Math.max(0, iy)) * NA + (((ia % NA) + NA) % NA)];
    const envAt = (y: number, xn: number, zn: number) => {
      const fy = (y - Y0) / YB - 0.5;
      const fa = angOf(xn, zn) * NA - 0.5;
      const iy = Math.floor(fy);
      const ia = Math.floor(fa);
      const ty = Math.min(1, Math.max(0, fy - iy));
      const ta = fa - ia;
      const a0 = atS(iy, ia) + (atS(iy, ia + 1) - atS(iy, ia)) * ta;
      const a1 = atS(iy + 1, ia) + (atS(iy + 1, ia + 1) - atS(iy + 1, ia)) * ta;
      return a0 + (a1 - a0) * ty;
    };
    fields.push({
      apply: (p, aw) => {
        if (p.y > wy + 0.14) return none;
        const tor = torsoInfo(body, p.x, p.y, p.z);
        const torso = 1 - armWeight(p, aw);
        if (torso <= 0) return none;
        let m = 1;
        if (mode === 'half') m = smooth(-0.3, 0.6, tor.zn) * smooth(1.25, 0.0, Math.abs(tor.xn));
        else if (mode === 'side') m = smooth(0.65, -0.55, tor.xn) * smooth(-0.85, 0.1, tor.zn);
        m *= torso;
        if (m <= 0.001) return none;
        const y0 = p.y;
        // Medio metida: donde solo se mete en parte, el bajo sube hacia la
        // cintura en diagonal, como la tela que tira desde dentro.
        if (m < 0.999 && p.y < wy - 0.012) p.y += (wy - 0.015 - p.y) * 0.9 * smooth(0.12, 0.95, m);
        const outer = envAt(y0, tor.xn, tor.zn);
        const target = 1 + (0.003 + 0.004 * layer) / Math.min(tor.rx, tor.rz);
        // Ceñida del todo justo bajo la pretina; por encima vuelve poco a poco
        // a su forma (una transición corta dejaba la tela arrugada en picos).
        const c = smooth(wy + 0.08, wy + 0.006, p.y) * m;
        // Se mete hacia dentro la MISMA distancia toda la tela de ese punto
        // (cara exterior e interior), así conserva su grosor y nunca queda
        // dentro del cuerpo.
        const inward = Math.max(0, outer - target) * c;
        let qNew = Math.max(tor.q - inward, Math.min(tor.q, target - 0.02));
        // Donde ya va del todo por dentro, ningún pliegue puede sobresalir.
        if (c > 0.9) qNew = Math.min(qNew, target);
        let k = tor.q > 1e-4 ? qNew / tor.q : 1;
        // Tela ahuecada justo por encima de la cintura
        const blouse = m * Math.exp(-(((p.y - (wy + 0.035)) / 0.025) ** 2)) * 0.007;
        k *= 1 + blouse / Math.max(0.05, outer * Math.min(tor.rx, tor.rz));
        p.x *= k;
        p.z *= k;
        const hidden = m > 0.85 && y0 < wy - 0.02;
        // Lo que queda dentro del pantalón se aplasta justo bajo la pretina:
        // con mallas ligeras (triángulos grandes), un triángulo con un vértice
        // escondido muy abajo cruzaba la pretina y se veían picos de tela.
        if (m > 0.85 && y0 < wy - 0.012) {
          p.y = wy - 0.016 - (wy - 0.012 - p.y) * 0.04;
          const kIn = tor.q > 1e-4 ? Math.min(1, (target - 0.015) / (tor.q * k)) : 1;
          p.x *= kIn;
          p.z *= kIn;
        }
        return { hidden, split: 0 };
      },
    });
  }

  // Pantalón bajo una parte de arriba por fuera: lo que queda tapado se ciñe
  // al cuerpo (si no, bolsillos y cadera atraviesan la camiseta).
  if (BOTTOMS.includes(modelKey) && ctx.coverY != null) {
    const yLow = ctx.coverY + 0.004;
    const Y0 = yLow;
    const YB = 0.015;
    const NY = 24;
    const NA = 36;
    const env = new Float32Array(NY * NA);
    const angOf = (xn: number, zn: number) => (Math.atan2(zn, xn) + Math.PI) / (Math.PI * 2);
    for (const pos of all) {
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (v.y < Y0) continue;
        const tor = torsoInfo(body, v.x, v.y, v.z);
        const iy = Math.min(NY - 1, Math.floor((v.y - Y0) / YB));
        const ia = Math.min(NA - 1, Math.floor(angOf(tor.xn, tor.zn) * NA));
        if (tor.q > env[iy * NA + ia]) env[iy * NA + ia] = tor.q;
      }
    }
    const at = (iy: number, ia: number) => env[Math.min(NY - 1, Math.max(0, iy)) * NA + (((ia % NA) + NA) % NA)];
    const envAt = (y: number, xn: number, zn: number) => {
      const iy = Math.floor((y - Y0) / YB);
      const ia = Math.floor(angOf(xn, zn) * NA);
      let m = 0;
      for (let dy = -1; dy <= 1; dy++) for (let da = -1; da <= 1; da++) m = Math.max(m, at(iy + dy, ia + da));
      return m;
    };
    fields.push({
      apply: (p) => {
        if (p.y < yLow - 0.004) return none;
        const tor = torsoInfo(body, p.x, p.y, p.z);
        const c = smooth(yLow - 0.004, yLow + 0.022, p.y);
        const outer = Math.max(tor.q, envAt(p.y, tor.xn, tor.zn));
        const target = 1 + (0.007 + 0.003 * layer) / Math.min(tor.rx, tor.rz);
        const inward = Math.max(0, outer - target) * c;
        const qNew = Math.max(tor.q - inward, Math.min(tor.q, target - 0.015));
        const k = tor.q > 1e-4 ? qNew / tor.q : 1;
        p.x *= k;
        p.z *= k;
        return none;
      },
    });
  }

  // Delantera abierta / cerrada / desabrochada arriba
  if (isTop && styling.front && (modelKey === 'shirt' || modelKey === 'jacket' || modelKey === 'coat')) {
    // Solo en los modelos de la biblioteca con la delantera abierta (las dos
    // mitades son piezas separadas); en los generados por código la
    // delantera es una sola superficie y abrirla la rompería.
    const file = build.library?.entry.file;
    const gap = file ? FRONT_GAP[file] ?? 0 : 0;
    const canOpen = gap > 0;
    const yNeck = body.y.neck - 0.025 * body.s;
    const front = styling.front;
    if (canOpen) {
      fields.push({
        apply: (p, aw) => {
          // Lo que está en el centro (tapeta, botones) va con la mitad derecha
          // de la imagen: así un botón no se parte en dos.
          const side: 0 | 1 = p.x >= -0.013 ? 0 : 1;
          const sgn = side === 0 ? 1 : -1;
          const tor = torsoInfo(body, p.x, p.y, p.z);
          const torso = 1 - armWeight(p, aw);
          const fm = smooth(-0.15, 0.25, tor.zn) * torso;
          if (fm <= 0 || p.y > yNeck + 0.06) return none;
          // Cerrar: las dos mitades se juntan en el centro.
          let close = 0;
          if (gap > 0) {
            const closing = front === 'closed' ? 1 : front === 'top_open' ? smooth(body.y.chest + 0.07, body.y.chest - 0.02, p.y) : 0;
            close = closing * (gap / 2 - 0.001) * smooth(0.14, 0.02, Math.abs(p.x)) * fm;
          }
          // Abrir: cada mitad gira sobre el costado.
          let angle = 0;
          if (front === 'open') angle = 0.3 * smooth(yNeck + 0.02, yNeck - 0.1, p.y);
          else if (front === 'top_open') angle = 0.28 * smooth(yNeck + 0.02, yNeck - 0.05, p.y) * smooth(body.y.chest - 0.03, body.y.chest + 0.08, p.y);
          let split = 0;
          if (angle > 0) {
            const lat = smooth(tor.rx * 0.95, tor.rx * 0.45, Math.abs(p.x)) * fm;
            const ax = sgn * tor.rx * 0.92;
            const a = angle * sgn * lat;
            const dx = p.x - ax;
            const dz = p.z;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            p.x = ax + dx * ca + dz * sa;
            p.z = -dx * sa + dz * ca;
            split = fm > 0.4 && Math.abs(p.x + 0.013) < 0.06 ? 1 : 0;
          }
          p.x -= sgn * close;
          return { hidden: false, split };
        },
      });
    }
  }

  // Capucha bajada: la capucha (todo lo que queda por encima de la base del
  // cuello) gira hacia atrás sobre la nuca y se recoge sobre la espalda.
  const hoodFile = build.library?.entry.file;
  if (isTop && styling.hood === 'down' && hoodFile && HOOD_UP.has(hoodFile)) {
    const yb = body.y.neck - 0.012 * body.s; // donde empieza a girar
    const span = 0.035; // transición (la tela se dobla, no se parte)
    const secN = body.section(body.y.neck);
    const zc = (secN.rzf - secN.rzb) / 2; // eje del cuello (+z es el frente)
    const pz = zc - 0.035; // eje de giro, hacia la nuca
    const theta = 2.5; // ~143°: la coronilla acaba sobre la espalda
    const clear = 0.012 + 0.007 * layer;
    const K = 0.25; // grosor del bulto de la capucha recogida (fracción de su fondo)
    const weight = (p: THREE.Vector3, aw: number | null) => smooth(yb, yb + span, p.y) * (1 - (aw ?? 0));
    const rotate = (p: THREE.Vector3, w: number) => {
      // 1) Los bordes de la cara (delante) rodean el cuello hacia los lados:
      //    el ángulo alrededor del cuello se cierra hacia la nuca.
      const dzc = p.z - zc;
      const r = Math.hypot(p.x, dzc);
      const phi = Math.atan2(p.x, -dzc) * (1 - 0.45 * w);
      const x = r * Math.sin(phi);
      const z = zc - r * Math.cos(phi);
      // 2) Se dobla hacia atrás sobre la nuca.
      //    Cerca del cuello cada punto gira sobre sí mismo (el borde se dobla
      //    hacia fuera como un cuello, sin levantarse); más arriba, toda la
      //    capucha gira sobre la nuca.
      const a = theta * w;
      const dy = p.y - yb;
      const piv = z - 0.012 + (pz - (z - 0.012)) * smooth(0.0, 0.09, dy);
      const dz = z - piv;
      return { x, y: yb + dy * Math.cos(a) + dz * Math.sin(a), z: piv - dy * Math.sin(a) + dz * Math.cos(a) };
    };
    // Por alturas (ya girada), lo más cercano al cuerpo: ahí se apoya la capucha
    const B0 = yb - 0.4;
    const BAND = 0.01;
    const NB = 60;
    const front = new Float64Array(NB).fill(-Infinity);
    all.forEach((pos, pi) => {
      const aws = armAttrs[pi];
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const w = weight(v, aws ? aws.getX(i) : null);
        if (w < 0.02) continue;
        const r = rotate(v, w);
        const b = Math.min(NB - 1, Math.max(0, Math.floor((r.y - B0) / BAND)));
        front[b] = Math.max(front[b], r.z);
      }
    });
    const frontAt = (y: number) => {
      const b = Math.min(NB - 1, Math.max(0, Math.floor((y - B0) / BAND)));
      let m = -Infinity;
      for (let k = Math.max(0, b - 2); k <= Math.min(NB - 1, b + 2); k++) m = Math.max(m, front[k]);
      return m;
    };
    fields.push({
      apply: (p, aw) => {
        const w = weight(p, aw);
        if (w <= 0) return none;
        const r = rotate(p, w);
        // Espalda del maniquí a esa altura (+z es el frente)
        const back = -body.section(Math.min(r.y, body.y.neck)).rzb - clear;
        const f = frontAt(r.y);
        const target = Number.isFinite(f) ? back - (f - r.z) * K : Math.min(r.z, back);
        const c = smooth(0.4, 1, w); // se recoge sobre la espalda una vez doblada
        p.x = r.x * (1 + 0.15 * c);
        p.y = r.y;
        p.z = Math.min(r.z + (target - r.z) * c, w > 0.2 ? back : Infinity);
        return none;
      },
    });
  }

  // Bajo (pantalón y pantalón corto) y metido en las botas
  const legs = modelKey === 'pants' || modelKey === 'shorts';
  if (legs && styling.boots === 'in' && ctx.bootTop !== null && modelKey === 'pants') {
    const bt = ctx.bootTop;
    fields.push({
      apply: (p) => {
        if (p.y > bt + 0.12 || p.y > body.y.crotch - 0.05) return none;
        const side: 0 | 1 = p.x >= 0 ? 0 : 1;
        const ax = legAxis(body, side, p.y);
        const dx = p.x - ax.x;
        const dz = p.z - ax.z;
        const r = Math.hypot(dx, dz);
        if (r < 1e-5) return none;
        const target = ax.r + 0.004 + 0.003 * layer;
        const c = smooth(bt + 0.04, bt - 0.01, p.y);
        let k = r > target ? 1 + (target / r - 1) * c : 1;
        // Tela acumulada sobre la caña
        k *= 1 + (0.012 / r) * Math.exp(-(((p.y - (bt + 0.05)) / 0.03) ** 2));
        p.x = ax.x + dx * k;
        p.z = ax.z + dz * k;
        return { hidden: p.y < bt - 0.04, split: 0 };
      },
    });
  } else if (legs && styling.hem && styling.hem !== 'normal') {
    const hem: [number, number] = [Infinity, Infinity];
    for (const pos of all) {
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (v.y > body.y.crotch - 0.03) continue;
        const side = v.x >= 0 ? 0 : 1;
        if (v.y < hem[side]) hem[side] = v.y;
      }
    }
    const rolled = styling.hem === 'rolled';
    const long = modelKey === 'pants';
    const d = rolled ? (long ? 0.17 : 0.05) : long ? 0.04 : 0.025;
    const L = rolled ? (long ? 0.28 : 0.1) : long ? 0.11 : 0.07;
    const bandH = rolled ? (long ? 0.065 : 0.04) : long ? 0.04 : 0.03;
    fields.push({
      apply: (p) => {
        const side: 0 | 1 = p.x >= 0 ? 0 : 1;
        const h0 = hem[side];
        if (!Number.isFinite(h0) || p.y > h0 + L || p.y > body.y.crotch - 0.03) return none;
        const y2 = h0 + d + ((p.y - h0) * (L - d)) / L;
        const a0 = legAxis(body, side, p.y);
        const a1 = legAxis(body, side, y2);
        const k = a1.r / Math.max(0.01, a0.r);
        const dx = (p.x - a0.x) * k;
        const dz = (p.z - a0.z) * k;
        const r = Math.max(1e-5, Math.hypot(dx, dz));
        const inBand = smooth(h0 + d - 0.004, h0 + d + 0.006, y2) * smooth(h0 + d + bandH + 0.006, h0 + d + bandH - 0.004, y2);
        const thick = (rolled ? 0.007 : 0.0045) + (rolled ? 0.0025 * Math.sin(((y2 - h0 - d) / bandH) * Math.PI * 3) : 0);
        const kb = 1 + (thick * inBand) / r;
        p.set(a1.x + dx * kb, y2, a1.z + dz * kb);
        return none;
      },
    });
  }

  // Gorra: visera hacia atrás o de lado
  if (modelKey === 'cap' && styling.visor && styling.visor !== 'forward') {
    const angle = styling.visor === 'backward' ? Math.PI : -1.25;
    const { cx, cz, a: ea, b: eb } = capFrame(body);
    // Radio de la cabeza (elipse, más larga que ancha) en la dirección (x, z).
    const er = (x: number, z: number) => 1 / Math.hypot(x / ea, z / eb);
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    // El borde de la gorra no va a la misma altura alrededor de la cabeza:
    // sube en la frente y baja en la nuca (~2 cm cada uno). Al girarla, cada
    // punto toma la altura del sitio al que llega: la visera hacia atrás baja
    // hasta la nuca y la abertura de la tira sube a la frente. La copa, arriba,
    // no se mueve.
    const tilt = 0.021 * body.s;
    const top = body.y.crown;
    fields.push({
      apply: (p) => {
        const x = p.x - cx;
        const z = p.z - cz;
        const rho = Math.hypot(x, z);
        let nx = x * ca + z * sa;
        let nz = -x * sa + z * ca;
        if (rho > 1e-4) {
          p.y += tilt * ((nz - z) / rho) * smooth(top, top - 0.09 * body.s, p.y);
          // De lado, la copa (larga de delante a atrás) se adapta a la cabeza.
          const k = er(nx, nz) / er(x, z);
          nx *= k;
          nz *= k;
        }
        p.x = nx + cx;
        p.z = nz + cz;
        return none;
      },
    });
  }

  if (!fields.length) return build;

  const parts = build.parts.map((part) => {
    const g = part.geometry.clone();
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const aws = g.getAttribute('armW') as THREE.BufferAttribute | undefined;
    const hidden = new Uint8Array(pos.count);
    const split = new Uint8Array(pos.count);
    /** x original (para saber qué triángulos unían las dos mitades). */
    const x0 = new Float32Array(pos.count);
    const p = new THREE.Vector3();
    let moved = 0;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      x0[i] = p.x;
      const px = p.x;
      const py = p.y;
      const pz = p.z;
      const aw = aws ? aws.getX(i) : null;
      for (const f of fields) {
        const r = f.apply(p, aw);
        if (r.hidden) hidden[i] = 1;
        if (r.split) split[i] = 1;
      }
      moved = Math.max(moved, Math.abs(p.x - px) + Math.abs(p.y - py) + Math.abs(p.z - pz));
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    pos.needsUpdate = true;

    // Ocultamos los triángulos que quedan dentro (por dentro del pantalón o
    // de la bota) y los que unían las dos mitades de una delantera abierta.
    const index = g.getIndex();
    const n = index ? index.count : pos.count;
    const at = (k: number) => (index ? index.getX(k) : k);
    const keep: number[] = [];
    let dropped = 0;
    for (let t = 0; t + 2 < n; t += 3) {
      const a = at(t);
      const b = at(t + 1);
      const c = at(t + 2);
      const hid = hidden[a] + hidden[b] + hidden[c];
      const crosses =
        split[a] + split[b] + split[c] > 0 &&
        Math.min(x0[a], x0[b], x0[c]) < -0.013 &&
        Math.max(x0[a], x0[b], x0[c]) >= -0.013;
      if (hid >= 2 || crosses) {
        dropped++;
        continue;
      }
      keep.push(a, b, c);
    }
    if (dropped) g.setIndex(keep);
    if (moved > 0.0008 && !part.metal) g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return { ...part, geometry: g };
  });
  return { ...build, parts };
}

const none = { hidden: false, split: 0 };
/** Exponente de la superelipse del tronco (el mismo que en body.ts). */
const TORSO_N = 2.35;
