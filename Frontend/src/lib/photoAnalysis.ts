import { t } from '../i18n';
/**
 * Lectura de una foto de una prenda (motor propio, en el navegador: la foto no
 * sale del equipo y no se usa ningún servicio de IA externo).
 *
 * Funciona mejor con la prenda entera, de frente, sobre un fondo liso
 * (colgada, en el suelo o en una foto de producto). Pasos:
 *
 * 1. Recorte: el fondo se estima en el borde de la foto y se separa la prenda
 *    (o se usa la transparencia si la imagen la trae).
 * 2. Silueta: anchura y huecos por filas → perneras (pantalón, corto),
 *    mangas y su largo, capucha, largo total, si se ensancha hacia abajo
 *    (falda, vestido, abrigo) y la línea central (cremallera, botones o
 *    delantera abierta).
 * 3. Color: grupos de color (k-medias en Lab); el mayor es el color de la
 *    prenda.
 * 4. Estampado: si el segundo color ocupa toda la prenda, se mide si va en
 *    filas (rayas horizontales), columnas (verticales), las dos (cuadros) o en
 *    manchas (lunares), con su tamaño de repetición.
 * 5. Gráficos (logos, estampados, parches): zonas pequeñas de otro color; se
 *    recortan con fondo transparente para colocarlos como detalles.
 *
 * Todo es una aproximación: el resultado rellena el formulario y el usuario
 * puede corregir cualquier cosa antes de guardar.
 */

export interface Px {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type PatternGuess =
  | { kind: 'camo'; colors: string[]; color: string; periodRel: number; thickness: number }
  | { kind: 'stripes'; angle: 0 | 90; color: string; periodRel: number; thickness: number }
  | { kind: 'checks'; color: string; periodRel: number; thickness: number }
  | { kind: 'dots'; color: string; periodRel: number; thickness: number };

export interface GraphicRegion {
  /** Recuadro en la imagen de análisis (px). */
  box: Box;
  /** Centro y tamaño relativos al recuadro de la prenda (0–1). */
  u: number;
  v: number;
  w: number;
  h: number;
  color: string;
}

export interface ShapeInfo {
  box: Box;
  /** Alto / ancho del tronco. */
  torsoRatio: number;
  /** Alto / ancho total. */
  ratio: number;
  legs: number;
  /** 0 = sin manga; si no, hasta qué altura relativa llega la manga. */
  sleeveEnd: number;
  sleeveRatio: number;
  hood: boolean;
  /** El bajo es más ancho que el tronco (falda, vestido, abrigo con vuelo). */
  flare: number;
  /** Hueco o franja de otro color en el centro (delantera abierta). */
  openFront: boolean;
  /** Línea vertical en el centro (cremallera o tapeta). */
  frontLine: number;
  /** Botones en la línea central. */
  buttons: number;
  /** Cintura recta arriba (falda, pantalón). */
  waistband: boolean;
  /** Altura relativa de los hombros (por encima: cuello o capucha). */
  shoulder: number;
}

export interface PhotoGuess {
  modelKey: string | null;
  attributes: Record<string, string>;
  color: string;
  palette: string[];
  pattern: PatternGuess | null;
  graphics: GraphicRegion[];
  shape: ShapeInfo | null;
  notes: string[];
  /** Silueta de la prenda en la imagen de análisis (1 = prenda). */
  mask: Uint8Array;
  /** La foto es de una persona con la prenda puesta (se aisló la prenda). */
  worn: boolean;
}

// ---------------------------------------------------------------------------
// Color
// ---------------------------------------------------------------------------

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const LIN = Array.from({ length: 256 }, (_, i) => lin(i));
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToHex([L, a, b]: [number, number, number]): string {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t: number) => (t > 6 / 29 ? t * t * t : (108 / 841) * (t - 4 / 29));
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883;
  const R = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  const G = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  const B = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  const g = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0');
  };
  return `#${g(R)}${g(G)}${g(B)}`.toUpperCase();
}

const dE = (a: ArrayLike<number>, i: number, b: ArrayLike<number>, j: number) =>
  Math.hypot(a[i] - b[j], a[i + 1] - b[j + 1], a[i + 2] - b[j + 2]);

/** Lab de cada píxel (3 floats por píxel). */
export function labImage(img: Px): Float32Array {
  const n = img.w * img.h;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [L, a, b] = rgbToLab(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
    out[i * 3] = L;
    out[i * 3 + 1] = a;
    out[i * 3 + 2] = b;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Máscaras
// ---------------------------------------------------------------------------

/** Rellena los agujeros (lo que no se alcanza desde el borde sin cruzar la prenda). */
function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => {
    if (!mask[p] && !seen[p]) {
      seen[p] = 1;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = mask[i] || !seen[i] ? 1 : 0;
  return out;
}

function morph(mask: Uint8Array, w: number, h: number, r: number, grow: boolean): Uint8Array {
  // Separable (cuadrado de lado 2r+1)
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 1;
      for (let k = -r; k <= r; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        const m = mask[y * w + xx];
        if (grow ? m : !m) {
          v = grow ? 1 : 0;
          break;
        }
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = grow ? 0 : 1;
      for (let k = -r; k <= r; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        const m = tmp[yy * w + x];
        if (grow ? m : !m) {
          v = grow ? 1 : 0;
          break;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Ajuste por mínimos cuadrados de v = c0 + c1·x + c2·y (degradado de luz del fondo). */
function planeFit(xs: number[], ys: number[], vs: number[]): [number, number, number] {
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sv = 0, sxv = 0, syv = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], y = ys[i], v = vs[i];
    n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sv += v; sxv += x * v; syv += y * v;
  }
  // Resolver [n sx sy; sx sxx sxy; sy sxy syy] c = [sv sxv syv]
  const A = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]];
  const B = [sv, sxv, syv];
  const det = (m: number[][]) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (Math.abs(D) < 1e-9) return [sv / Math.max(1, n), 0, 0];
  const col = (k: number) => A.map((r, i) => r.map((v, j) => (j === k ? B[i] : v)));
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}

/** Separa la prenda del fondo. */
export function segment(img: Px, lab: Float32Array): { mask: Uint8Array; raw: Uint8Array; bg: [number, number, number] | null } | null {
  const { w, h, data } = img;
  const n = w * h;
  let transparent = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] < 24) transparent++;
  let mask: Uint8Array = new Uint8Array(n);
  let bgLab: [number, number, number] | null = null;
  if (transparent > n * 0.05) {
    for (let i = 0; i < n; i++) mask[i] = data[i * 4 + 3] > 128 ? 1 : 0;
  } else {
    // Fondo: los colores del marco de la foto.
    const band = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    const border: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x < band || y < band || x >= w - band || y >= h - band) border.push(y * w + x);
      }
    }
    const pts = new Float32Array(border.length * 3);
    border.forEach((p, k) => pts.set(lab.subarray(p * 3, p * 3 + 3), k * 3));
    const bg = kmeans(pts, 3, 12);
    const order = bg.sizes.map((sz, k) => [sz, k]).sort((x, y) => y[0] - x[0]);
    bgLab = bg.centers[order[0][1]];
    const dist = new Float32Array(n);
    if (order[0][0] > border.length * 0.8) {
      // Un solo fondo: se ajusta su degradado de luz (plano en x, y) y se mide la diferencia
      const k0 = order[0][1];
      const sel = border.filter((_, k) => bg.labels[k] === k0);
      const xs = sel.map((p) => (p % w) / w), ys = sel.map((p) => Math.floor(p / w) / h);
      const planes = [0, 1, 2].map((c) => planeFit(xs, ys, sel.map((p) => lab[p * 3 + c])));
      for (let i = 0; i < n; i++) {
        const x = (i % w) / w, y = Math.floor(i / w) / h;
        let d2 = 0;
        for (let c = 0; c < 3; c++) {
          const pl = planes[c];
          d2 += (lab[i * 3 + c] - (pl[0] + pl[1] * x + pl[2] * y)) ** 2;
        }
        dist[i] = Math.sqrt(d2);
      }
    } else {
      // Varios fondos (pared y suelo...): distancia al más parecido
      const centers = bg.centers.filter((_, k) => bg.sizes[k] > border.length * 0.12);
      for (let i = 0; i < n; i++) {
        let m = Infinity;
        for (const c of centers) m = Math.min(m, Math.hypot(lab[i * 3] - c[0], lab[i * 3 + 1] - c[1], lab[i * 3 + 2] - c[2]));
        dist[i] = m;
      }
    }
    const spread = border.map((p) => dist[p]).sort((x, y) => x - y);
    const T = Math.max(4.5, Math.min(30, spread[Math.floor(spread.length * 0.97)] * 1.5 + 2));
    for (let i = 0; i < n; i++) mask[i] = dist[i] > T ? 1 : 0;
  }
  mask = morph(morph(mask, w, h, 1, false), w, h, 1, true); // quita ruido
  // Piezas separadas grandes (rayas sobre un fondo parecido a la tela): se unen
  const comps = components(mask, w, h).filter((c) => c.area > n * 0.004);
  if (comps.length > 1) {
    const keep = new Set(comps.map((c) => c.id));
    const union = new Uint8Array(n);
    for (let i = 0; i < n; i++) union[i] = keep.has(compLabel[i]) ? 1 : 0;
    const r = Math.max(2, Math.round(Math.max(w, h) * 0.02));
    mask = morph(fillHoles(morph(union, w, h, r, true), w, h), w, h, r, false);
  }
  // La prenda puede quedar en varias piezas (delantera abierta con el fondo
  // por medio): se quedan las grandes respecto a la mayor
  const parts = components(mask, w, h);
  const biggest = parts.reduce((m, c) => Math.max(m, c.area), 0);
  const keepIds = new Set(parts.filter((c) => c.area >= biggest * 0.25).map((c) => c.id));
  for (let i = 0; i < n; i++) mask[i] = keepIds.has(compLabel[i]) ? 1 : 0;
  // Sin rellenar: lo que se ve del fondo por un hueco (entre la manga y el cuerpo)
  const raw = mask.slice();
  mask = fillHoles(mask, w, h);
  let area = 0;
  for (let i = 0; i < n; i++) area += mask[i];
  if (area < n * 0.04) return null; // no hay una prenda clara
  return { mask, raw, bg: bgLab };
}

let compLabel = new Int32Array(0);
function components(mask: Uint8Array, w: number, h: number): { id: number; area: number }[] {
  compLabel = new Int32Array(w * h).fill(-1);
  const out: { id: number; area: number }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || compLabel[s] >= 0) continue;
    const id = out.length;
    let area = 0;
    compLabel[s] = id;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop()!;
      area++;
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && mask[q] && compLabel[q] < 0) {
          compLabel[q] = id;
          stack.push(q);
        }
      }
    }
    out.push({ id, area });
  }
  return out;
}

export function bbox(mask: Uint8Array, w: number, h: number): Box {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x0, y0, x1, y1 };
}

// ---------------------------------------------------------------------------
// k-medias (determinista)
// ---------------------------------------------------------------------------

export function kmeans(pts: Float32Array, k: number, iters = 10): { centers: [number, number, number][]; sizes: number[]; labels: Uint8Array } {
  const n = pts.length / 3;
  const centers: [number, number, number][] = [];
  // k-means++ con semilla fija: el primero, el punto medio; los demás, los más lejanos
  centers.push([pts[Math.floor(n / 2) * 3], pts[Math.floor(n / 2) * 3 + 1], pts[Math.floor(n / 2) * 3 + 2]]);
  const dist = new Float32Array(n).fill(Infinity);
  while (centers.length < Math.min(k, n)) {
    const c = centers[centers.length - 1];
    let far = 0, farD = -1;
    for (let i = 0; i < n; i++) {
      const d = (pts[i * 3] - c[0]) ** 2 + (pts[i * 3 + 1] - c[1]) ** 2 + (pts[i * 3 + 2] - c[2]) ** 2;
      if (d < dist[i]) dist[i] = d;
      if (dist[i] > farD) {
        farD = dist[i];
        far = i;
      }
    }
    if (farD < 4) break;
    centers.push([pts[far * 3], pts[far * 3 + 1], pts[far * 3 + 2]]);
  }
  const labels = new Uint8Array(n);
  let sizes: number[] = [];
  for (let it = 0; it < iters; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = (pts[i * 3] - centers[c][0]) ** 2 + (pts[i * 3 + 1] - centers[c][1]) ** 2 + (pts[i * 3 + 2] - centers[c][2]) ** 2;
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      labels[i] = best;
      const s = sum[best];
      s[0] += pts[i * 3];
      s[1] += pts[i * 3 + 1];
      s[2] += pts[i * 3 + 2];
      s[3]++;
    }
    sizes = sum.map((s) => s[3]);
    sum.forEach((s, c) => {
      if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
    });
  }
  return { centers, sizes, labels };
}

// ---------------------------------------------------------------------------
// Silueta
// ---------------------------------------------------------------------------

interface Row {
  runs: [number, number][];
  span: number;
  fill: number;
}

function rows(mask: Uint8Array, w: number, b: Box): Row[] {
  const W = b.x1 - b.x0 + 1;
  const minRun = Math.max(2, Math.round(W * 0.015));
  const out: Row[] = [];
  for (let y = b.y0; y <= b.y1; y++) {
    const runs: [number, number][] = [];
    let start = -1, fill = 0;
    for (let x = b.x0; x <= b.x1 + 1; x++) {
      const on = x <= b.x1 && mask[y * w + x] === 1;
      if (on) fill++;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= minRun) runs.push([start, x - 1]);
        start = -1;
      }
    }
    // Huecos de 1–2 px dentro de la prenda (costuras oscuras) no separan piezas
    const merged: [number, number][] = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && r[0] - last[1] <= 2) last[1] = r[1];
      else merged.push([r[0], r[1]]);
    }
    out.push({ runs: merged, span: merged.length ? merged[merged.length - 1][1] - merged[0][0] + 1 : 0, fill });
  }
  return out;
}

const median = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function shapeOf(mask: Uint8Array, lab: Float32Array, w: number, h: number, mainLab: [number, number, number]): ShapeInfo {
  const b = bbox(mask, w, h);
  const W = b.x1 - b.x0 + 1;
  const H = b.y1 - b.y0 + 1;
  const R = rows(mask, w, b);
  const N = R.length;
  const idx = (t: number) => Math.min(N - 1, Math.max(0, Math.round(t * (N - 1))));
  const range = (t0: number, t1: number) => R.slice(idx(t0), idx(t1) + 1);
  // Eje: el centro de masas (más fiable que el recuadro si una manga cae más que la otra)
  let sx = 0, cnt = 0;
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (mask[y * w + x]) { sx += x; cnt++; }
  const cx = sx / Math.max(1, cnt);
  const filledAt = (r: Row) => r.runs.some((q) => q[0] <= cx && q[1] >= cx);

  /** Tramo central de la fila: el que pasa por el eje; si el eje cae en un hueco estrecho, los dos de al lado juntos. */
  const trunk = (r: Row): [number, number] | null => {
    const mid = r.runs.find((q) => q[0] <= cx + 1 && q[1] >= cx - 1);
    if (mid) return mid;
    const left = [...r.runs].reverse().find((q) => q[1] < cx);
    const right = r.runs.find((q) => q[0] > cx);
    if (left && right && right[0] - left[1] < W * 0.2) return [left[0], right[1]];
    return null;
  };
  const trunkW = (r: Row) => {
    const t = trunk(r);
    return t ? t[1] - t[0] + 1 : 0;
  };

  // Perneras: arriba la cintura llena el eje; abajo, el eje queda en un hueco
  // entre dos tramos anchos (las mangas sueltas son estrechas y están lejos).
  const waistFull = range(0.02, 0.22).filter(filledAt).length / Math.max(1, range(0.02, 0.22).length);
  const lowRows = range(0.68, 0.95);
  const legRows = lowRows.filter((r) => {
    if (filledAt(r)) return false;
    const left = [...r.runs].reverse().find((q) => q[1] < cx);
    const right = r.runs.find((q) => q[0] > cx);
    if (!left || !right) return false;
    const lw = left[1] - left[0] + 1, rw = right[1] - right[0] + 1;
    return lw > W * 0.17 && rw > W * 0.17 && right[0] - left[1] < W * 0.4;
  }).length / Math.max(1, lowRows.length);
  const legs = waistFull > 0.8 ? legRows : legRows * 0.3;

  // Tronco: de las filas de abajo, de las más estrechas (con los brazos pegados
  // al cuerpo, en las de arriba el tramo central los incluye)
  const tw = range(0.3, 0.92).map(trunkW).filter((x) => x > 0).sort((a, b2) => a - b2);
  const torso = tw[Math.floor(tw.length * 0.2)] || W * 0.6;
  // Hombros: primera fila tan ancha como el tronco (por encima: cuello, capucha)
  let ts = 0;
  for (let i = 0; i < N; i++) if (R[i].span >= torso * 0.8) { ts = i / (N - 1); break; }
  // Bajo del cuerpo: la última fila con tramo central ancho
  let th = 1;
  for (let i = N - 1; i >= 0; i--) if (trunkW(R[i]) > torso * 0.6) { th = i / (N - 1); break; }

  // Mangas: tela a los lados del tronco, o filas mucho más anchas que él. La
  // manga es el primer tramo seguido de esas filas desde el hombro (huecos
  // cortos permitidos); lo que asome más abajo (un bajo irregular) no cuenta.
  let sleeveEnd = 0, armRows = 0, miss = 0;
  const top = Math.max(...range(ts, ts + 0.3).map((r) => r.span));
  for (let i = idx(ts); i < N; i++) {
    const r = R[i];
    const t = trunk(r);
    const outside = t ? r.runs.filter((q) => q[1] < t[0] - 1 || q[0] > t[1] + 1).reduce((acc, q) => acc + q[1] - q[0] + 1, 0) : 0;
    const wide = t ? t[1] - t[0] + 1 > torso * 1.2 : false;
    if (outside > W * 0.04 || wide) {
      sleeveEnd = i / (N - 1);
      armRows++;
      miss = 0;
    } else if (armRows > 0 && ++miss > N * 0.04) break;
    else if (armRows === 0 && i / (N - 1) > ts + 0.35) break;
  }
  if (armRows < N * 0.05) sleeveEnd = 0;
  const sleeveRatio = top / torso;
  // Largo de la manga relativo al cuerpo (hombro → bajo)
  const sleeveRel = sleeveEnd ? (sleeveEnd - ts) / Math.max(0.05, th - ts) : 0;

  // Capucha: por encima de los hombros, una cúpula centrada y estrecha
  const crown = R.slice(0, idx(ts));
  // (sin el último cuarto, donde ya empiezan los hombros)
  const crownMax = crown.slice(0, Math.ceil(crown.length * 0.75)).reduce((m, r) => Math.max(m, r.span), 0);
  const hood =
    ts > 0.15 &&
    crown.length > 3 &&
    R[idx(ts + 0.03)].span > crownMax * 1.45 &&
    crown.filter((r) => r.runs.length === 1 && Math.abs((r.runs[0][0] + r.runs[0][1]) / 2 - cx) < W * 0.1 && r.span < torso * 0.8).length >
      crown.filter((r) => r.runs.length > 0).length * 0.7;

  const bottom = median(range(Math.max(ts, th - 0.08), th).map(trunkW).filter((x) => x > 0)) || torso;
  const flare = bottom / torso;
  // Cintura: el borde de arriba ya es ancho y recto (sin tirantes ni escote)
  const topRows = range(0, 0.04).filter((r) => r.runs.length > 0);
  const waistband =
    sleeveEnd === 0 &&
    topRows.length > 0 &&
    topRows.every((r) => r.runs.length === 1 && r.span > W * 0.45) &&
    topRows[0].span > topRows[topRows.length - 1].span * 0.85;

  // Centro: hueco o franja distinta (delantera abierta), línea (cremallera, tapeta) y botones
  let gapRows = 0, lineRows = 0, considered = 0;
  const marks: number[] = [];
  const half = Math.max(2, Math.round(W * 0.03));
  const x0 = Math.round(cx - half), x1 = Math.round(cx + half);
  const cols = x1 - x0 + 1;
  for (let i = idx(ts + 0.08); i <= idx(th - 0.05); i++) {
    const y = b.y0 + i;
    considered++;
    let off = 0, bgPx = 0, spot = 0, edge = 0;
    for (let x = x0; x <= x1; x++) {
      const p = y * w + x;
      if (!mask[p]) bgPx++;
      else {
        const d = dE(lab, p * 3, mainLab, 0);
        if (d > 22) off++;
        if (d > 16) spot++;
        if (x < x1 && mask[p + 1]) edge = Math.max(edge, Math.abs(lab[p * 3] - lab[(p + 1) * 3]));
      }
    }
    if (bgPx + off > cols * 0.6) gapRows++;
    if (edge > 8) lineRows++;
    marks.push(spot > 0 && spot < cols * 0.8 ? 1 : 0);
  }
  // Grupos cortos de filas con mancha, separados por tela: botones
  let buttons = 0;
  for (let i = 0, run = 0; i <= marks.length; i++) {
    if (i < marks.length && marks[i]) run++;
    else {
      if (run > 0 && run < H * 0.035) buttons++;
      run = 0;
    }
  }
  const openFront = gapRows / Math.max(1, considered) > 0.6 && legs < 0.5;
  return {
    box: b,
    torsoRatio: ((th - ts) * H) / torso,
    ratio: H / W,
    legs,
    sleeveEnd: sleeveRel,
    sleeveRatio,
    hood,
    flare,
    openFront,
    frontLine: lineRows / Math.max(1, considered),
    buttons,
    waistband,
    shoulder: ts,
  };
}

// ---------------------------------------------------------------------------
// Clasificación
// ---------------------------------------------------------------------------

export function classify(s: ShapeInfo): { modelKey: string | null; attributes: Record<string, string>; notes: string[] } {
  const notes: string[] = [];
  const attributes: Record<string, string> = {};
  // s.sleeveEnd: largo de la manga relativo al cuerpo (hombro → bajo)
  const rel = s.sleeveEnd;
  const sleeve = rel === 0 ? 'sleeveless' : rel < 0.5 ? 'short' : rel < 0.68 ? 'three_quarter' : 'long';
  const sleeveLabel = { sleeveless: t('sin mangas'), short: t('manga corta'), three_quarter: t('manga tres cuartos'), long: t('manga larga') }[sleeve];

  if (s.legs > 0.45) {
    if (s.ratio > 1.4) {
      notes.push(t('Dos perneras largas: pantalón.'));
      return { modelKey: 'pants', attributes, notes };
    }
    attributes.length = s.ratio < 0.85 ? 'short' : s.ratio < 1.1 ? 'mid' : 'bermuda';
    notes.push(t('Dos perneras cortas: pantalón corto.'));
    return { modelKey: 'shorts', attributes, notes };
  }
  if (sleeve === 'sleeveless' && s.waistband && s.flare > 1.05) {
    attributes.length = s.ratio < 0.95 ? 'mini' : s.ratio < 1.5 ? 'midi' : 'maxi';
    notes.push(t('Cintura recta arriba que se abre hacia abajo: falda.'));
    return { modelKey: 'skirt', attributes, notes };
  }
  const front = s.openFront || s.frontLine > 0.6 || s.buttons >= 4;
  const closure = s.openFront ? 'open' : s.buttons >= 4 ? 'buttons' : 'zip';
  if (s.hood) {
    attributes.neckline = front ? 'hoodie_zip' : 'hoodie';
    notes.push(t('Capucha{v}: sudadera.', { v: front ? t(' y cremallera') : '' }));
    return { modelKey: 'sweater', attributes, notes };
  }
  // Prendas largas: la manga (larga) acaba muy por encima del bajo, o sin mangas y muy larga
  const long = s.torsoRatio > 2.3 || (rel >= 0.5 && rel < 0.75 && s.torsoRatio > 1.75) || (sleeve === 'sleeveless' && s.torsoRatio > 2.4);
  if (long && front && sleeve !== 'sleeveless' && s.flare < 1.25) {
    attributes.length = s.torsoRatio < 2.0 ? 'thigh' : s.torsoRatio < 2.5 ? 'knee' : 'midi';
    notes.push(t('Larga, con mangas y abrochada por delante: abrigo.'));
    return { modelKey: 'coat', attributes, notes };
  }
  if (long) {
    attributes.sleeve = rel >= 0.5 && rel < 0.75 && s.torsoRatio > 1.75 ? 'long' : sleeve;
    attributes.length = s.torsoRatio < 2.4 ? 'mini' : s.torsoRatio < 3.0 ? 'midi' : 'maxi';
    notes.push(t('Larga y de una pieza ({v}): vestido.', { v: attributes.sleeve === 'sleeveless' ? t('sin mangas') : attributes.sleeve === 'short' ? t('manga corta') : t('con mangas') }));
    return { modelKey: 'dress', attributes, notes };
  }
  if (sleeve === 'sleeveless') {
    if (front && closure === 'zip') {
      notes.push(t('Sin mangas y con cremallera: chaleco acolchado.'));
      return { modelKey: 'jacket', attributes: { style: 'puffer_vest', closure: 'zip' }, notes };
    }
    if (front) {
      attributes.style = 'waistcoat';
      notes.push(t('Sin mangas y abrochado: chaleco.'));
    } else {
      attributes.style = 'tank';
      notes.push(t('Sin mangas: top de tirantes.'));
    }
    return { modelKey: 'top', attributes, notes };
  }
  if (front) {
    if (closure === 'buttons' && !s.openFront) {
      attributes.sleeve = sleeve;
      notes.push(t('Botones por delante y {sleeveLabel}: camisa (si es gruesa, cámbiala a chaqueta).', { sleeveLabel }));
      return { modelKey: 'shirt', attributes, notes };
    }
    attributes.closure = closure;
    if (closure === 'buttons') attributes.style = 'field';
    notes.push(
      t('{toUpperCase}{slice} y {v}: chaqueta{v2}.', { toUpperCase: sleeveLabel[0].toUpperCase(), slice: sleeveLabel.slice(1), v: closure === 'open' ? t('delantera abierta') : closure === 'buttons' ? t('botones o broches') : t('cremallera'), v2: closure === 'buttons' ? t(' de campo') : '' }),
    );
    return { modelKey: 'jacket', attributes, notes };
  }
  if (sleeve === 'long' || sleeve === 'three_quarter') {
    notes.push(t('{toUpperCase}{slice}, cerrada: jersey o sudadera.', { toUpperCase: sleeveLabel[0].toUpperCase(), slice: sleeveLabel.slice(1) }));
    return { modelKey: 'sweater', attributes, notes };
  }
  attributes.sleeve = sleeve;
  notes.push(t('Manga corta, cerrada: camiseta.'));
  return { modelKey: 'tshirt', attributes, notes };
}

// ---------------------------------------------------------------------------
// Color, estampado y gráficos
// ---------------------------------------------------------------------------

function interior(mask: Uint8Array, w: number, h: number, r: number) {
  return morph(mask, w, h, r, false);
}

export function colorsOf(lab: Float32Array, mask: Uint8Array, w: number, h: number) {
  const inner = interior(mask, w, h, 2);
  const idx: number[] = [];
  for (let i = 0; i < inner.length; i++) if (inner[i]) idx.push(i);
  const step = Math.max(1, Math.floor(idx.length / 9000));
  const sample = idx.filter((_, k) => k % step === 0);
  const pts = new Float32Array(sample.length * 3);
  sample.forEach((p, k) => pts.set(lab.subarray(p * 3, p * 3 + 3), k * 3));
  const km = kmeans(pts, 5, 12);
  // Las sombras de la tela (mismo color, más oscuro) se juntan con su grupo
  const groups = km.centers.map((c, k) => ({ c: [...c] as [number, number, number], size: km.sizes[k] })).sort((a, b) => b.size - a.size);
  const merged: typeof groups = [];
  for (const g of groups) {
    const near = merged.find((m) => Math.hypot((m.c[1] - g.c[1]) * 1.2, (m.c[2] - g.c[2]) * 1.2, (m.c[0] - g.c[0]) * 0.45) < 11);
    if (near) near.size += g.size;
    else merged.push(g);
  }
  merged.sort((a, b) => b.size - a.size);
  // Color principal: la mediana del grupo mayor, sin las zonas más oscuras (sombras)
  const main = merged[0].c;
  const near: number[][] = [];
  for (let k = 0; k < sample.length; k++) {
    if (Math.hypot(pts[k * 3 + 1] - main[1], pts[k * 3 + 2] - main[2]) < 12 && Math.abs(pts[k * 3] - main[0]) < 25) {
      near.push([pts[k * 3], pts[k * 3 + 1], pts[k * 3 + 2]]);
    }
  }
  const mainLab: [number, number, number] = near.length
    ? [median(near.map((p) => p[0])), median(near.map((p) => p[1])), median(near.map((p) => p[2]))]
    : main;
  const total = merged.reduce((s, g) => s + g.size, 0);
  return {
    mainLab,
    groups: merged.map((g) => ({ lab: g.c, share: g.size / total })),
  };
}

/** Rayas, cuadros o lunares del segundo color (si cubre toda la prenda). */
export function patternOf(
  lab: Float32Array,
  mask: Uint8Array,
  w: number,
  h: number,
  mainLab: [number, number, number],
  second: { lab: [number, number, number]; share: number } | undefined,
): { pattern: PatternGuess | null; on: Uint8Array | null } {
  if (!second || second.share < 0.12 || Math.hypot(second.lab[0] - mainLab[0], second.lab[1] - mainLab[1], second.lab[2] - mainLab[2]) < 18) {
    return { pattern: null, on: null };
  }
  const inner = interior(mask, w, h, 3);
  const b = bbox(inner, w, h);
  const on = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0; i < w * h; i++) {
    if (!inner[i]) continue;
    const d1 = dE(lab, i * 3, mainLab, 0);
    const d2 = dE(lab, i * 3, second.lab, 0);
    if (d2 < d1) {
      on[i] = 1;
      count++;
    }
  }
  // ¿Repartido por toda la prenda? (si no, es un gráfico)
  const ob = bbox(on, w, h);
  const W = b.x1 - b.x0 + 1, H = b.y1 - b.y0 + 1;
  if (ob.x1 < 0 || (ob.x1 - ob.x0) < W * 0.6 || (ob.y1 - ob.y0) < H * 0.6) return { pattern: null, on: null };
  // Perfiles: proporción del segundo color por fila y por columna (dentro de la prenda)
  const prof = (horizontal: boolean) => {
    const n = horizontal ? H : W;
    const out = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      let a = 0, t = 0;
      const m = horizontal ? W : H;
      for (let j = 0; j < m; j++) {
        const x = horizontal ? b.x0 + j : b.x0 + k;
        const y = horizontal ? b.y0 + k : b.y0 + j;
        const p = y * w + x;
        if (inner[p]) {
          t++;
          a += on[p];
        }
      }
      out[k] = t > 3 ? a / t : NaN;
    }
    return out;
  };
  const stats = (v: Float32Array) => {
    const ok = Array.from(v).filter((x) => !Number.isNaN(x));
    const mean = ok.reduce((s, x) => s + x, 0) / Math.max(1, ok.length);
    const sd = Math.sqrt(ok.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, ok.length));
    // periodo: primer máximo de la autocorrelación
    let bestLag = 0, best = 0.2;
    const filled = Array.from(v).map((x) => (Number.isNaN(x) ? mean : x - mean));
    const den = filled.reduce((s, x) => s + x * x, 0) || 1;
    let prev = 1, falling = true;
    for (let lag = 2; lag < filled.length / 2; lag++) {
      let s = 0;
      for (let i = 0; i + lag < filled.length; i++) s += filled[i] * filled[i + lag];
      const r = s / den;
      if (falling && r > prev) falling = false;
      if (!falling && r > best) {
        best = r;
        bestLag = lag;
      }
      if (!falling && r < prev && bestLag) break;
      prev = r;
    }
    return { mean, sd, lag: bestLag, peak: best };
  };
  const rowsP = stats(prof(true));
  const colsP = stats(prof(false));
  const color = labToHex(second.lab);
  const thickness = Math.min(0.9, Math.max(0.1, count / Math.max(1, Array.from(inner).reduce((s, x) => s + x, 0))));
  const strongRows = rowsP.sd > 0.22 && rowsP.lag > 0;
  const strongCols = colsP.sd > 0.22 && colsP.lag > 0;
  if (strongRows && strongCols) {
    return { pattern: { kind: 'checks', color, periodRel: rowsP.lag / H, thickness }, on };
  }
  if (strongRows && rowsP.sd > colsP.sd * 1.6) return { pattern: { kind: 'stripes', angle: 0, color, periodRel: rowsP.lag / H, thickness }, on };
  if (strongCols && colsP.sd > rowsP.sd * 1.6) return { pattern: { kind: 'stripes', angle: 90, color, periodRel: colsP.lag / H, thickness }, on };
  // Manchas repartidas: lunares
  if (second.share < 0.4) return { pattern: { kind: 'dots', color, periodRel: 0.08, thickness: Math.min(0.8, thickness * 2.2) }, on };
  return { pattern: null, on: null };
}

/** Zonas de otro color (logos, estampados, parches) dentro de la prenda. */
export function graphicsOf(
  lab: Float32Array,
  mask: Uint8Array,
  w: number,
  h: number,
  mainLab: [number, number, number],
  patternOn: Uint8Array | null,
  shape: ShapeInfo,
  patternLab: [number, number, number] | null = null,
  raw: Uint8Array | null = null,
  bgLab: [number, number, number] | null = null,
): GraphicRegion[] {
  // Lejos del contorno (las sombras del borde no son gráficos) y sin los huecos
  // por los que se ve el fondo
  const inner = interior(raw ?? mask, w, h, 3);
  const b = shape.box;
  const W = b.x1 - b.x0 + 1, H = b.y1 - b.y0 + 1;
  const cx = (b.x0 + b.x1) / 2;
  const off = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!inner[i] || (patternOn && patternOn[i])) continue;
    // Las sombras y pliegues (mismo tono, más oscuro) no cuentan; con estampado,
    // tampoco lo que se parece a su color (los bordes de las rayas)
    const da = Math.hypot(lab[i * 3 + 1] - mainLab[1], lab[i * 3 + 2] - mainLab[2]);
    const dl = Math.abs(lab[i * 3] - mainLab[0]);
    if (patternLab && dE(lab, i * 3, patternLab, 0) < 30) continue;
    if (da > 18 || dl > 45) off[i] = 1;
  }
  // Une las letras de un mismo logo
  const grown = morph(off, w, h, Math.max(2, Math.round(W * 0.012)), true);
  const label = new Int32Array(w * h).fill(-1);
  const comps: { box: Box; area: number; px: number }[] = [];
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!grown[s] || label[s] >= 0) continue;
    const box: Box = { x0: w, y0: h, x1: -1, y1: -1 };
    let area = 0, px = 0;
    label[s] = comps.length;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p / w) | 0;
      area++;
      px += off[p];
      box.x0 = Math.min(box.x0, x);
      box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y);
      box.y1 = Math.max(box.y1, y);
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && grown[q] && label[q] < 0) {
          label[q] = comps.length;
          stack.push(q);
        }
      }
    }
    comps.push({ box, area, px });
  }
  const garmentArea = Array.from(mask).reduce((s, x) => s + x, 0);
  // Nitidez del borde de cada zona: un estampado cambia de golpe; una sombra, poco a poco
  const edgeSum = new Float64Array(comps.length), edgeN = new Float64Array(comps.length);
  for (let p = 0; p < w * h; p++) {
    if (!off[p]) continue;
    const x = p % w, y = (p / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const qx = x + dx, qy = y + dy, q2x = x + 3 * dx, q2y = y + 3 * dy;
      if (q2x < 0 || q2y < 0 || q2x >= w || q2y >= h) continue;
      const q = qy * w + qx, q2 = q2y * w + q2x;
      if (off[q] || !inner[q2]) continue;
      const c = label[p];
      edgeSum[c] += Math.min(60, dE(lab, p * 3, lab, q2 * 3));
      edgeN[c]++;
    }
  }
  const out: GraphicRegion[] = [];
  const order = comps.map((c, id) => ({ ...c, id })).sort((a, b2) => b2.px - a.px);
  for (const c of order) {
    if (edgeN[c.id] > 0 && edgeSum[c.id] / edgeN[c.id] < 14) continue; // borde difuso: sombra o pliegue
    const bw = c.box.x1 - c.box.x0 + 1, bh = c.box.y1 - c.box.y0 + 1;
    if (c.px < garmentArea * 0.002 || c.area > garmentArea * 0.3) continue;
    // Un gráfico es una zona compacta, no una línea suelta (costura, pliegue)
    if (c.px < bw * bh * 0.18) continue;
    // Cremallera o tapeta: franja estrecha y larga en el centro
    if (bw < W * 0.06 && bh > H * 0.2 && Math.abs((c.box.x0 + c.box.x1) / 2 - cx) < W * 0.06) continue;
    // Delantera abierta: lo que se ve por el hueco central no es un gráfico
    if (shape.openFront && Math.abs((c.box.x0 + c.box.x1) / 2 - cx) < W * 0.08 && bh > H * 0.3) continue;
    // Botones sueltos: muy pequeños y redondos
    if (bw < W * 0.035 && bh < H * 0.035) continue;
    let mean: [number, number, number] = [0, 0, 0];
    let k = 0;
    for (let y = c.box.y0; y <= c.box.y1; y++) {
      for (let x = c.box.x0; x <= c.box.x1; x++) {
        const p = y * w + x;
        if (off[p]) {
          mean = [mean[0] + lab[p * 3], mean[1] + lab[p * 3 + 1], mean[2] + lab[p * 3 + 2]];
          k++;
        }
      }
    }
    mean = [mean[0] / k, mean[1] / k, mean[2] / k];
    // Sombra en la unión de la manga con el cuerpo: más oscura, del mismo tono,
    // alargada en vertical y a un lado
    const shadowLike = mean[0] < mainLab[0] - 12 && Math.hypot(mean[1] - mainLab[1], mean[2] - mainLab[2]) < 12;
    const ucx = ((c.box.x0 + c.box.x1) / 2 - b.x0) / W;
    // El fondo que asoma por un hueco
    if (bgLab && Math.hypot(mean[0] - bgLab[0], mean[1] - bgLab[1], mean[2] - bgLab[2]) < 10) continue;
    if (shadowLike && bh > bw * 1.5 && Math.abs(ucx - 0.5) > 0.12) continue;
    out.push({
      box: c.box,
      u: ((c.box.x0 + c.box.x1) / 2 - b.x0) / W,
      v: ((c.box.y0 + c.box.y1) / 2 - b.y0) / H,
      w: bw / W,
      h: bh / H,
      color: labToHex(mean),
    });
    if (out.length >= 4) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fotos con la prenda puesta: separar la prenda de la persona
// ---------------------------------------------------------------------------

/** Piel (regla RGB clásica de Kovač; vale para fotos con luz de día o de estudio). */
function isSkin(r: number, g: number, b: number): boolean {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return r > 95 && g > 40 && b > 20 && mx - mn > 15 && Math.abs(r - g) > 15 && r > g && r > b;
}

/** Fila del bajo de la prenda de arriba (o null si llega hasta abajo de la foto). */
function hemRow(lab: Float32Array, mask: Uint8Array, w: number, b: Box, start: number): number | null {
  const H = b.y1 - b.y0 + 1;
  const width: number[] = [];
  const meanB: number[] = [];
  for (let y = b.y0; y <= b.y1; y++) {
    let n = 0, sb = 0;
    for (let x = b.x0; x <= b.x1; x++) {
      const p = y * w + x;
      if (mask[p]) {
        n++;
        sb += lab[p * 3 + 2];
      }
    }
    width.push(n);
    meanB.push(n ? sb / n : 0);
  }
  const win = Math.max(2, Math.round(H * 0.04));
  const avg = (arr: number[], i0: number, i1: number) => {
    let s = 0, k = 0;
    for (let i = Math.max(0, i0); i <= Math.min(arr.length - 1, i1); i++) { s += arr[i]; k++; }
    return k ? s / k : 0;
  };
  let maxW = 0;
  for (let i = start - b.y0; i < width.length - win; i++) {
    if (i < 0) continue;
    maxW = Math.max(maxW, avg(width, i - 1, i + 1));
    const above = avg(width, i - win, i);
    const below = avg(width, i + 1, i + win);
    const tone = Math.abs(avg(meanB, i - win, i) - avg(meanB, i + 1, i + win));
    if (above > maxW * 0.85 && below < above * 0.86 && tone > 2.5) return b.y0 + i;
  }
  return null;
}

/**
 * Si arriba de la silueta hay una cara (piel), la foto es de alguien con la
 * prenda puesta: la prenda son los colores del pecho (a los lados del centro,
 * por si va abierta y se ve lo de debajo), sin la cabeza, las manos ni el
 * pantalón. Devuelve null si no parece una foto con persona.
 */
export function isolateGarment(
  img: Px,
  lab: Float32Array,
  mask: Uint8Array,
): { mask: Uint8Array; sleeve: 'long' | 'three_quarter' | 'short' | 'sleeveless'; layered: boolean } | null {
  const { w, h, data } = img;
  const b = bbox(mask, w, h);
  const H = b.y1 - b.y0 + 1;
  // Cara: piel en la parte de arriba de la silueta
  const top = b.y0 + Math.round(H * 0.45);
  const skin = new Uint8Array(w * h);
  let skinTop = 0, areaTop = 0;
  for (let y = b.y0; y <= top; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      areaTop++;
      if (isSkin(data[p * 4], data[p * 4 + 1], data[p * 4 + 2])) {
        skin[p] = 1;
        skinTop++;
      }
    }
  }
  if (skinTop < areaTop * 0.03) return null;
  // Barbilla: fondo de la mancha de piel más grande de arriba
  const comps = components(skin, w, h);
  if (!comps.length) return null;
  const face = comps.reduce((m, c) => (c.area > m.area ? c : m));
  if (face.area < areaTop * 0.02) return null;
  let chin = b.y0, faceX = 0, faceN = 0, faceTop = h, faceL = w, faceR = 0;
  const facePx = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (compLabel[p] === face.id) {
      const fx = p % w, fy = (p / w) | 0;
      if (fy < faceTop) faceTop = fy;
      if (fx < faceL) faceL = fx;
      if (fx > faceR) faceR = fx;
      facePx[p] = 1;
      const y = (p / w) | 0;
      if (y > chin) chin = y;
      faceX += p % w;
      faceN++;
    }
  }
  faceX /= Math.max(1, faceN);
  // Una cara de verdad: arriba del todo, centrada, más estrecha que los hombros y
  // de proporciones de cara (si no, es una prenda de color carne o beis)
  const W = b.x1 - b.x0 + 1;
  const faceW = faceR - faceL + 1, faceH = chin - faceTop + 1;
  const isFace =
    faceTop - b.y0 < H * 0.2 &&
    Math.abs(faceX - (b.x0 + b.x1) / 2) < W * 0.25 &&
    faceW < W * 0.45 &&
    faceH > H * 0.05 &&
    faceH / Math.max(1, faceW) > 0.6 &&
    faceH / Math.max(1, faceW) < 2.2 &&
    faceN > faceW * faceH * 0.35;
  if (!isFace) return null;

  // Muestras de la prenda: a los lados del centro, en el pecho
  const y0 = Math.min(b.y1, chin + Math.round(H * 0.08));
  const y1 = Math.min(b.y1, chin + Math.round(H * 0.32));
  const samples: number[] = [];
  for (let y = y0; y <= y1; y++) {
    let l = -1, r = -1;
    for (let x = b.x0; x <= b.x1; x++) if (mask[y * w + x]) { if (l < 0) l = x; r = x; }
    if (l < 0) continue;
    const cx = (l + r) / 2, half = (r - l) / 2;
    for (let x = l; x <= r; x++) {
      const t = Math.abs(x - cx) / Math.max(1, half);
      if (t > 0.18 && t < 0.8 && mask[y * w + x]) samples.push(y * w + x);
    }
  }
  if (samples.length < 50) return null;
  // Grupos de color de toda la silueta; los de la prenda son los que hay en el pecho
  const idx: number[] = [];
  for (let p = 0; p < w * h; p++) if (mask[p]) idx.push(p);
  const step = Math.max(1, Math.floor(idx.length / 9000));
  const pick = idx.filter((_, k) => k % step === 0);
  const pts = new Float32Array(pick.length * 3);
  pick.forEach((p, k) => pts.set(lab.subarray(p * 3, p * 3 + 3), k * 3));
  const km = kmeans(pts, 10, 14);
  const nearest = (p: number) => {
    let best = 0, bd = Infinity;
    km.centers.forEach((c, k) => {
      const d = (lab[p * 3] - c[0]) ** 2 + (lab[p * 3 + 1] - c[1]) ** 2 + (lab[p * 3 + 2] - c[2]) ** 2;
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  };
  const counts = new Array(km.centers.length).fill(0);
  for (const p of samples) counts[nearest(p)]++;
  // Abajo de la foto (el pantalón): los colores que mandan ahí y no en el pecho no son de la prenda
  const low = new Array(km.centers.length).fill(0);
  let lowN = 0;
  for (let y = b.y1 - Math.round(H * 0.12); y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      low[nearest(p)]++;
      lowN++;
    }
  }
  const keep = new Set(
    counts
      .map((n, k) => [n, k])
      .filter(([n, k]) => {
        const chest = n / samples.length;
        const bottom = lowN ? low[k] / lowN : 0;
        return chest >= 0.05 && !(bottom > chest * 2.2 && bottom > 0.15);
      })
      .map(([, k]) => k),
  );
  const out = new Uint8Array(w * h);
  const cut = chin - Math.round(H * 0.015); // el cuello de la prenda llega a la barbilla; el pelo, no
  for (let p = 0; p < w * h; p++) {
    if (!mask[p] || ((p / w) | 0) < cut) continue;
    const r = data[p * 4], g = data[p * 4 + 1], bb = data[p * 4 + 2];
    if (isSkin(r, g, bb) && keep.has(nearest(p)) === false) continue;
    if (keep.has(nearest(p))) out[p] = 1;
  }
  // Bajo de la prenda: la silueta se estrecha de golpe (la chaqueta es más ancha que el
  // pantalón) y el tono cambia; lo de debajo es otra prenda
  const hem = hemRow(lab, mask, w, b, chin + Math.round(H * 0.15));
  if (hem !== null) for (let p = (hem + 1) * w; p < w * h; p++) out[p] = 0;
  // Limpieza: sin puntos sueltos, piezas grandes y agujeros (manchas del estampado) rellenos
  let m = morph(morph(out, w, h, 1, false), w, h, 1, true);
  m = morph(morph(m, w, h, 2, true), w, h, 2, false);
  const parts = components(m, w, h);
  if (!parts.length) return null;
  const big = parts.reduce((a, c) => Math.max(a, c.area), 0);
  const ids = new Set(parts.filter((c) => c.area >= big * 0.2).map((c) => c.id));
  for (let p = 0; p < w * h; p++) m[p] = ids.has(compLabel[p]) ? 1 : 0;
  m = fillHoles(m, w, h);
  let area = 0, person = 0;
  for (let p = 0; p < w * h; p++) {
    area += m[p];
    person += mask[p];
  }
  if (area < person * 0.15) return null;
  void faceX;
  // Largo de la manga: con la prenda puesta, la piel de los brazos dice dónde acaba
  // (manos al bajo = manga larga; antebrazo a la vista = corta; brazo entero = sin manga)
  const gb = bbox(m, w, h);
  const gW = gb.x1 - gb.x0 + 1, gH = gb.y1 - gb.y0 + 1;
  let skinTopY = Infinity, n = 0;
  for (let y = chin + Math.round(H * 0.04); y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const p = y * w + x;
      if (!mask[p] || m[p] || facePx[p] || !isSkin(data[p * 4], data[p * 4 + 1], data[p * 4 + 2])) continue;
      if (x > gb.x0 + gW * 0.3 && x < gb.x1 - gW * 0.3) continue; // solo a los lados
      n++;
      if (y < skinTopY) skinTopY = y;
    }
  }
  let sleeve: 'long' | 'three_quarter' | 'short' | 'sleeveless' = 'long';
  if (n > person * 0.002) {
    const rel = (skinTopY - gb.y0) / gH;
    sleeve = rel > 0.72 ? 'long' : rel > 0.5 ? 'three_quarter' : rel > 0.18 ? 'short' : 'sleeveless';
  }
  // ¿Se ve otra prenda debajo por el centro? (camiseta bajo una chaqueta abierta).
  // Columna a columna bajo la barbilla: una franja de color liso dentro de una prenda
  // estampada, o de otro color dentro de una lisa, es lo que asoma por la abertura.
  const ys0 = chin + Math.round(H * 0.06), ys1 = Math.min(b.y1, chin + Math.round(H * 0.3));
  const cols: { x: number; L: number; A: number; B: number; cs: number }[] = [];
  for (let x = Math.max(0, Math.round(faceX - W * 0.3)); x <= Math.min(w - 1, Math.round(faceX + W * 0.3)); x++) {
    let n = 0, L = 0, A = 0, B = 0, A2 = 0, B2 = 0;
    for (let y = ys0; y <= ys1; y++) {
      const p = y * w + x;
      if (!mask[p] || isSkin(data[p * 4], data[p * 4 + 1], data[p * 4 + 2])) continue;
      const a = lab[p * 3 + 1], bb = lab[p * 3 + 2];
      n++; L += lab[p * 3]; A += a; B += bb; A2 += a * a; B2 += bb * bb;
    }
    if (n < (ys1 - ys0) * 0.6) continue;
    L /= n; A /= n; B /= n;
    const cs = Math.sqrt(Math.max(0, A2 / n - A * A)) + Math.sqrt(Math.max(0, B2 / n - B * B));
    cols.push({ x, L, A, B, cs });
  }
  let layered = false;
  if (cols.length > 10) {
    const med = (v: number[]) => v.slice().sort((p, q) => p - q)[v.length >> 1];
    const ref = { L: med(cols.map((c) => c.L)), A: med(cols.map((c) => c.A)), B: med(cols.map((c) => c.B)), cs: med(cols.map((c) => c.cs)) };
    const odd = (c: (typeof cols)[number]) =>
      ref.cs >= 4 ? c.cs < ref.cs * 0.45 : Math.hypot(c.L - ref.L, c.A - ref.A, c.B - ref.B) > 18;
    let run = 0, best = 0, prevX = -9;
    for (const c of cols) {
      run = odd(c) && c.x === prevX + 1 ? run + 1 : odd(c) ? 1 : 0;
      prevX = c.x;
      best = Math.max(best, run);
    }
    layered = best >= Math.max(3, W * 0.04) && best < W * 0.35;
  }
  return { mask: m, sleeve, layered };
}

/**
 * Camuflaje: k-medias sin juntar sombras; si hay 3 o más colores bien
 * distintos (cada uno ≥ 10 % de la prenda) y todos están repartidos por la
 * prenda (no en una zona), el mayor es el fondo y los demás, las manchas.
 */
function camoOf(lab: Float32Array, mask: Uint8Array, w: number, h: number): { base: [number, number, number]; colors: string[]; coverage: number } | null {
  const inner = interior(mask, w, h, 2);
  const idx: number[] = [];
  for (let p = 0; p < w * h; p++) if (inner[p]) idx.push(p);
  if (idx.length < 200) return null;
  const step = Math.max(1, Math.floor(idx.length / 8000));
  const pick = idx.filter((_, k) => k % step === 0);
  const pts = new Float32Array(pick.length * 3);
  pick.forEach((p, k) => pts.set(lab.subarray(p * 3, p * 3 + 3), k * 3));
  const km = kmeans(pts, 5, 14);
  const total = pick.length;
  const gb = bbox(inner, w, h);
  const GW = gb.x1 - gb.x0 + 1, GH = gb.y1 - gb.y0 + 1;
  const groups = km.centers.map((c, k) => {
    // reparto: cuántas celdas de una cuadrícula 4x4 sobre la prenda tienen este color
    const cells = new Set<number>();
    pick.forEach((p, j) => {
      if (km.labels[j] !== k) return;
      const x = p % w, y = (p / w) | 0;
      cells.add(Math.min(3, Math.floor(((x - gb.x0) / GW) * 4)) * 4 + Math.min(3, Math.floor(((y - gb.y0) / GH) * 4)));
    });
    return { lab: c, share: km.sizes[k] / total, cells: cells.size };
  });
  const sig = groups.filter((g) => g.share >= 0.1 && g.cells >= 9).sort((a, b) => b.share - a.share);
  const distinct = sig.filter((g, i) => sig.slice(0, i).every((o) => Math.hypot(o.lab[0] - g.lab[0], o.lab[1] - g.lab[1], o.lab[2] - g.lab[2]) > 14));
  if (distinct.length < 3 || distinct[0].share > 0.55) return null;
  return {
    base: distinct[0].lab,
    colors: distinct.slice(1, 4).map((g) => labToHex(g.lab)),
    coverage: Math.min(0.85, Math.max(0.3, 1 - distinct[0].share)),
  };
}

/** Todo el análisis sobre una imagen ya reducida (lado mayor ~256 px). */
export function analyzePixels(img: Px): PhotoGuess | null {
  const lab = labImage(img);
  const seg = segment(img, lab);
  if (!seg) return null;
  let { mask, raw } = seg;
  const { bg } = seg;
  // ¿Alguien la lleva puesta? Entonces solo cuenta la prenda
  const garment = isolateGarment(img, lab, mask);
  const worn = !!garment;
  if (garment) {
    mask = garment.mask;
    raw = garment.mask;
  }
  const { mainLab, groups } = colorsOf(lab, mask, img.w, img.h);
  const shape = shapeOf(mask, lab, img.w, img.h, mainLab);
  if (garment) {
    // Puesta, las mangas caen pegadas al cuerpo y no se ven en la silueta: manda la piel
    shape.sleeveEnd = { long: 0.95, three_quarter: 0.6, short: 0.35, sleeveless: 0 }[garment.sleeve];
    shape.hood = false; // lo de arriba es la cabeza, ya quitada
  }
  // Puesta y abierta sobre otra prenda (asoma por el centro): ropa de abrigo abierta
  if (garment?.layered && shape.sleeveEnd >= 0.5) shape.openFront = true;
  const { modelKey, attributes, notes } = classify(shape);
  if (garment?.layered && modelKey === 'jacket' && shape.buttons >= 4) {
    attributes.style = 'field';
    notes.push(t('Lleva broches o botones a la vista: chaqueta de campo.'));
  }
  const second = groups[1] ? { lab: groups[1].lab, share: groups[1].share } : undefined;
  let { pattern, on } = patternOf(lab, mask, img.w, img.h, mainLab, second);
  // Camuflaje: tres o más colores bien distintos repartidos por toda la prenda
  let base = mainLab;
  if (!pattern || pattern.kind === 'dots') {
    const camo = camoOf(lab, mask, img.w, img.h);
    if (camo) {
      base = camo.base;
      pattern = { kind: 'camo', colors: camo.colors, color: camo.colors[0], periodRel: 0.35, thickness: camo.coverage };
      on = null;
    }
  }
  const graphics = graphicsOf(lab, mask, img.w, img.h, mainLab, on, shape, pattern && second ? second.lab : null, raw, bg);
  const color = labToHex(base);
  if (worn) notes.unshift(t('Foto con la prenda puesta: se ha separado la prenda de la persona.'));
  if (pattern) {
    const name =
      pattern.kind === 'camo'
        ? 'camuflaje'
        : pattern.kind === 'stripes'
          ? pattern.angle === 0
            ? t('rayas horizontales')
            : t('rayas verticales')
          : pattern.kind === 'checks'
            ? 'cuadros'
            : 'lunares';
    notes.push(pattern.kind === 'camo' ? t('Estampado: camuflaje ({join}).', { join: pattern.colors.join(', ') }) : t('Estampado: {name} en {color}.', { name, color: pattern.color }));
  }
  if (graphics.length) notes.push(t('{n} {v} recortado{v2} y colocado{v2} en la prenda.', { n: graphics.length, v: graphics.length === 1 ? t('gráfico (logo o estampado)') : t('gráficos (logos o estampados)'), v2: graphics.length === 1 ? '' : 's' }));
  return {
    modelKey,
    attributes,
    color,
    palette: groups.slice(0, 4).map((g) => labToHex(g.lab)),
    pattern,
    graphics,
    shape: { ...shape },
    notes,
    mask,
    worn,
  };
}
