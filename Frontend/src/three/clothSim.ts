/**
 * Simulación física de la caída de la tela (XPBD: "Extended Position Based
 * Dynamics"), que se ejecuta UNA vez al cargar la prenda, en un Web Worker.
 *
 * Qué simula:
 * - Tela casi inextensible (restricciones de distancia en cada arista).
 * - Rigidez a la flexión según el tejido (la seda cae en pliegues finos, el
 *   vaquero o el cuero en pocos y anchos).
 * - Gravedad y colisión con el cuerpo (torso en superelipse, brazos y
 *   piernas como cápsulas), con rozamiento y un margen para las capas de
 *   debajo.
 * - El borde superior de cada pieza queda sujeto (hombros, cintura), igual
 *   que en una prenda puesta.
 * - "Holgura": tela de más donde en la vida real se acumula (bajos del
 *   pantalón, puños), que se arruga al caer.
 *
 * Qué NO simula: choques de la tela consigo misma, viento o movimiento en
 * tiempo real (eso es el shader de cloth.ts, una aproximación visual).
 *
 * Es código puro (sin DOM ni React): sirve igual en el worker y en pruebas.
 */
import { makeBody, findBodyShape, type Body } from './body';
import { curvePoint } from './surface';

export interface SimPartIn {
  /** Posiciones (x, y, z) de la geometría. */
  positions: Float32Array;
  index: Uint32Array | Uint16Array | null;
  /** 'cloth' = se simula; 'follow' = se mueve con la tela más cercana; 'static' = no se toca. */
  mode: 'cloth' | 'follow' | 'static';
  /** Tela de más a lo largo de la pieza en su tramo final (p. ej. 0,03 = 3 %). */
  slack?: number;
  /** Fracción final de la pieza (desde abajo) donde se aplica la holgura. */
  slackSpan?: number;
  /** Con qué choca: mangas solo con los brazos; el resto con torso y piernas. */
  collide?: 'arms' | 'body';
  /** Pieza rígida (botón, remache...): se traslada entera, sin deformarse. */
  rigid?: boolean;
}

export interface SimParams {
  bodyShapeId: string;
  /** Separación extra de los brazos del cuerpo (ver makeBody). */
  armSpread?: number;
  /** Rigidez a la flexión (compliance XPBD): mayor = más blanda y más pliegues. */
  bendCompliance: number;
  /** Margen sobre la piel (capas de debajo), arriba y abajo de la cintura. */
  margin: number;
  marginBelowWaist: number;
  /** Distancia máxima que la tela puede alejarse de su forma diseñada (m). */
  maxDrift?: number;
  /** Duración simulada (s). */
  seconds?: number;
  seed?: number;
}

export interface SimResult {
  positions: (Float32Array | null)[];
  ms: number;
}

// ---------------------------------------------------------------------------
// Cuerpo como función de distancia
// ---------------------------------------------------------------------------

interface Capsule {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  ra: number; rb: number;
  min: [number, number, number];
  max: [number, number, number];
}

const TORSO_N = 2.6; // mismo exponente que body.ts

function limbCapsules(limb: Body['arms'][0], from: number, to: number, n: number): Capsule[] {
  const out: Capsule[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = from + ((to - from) * i) / n;
    const t1 = from + ((to - from) * (i + 1)) / n;
    const a = curvePoint(limb.curve, t0);
    const b = curvePoint(limb.curve, t1);
    const ra = limb.radius(t0);
    const rb = limb.radius(t1);
    const r = Math.max(ra, rb) + 0.08;
    out.push({
      ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, ra, rb,
      min: [Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.min(a.z, b.z) - r],
      max: [Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, Math.max(a.z, b.z) + r],
    });
  }
  return out;
}

class BodyCollider {
  readonly caps: Capsule[];
  readonly armCaps: number;
  private readonly y0: number;
  private readonly y1: number;
  private readonly waistY: number;
  private readonly rows: { rx: number; rzf: number; rzb: number }[];
  private readonly step = 0.004;

  constructor(private readonly body: Body, private readonly margin: number, private readonly marginBelow: number) {
    const arms = body.arms.flatMap((a) => limbCapsules(a, 0.05, 1.02, 14));
    this.armCaps = arms.length;
    this.caps = [...arms, ...body.legs.flatMap((l) => limbCapsules(l, -0.04, 1.02, 16))];
    this.y0 = body.y.crotch - 0.03 * body.s;
    this.y1 = body.y.neck;
    this.waistY = body.y.waist;
    // Tabla de secciones del torso (más rápida que evaluar los splines).
    const n = Math.ceil((this.y1 - this.y0) / this.step) + 1;
    this.rows = Array.from({ length: n }, (_, i) => body.section(this.y0 + i * this.step));
  }

  private marginAt(y: number): number {
    // Transición suave en la cintura (cinturilla del pantalón debajo).
    const k = Math.min(1, Math.max(0, (this.waistY + 0.04 - y) / 0.08));
    return this.margin + this.marginBelow * k;
  }

  /** Cápsulas cercanas a un punto (se calcula una vez por partícula). */
  candidates(x: number, y: number, z: number, arms: boolean): number[] {
    const out: number[] = [];
    const pad = 0.12;
    this.caps.forEach((c, k) => {
      const isArm = k < this.armCaps;
      if (isArm !== arms) return;
      if (x < c.min[0] - pad || x > c.max[0] + pad || y < c.min[1] - pad || y > c.max[1] + pad || z < c.min[2] - pad || z > c.max[2] + pad) return;
      out.push(k);
    });
    return out;
  }

  /** Empuja (x, y, z) fuera del cuerpo. Devuelve true si había penetración. */
  resolve(p: Float32Array, i: number, caps: number[] | undefined, torso: boolean): boolean {
    let x = p[i];
    const y = p[i + 1];
    let z = p[i + 2];
    const m = this.marginAt(y);
    let hit = false;

    // Torso: superelipse |x/A|^N + |z/B|^N = 1
    if (torso && y >= this.y0 && y <= this.y1) {
      const f = (y - this.y0) / this.step;
      const k = Math.min(this.rows.length - 2, Math.floor(f));
      const t = f - k;
      const r0 = this.rows[k];
      const r1 = this.rows[k + 1];
      const A = r0.rx + (r1.rx - r0.rx) * t + m;
      const B = (z >= 0 ? r0.rzf + (r1.rzf - r0.rzf) * t : r0.rzb + (r1.rzb - r0.rzb) * t) + m;
      const X = Math.abs(x) / A;
      const Z = Math.abs(z) / B;
      const rho = Math.pow(Math.pow(X, TORSO_N) + Math.pow(Z, TORSO_N), 1 / TORSO_N);
      if (rho < 1 && rho > 1e-6) {
        x /= rho;
        z /= rho;
        hit = true;
      }
    }
    // Cuello
    if (torso && y > this.y1 && y < this.body.y.chin) {
      const r = this.body.neckR + m;
      const d = Math.hypot(x, z - 0.01);
      if (d < r && d > 1e-6) {
        x = (x / d) * r;
        z = 0.01 + ((z - 0.01) / d) * r;
        hit = true;
      }
    }
    // Brazos y piernas (solo las cápsulas cercanas)
    for (const k of caps ?? []) {
      const c = this.caps[k];
      if (x < c.min[0] || x > c.max[0] || y < c.min[1] || y > c.max[1] || z < c.min[2] || z > c.max[2]) continue;
      const abx = c.bx - c.ax;
      const aby = c.by - c.ay;
      const abz = c.bz - c.az;
      const len2 = abx * abx + aby * aby + abz * abz;
      let t = ((x - c.ax) * abx + (y - c.ay) * aby + (z - c.az) * abz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = c.ax + abx * t;
      const qy = c.ay + aby * t;
      const qz = c.az + abz * t;
      const r = c.ra + (c.rb - c.ra) * t + m;
      const dx = x - qx;
      const dy = y - qy;
      const dz = z - qz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < r && d > 1e-6) {
        const s = r / d;
        x = qx + dx * s;
        p[i + 1] = qy + dy * s;
        z = qz + dz * s;
        hit = true;
      }
    }
    p[i] = x;
    p[i + 2] = z;
    // Suelo
    if (p[i + 1] < 0.002) {
      p[i + 1] = 0.002;
      hit = true;
    }
    return hit;
  }
}

// ---------------------------------------------------------------------------
// Utilidades de malla
// ---------------------------------------------------------------------------

/** Une vértices duplicados (costuras de superficies cerradas). */
function weld(pos: Float32Array): { map: Int32Array; unique: number[] } {
  const n = pos.length / 3;
  const map = new Int32Array(n);
  const seen = new Map<string, number>();
  const unique: number[] = [];
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * 1e5)},${Math.round(pos[i * 3 + 1] * 1e5)},${Math.round(pos[i * 3 + 2] * 1e5)}`;
    const found = seen.get(key);
    if (found !== undefined) map[i] = found;
    else {
      map[i] = unique.length;
      seen.set(key, unique.length);
      unique.push(i);
    }
  }
  return { map, unique };
}

/** Generador pseudoaleatorio con semilla (resultados repetibles). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

// ---------------------------------------------------------------------------
// Simulación
// ---------------------------------------------------------------------------

export function simulateCloth(parts: SimPartIn[], params: SimParams): SimResult {
  const t0 = Date.now();
  const body = makeBody(findBodyShape(params.bodyShapeId), params.armSpread ?? 0);
  const collider = new BodyCollider(body, params.margin, params.marginBelowWaist);
  const rand = rng(params.seed ?? 7);

  // --- Partículas de todas las piezas de tela
  type ClothPart = { part: number; map: Int32Array; base: number; count: number };
  const cloth: ClothPart[] = [];
  let total = 0;
  parts.forEach((p, pi) => {
    if (p.mode !== 'cloth' || !p.index) return;
    const { map, unique } = weld(p.positions);
    cloth.push({ part: pi, map, base: total, count: unique.length });
    total += unique.length;
  });
  const result: (Float32Array | null)[] = parts.map(() => null);
  if (total === 0) return { positions: result, ms: Date.now() - t0 };

  const armsOnly = new Uint8Array(total);
  const x = new Float32Array(total * 3);
  const prev = new Float32Array(total * 3);
  const rest = new Float32Array(total * 3);
  const w = new Float32Array(total).fill(1);
  // Distancia máxima a la forma diseñada ("tether"): poca cerca de las
  // sujeciones y más hacia el bajo. Evita que la tela se derrumbe (no hay
  // choques de la tela consigo misma) y conserva la silueta del corte.
  const tether = new Float32Array(total);
  const dist: number[] = []; // i, j, restLength, compliance
  const distK: number[] = [];

  for (const c of cloth) {
    const p = parts[c.part];
    const pos = p.positions;
    const idx = p.index!;
    // Posiciones iniciales (con una perturbación de medio milímetro para que
    // los pliegues puedan formarse: sin ella, la simetría perfecta no se rompe).
    const firstOf = new Int32Array(c.count).fill(-1);
    for (let v = 0; v < c.map.length; v++) if (firstOf[c.map[v]] < 0) firstOf[c.map[v]] = v;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let u = 0; u < c.count; u++) {
      const v = firstOf[u];
      const g = (c.base + u) * 3;
      rest[g] = pos[v * 3];
      rest[g + 1] = pos[v * 3 + 1];
      rest[g + 2] = pos[v * 3 + 2];
      x[g] = rest[g] + rand() * 0.0005;
      x[g + 1] = rest[g + 1] + rand() * 0.0005;
      x[g + 2] = rest[g + 2] + rand() * 0.0005;
      minY = Math.min(minY, rest[g + 1]);
      maxY = Math.max(maxY, rest[g + 1]);
    }
    const height = Math.max(1e-3, maxY - minY);
    if (p.collide === 'arms') armsOnly.fill(1, c.base, c.base + c.count);

    // Eje de la pieza (de arriba abajo) para aplicar la holgura a lo largo.
    let tx = 0, ty = 0, tz = 0, bx = 0, by = 0, bz = 0, nt = 0, nb = 0;
    for (let u = 0; u < c.count; u++) {
      const g = (c.base + u) * 3;
      if (rest[g + 1] > maxY - height * 0.1) { tx += rest[g]; ty += rest[g + 1]; tz += rest[g + 2]; nt++; }
      if (rest[g + 1] < minY + height * 0.1) { bx += rest[g]; by += rest[g + 1]; bz += rest[g + 2]; nb++; }
    }
    let ax = tx / Math.max(1, nt) - bx / Math.max(1, nb);
    let ay = ty / Math.max(1, nt) - by / Math.max(1, nb);
    let az = tz / Math.max(1, nt) - bz / Math.max(1, nb);
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;

    // Aristas (únicas) y vecinos opuestos para la flexión
    const edgeTri = new Map<string, number>();
    const edges = new Map<string, [number, number]>();
    const bend: [number, number][] = [];
    const boundary = new Map<string, number>();
    for (let t = 0; t < idx.length; t += 3) {
      const a = c.map[idx[t]];
      const b = c.map[idx[t + 1]];
      const d = c.map[idx[t + 2]];
      for (const [i, j, k] of [[a, b, d], [b, d, a], [d, a, b]] as const) {
        if (i === j) continue;
        const key = i < j ? `${i}_${j}` : `${j}_${i}`;
        if (!edges.has(key)) edges.set(key, [i, j]);
        const other = edgeTri.get(key);
        if (other === undefined) edgeTri.set(key, k);
        else if (other !== k) bend.push([other, k]);
        boundary.set(key, (boundary.get(key) ?? 0) + 1);
      }
    }
    const slackAt = (y: number) => {
      const u = (y - minY) / height; // 0 abajo, 1 arriba
      return (p.slack ?? 0) * Math.max(0, 1 - u / Math.max(0.05, p.slackSpan ?? 0.3));
    };
    for (const [i, j] of edges.values()) {
      const gi = c.base + i;
      const gj = c.base + j;
      const dx = rest[gj * 3] - rest[gi * 3];
      const dy = rest[gj * 3 + 1] - rest[gi * 3 + 1];
      const dz = rest[gj * 3 + 2] - rest[gi * 3 + 2];
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-6) continue;
      // Holgura solo a lo largo del eje (no en el contorno: no se "infla").
      const along = Math.abs((dx * ax + dy * ay + dz * az) / L);
      const slack = slackAt((rest[gi * 3 + 1] + rest[gj * 3 + 1]) / 2) * along;
      dist.push(gi, gj, L * (1 + slack));
      distK.push(1e-9);
    }
    for (const [i, j] of bend) {
      const gi = c.base + i;
      const gj = c.base + j;
      const L = Math.hypot(rest[gj * 3] - rest[gi * 3], rest[gj * 3 + 1] - rest[gi * 3 + 1], rest[gj * 3 + 2] - rest[gi * 3 + 2]);
      if (L < 1e-6) continue;
      dist.push(gi, gj, L);
      distK.push(params.bendCompliance);
    }

    // Sujeción: borde superior (y su primer anillo) y franja más alta.
    const pinned = new Uint8Array(c.count);
    const midY = minY + height * 0.5;
    for (const [key, count] of boundary) {
      if (count !== 1) continue;
      const [i, j] = edges.get(key)!;
      for (const v of [i, j]) if (rest[(c.base + v) * 3 + 1] > midY) pinned[v] = 1;
    }
    const ring = new Uint8Array(pinned);
    for (const [i, j] of edges.values()) {
      if (pinned[i]) ring[j] = 1;
      if (pinned[j]) ring[i] = 1;
    }
    for (let u = 0; u < c.count; u++) {
      const yv = rest[(c.base + u) * 3 + 1];
      if (ring[u] || yv > maxY - Math.min(0.03, height * 0.08)) w[c.base + u] = 0;
      tether[c.base + u] = Math.min(params.maxDrift ?? 0.025, (maxY - yv) * 0.07 + 0.002);
    }
  }

  // Las posiciones de las sujeciones no se mueven.
  for (let i = 0; i < total; i++) {
    if (w[i] === 0) {
      x[i * 3] = rest[i * 3];
      x[i * 3 + 1] = rest[i * 3 + 1];
      x[i * 3 + 2] = rest[i * 3 + 2];
    }
  }
  prev.set(x);
  const cand: number[][] = [];
  for (let i = 0; i < total; i++) cand.push(collider.candidates(x[i * 3], x[i * 3 + 1], x[i * 3 + 2], armsOnly[i] === 1));
  // Restricciones en arrays tipados (bastante más rápido)
  const cI = new Int32Array(distK.length);
  const cJ = new Int32Array(distK.length);
  const cL = new Float32Array(distK.length);
  const cK = new Float32Array(distK);
  for (let c = 0; c < distK.length; c++) {
    cI[c] = dist[c * 3];
    cJ[c] = dist[c * 3 + 1];
    cL[c] = dist[c * 3 + 2];
  }

  // --- Bucle XPBD (pasos pequeños, una iteración por paso)
  const seconds = params.seconds ?? 0.8;
  const substeps = 10;
  const frames = Math.round(seconds * 60);
  const h = 1 / 60 / substeps;
  const g = -9.81;
  const nC = distK.length;
  const damping = Math.exp(-2.5 * h);
  for (let f = 0; f < frames; f++) {
    for (let s = 0; s < substeps; s++) {
      // Integración
      for (let i = 0; i < total; i++) {
        if (w[i] === 0) continue;
        const k = i * 3;
        const vx = (x[k] - prev[k]) * damping;
        const vy = (x[k + 1] - prev[k + 1]) * damping + g * h * h;
        const vz = (x[k + 2] - prev[k + 2]) * damping;
        prev[k] = x[k];
        prev[k + 1] = x[k + 1];
        prev[k + 2] = x[k + 2];
        x[k] += vx;
        x[k + 1] += vy;
        x[k + 2] += vz;
      }
      // Restricciones de distancia (estiramiento y flexión)
      const h2 = h * h;
      for (let c = 0; c < nC; c++) {
        const i = cI[c];
        const j = cJ[c];
        const wi = w[i];
        const wj = w[j];
        const wsum = wi + wj;
        if (wsum === 0) continue;
        const L = cL[c];
        const a = i * 3;
        const b = j * 3;
        const dx = x[b] - x[a];
        const dy = x[b + 1] - x[a + 1];
        const dz = x[b + 2] - x[a + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (len < 1e-9) continue;
        const C = len - L;
        const alpha = cK[c] / h2;
        const dl = -C / (wsum + alpha);
        const sx = (dx / len) * dl;
        const sy = (dy / len) * dl;
        const sz = (dz / len) * dl;
        x[a] -= sx * wi;
        x[a + 1] -= sy * wi;
        x[a + 2] -= sz * wi;
        x[b] += sx * wj;
        x[b + 1] += sy * wj;
        x[b + 2] += sz * wj;
      }
      // Límite de deriva respecto a la forma diseñada
      for (let i = 0; i < total; i++) {
        if (w[i] === 0) continue;
        const k = i * 3;
        const dx = x[k] - rest[k];
        const dy = x[k + 1] - rest[k + 1];
        const dz = x[k + 2] - rest[k + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        const r = tether[i];
        if (d2 > r * r) {
          const s = r / Math.sqrt(d2);
          x[k] = rest[k] + dx * s;
          x[k + 1] = rest[k + 1] + dy * s;
          x[k + 2] = rest[k + 2] + dz * s;
        }
      }
      // Colisión con el cuerpo, con rozamiento (frena el deslizamiento)
      for (let i = 0; i < total; i++) {
        if (w[i] === 0) continue;
        const k = i * 3;
        if (collider.resolve(x, k, cand[i], armsOnly[i] === 0)) {
          prev[k] += (x[k] - prev[k]) * 0.35;
          prev[k + 1] += (x[k + 1] - prev[k + 1]) * 0.35;
          prev[k + 2] += (x[k + 2] - prev[k + 2]) * 0.35;
        }
      }
    }
  }

  // --- Resultado de las piezas de tela
  const disp = new Float32Array(total * 3);
  for (let i = 0; i < total * 3; i++) disp[i] = x[i] - rest[i];
  for (const c of cloth) {
    const src = parts[c.part].positions;
    const out = new Float32Array(src.length);
    for (let v = 0; v < c.map.length; v++) {
      const k = (c.base + c.map[v]) * 3;
      out[v * 3] = x[k];
      out[v * 3 + 1] = x[k + 1];
      out[v * 3 + 2] = x[k + 2];
    }
    result[c.part] = out;
  }

  // --- Piezas que siguen a la tela (botones, costuras, cuellos, bolsillos...)
  const cell = 0.02;
  const grid = new Map<string, number[]>();
  const keyOf = (px: number, py: number, pz: number) => `${Math.floor(px / cell)},${Math.floor(py / cell)},${Math.floor(pz / cell)}`;
  for (let i = 0; i < total; i++) {
    const k = keyOf(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]);
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(i);
  }
  const near = (px: number, py: number, pz: number): [number, number, number] | null => {
    const cx = Math.floor(px / cell);
    const cy = Math.floor(py / cell);
    const cz = Math.floor(pz / cell);
    let sw = 0;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    let best = Infinity;
    for (let dx = -2; dx <= 2; dx++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dz = -2; dz <= 2; dz++) {
          const list = grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (!list) continue;
          for (const i of list) {
            const d2 = (rest[i * 3] - px) ** 2 + (rest[i * 3 + 1] - py) ** 2 + (rest[i * 3 + 2] - pz) ** 2;
            best = Math.min(best, d2);
            const wgt = 1 / (d2 + 1e-6);
            sw += wgt;
            ox += disp[i * 3] * wgt;
            oy += disp[i * 3 + 1] * wgt;
            oz += disp[i * 3 + 2] * wgt;
          }
        }
    if (sw === 0 || best > 0.05 * 0.05) return null;
    return [ox / sw, oy / sw, oz / sw];
  };
  parts.forEach((p, pi) => {
    if (p.mode !== 'follow') return;
    const src = p.positions;
    const out = new Float32Array(src.length);
    // Piezas rígidas: una sola traslación (no se deforman). El resto, por vértice.
    const n = src.length / 3;
    if (p.rigid) {
      let cx = 0, cy = 0, cz = 0;
      for (let v = 0; v < n; v++) { cx += src[v * 3]; cy += src[v * 3 + 1]; cz += src[v * 3 + 2]; }
      const d = near(cx / n, cy / n, cz / n) ?? [0, 0, 0];
      for (let v = 0; v < n; v++) {
        out[v * 3] = src[v * 3] + d[0];
        out[v * 3 + 1] = src[v * 3 + 1] + d[1];
        out[v * 3 + 2] = src[v * 3 + 2] + d[2];
      }
    } else {
      for (let v = 0; v < n; v++) {
        const d = near(src[v * 3], src[v * 3 + 1], src[v * 3 + 2]) ?? [0, 0, 0];
        out[v * 3] = src[v * 3] + d[0];
        out[v * 3 + 1] = src[v * 3 + 1] + d[1];
        out[v * 3 + 2] = src[v * 3 + 2] + d[2];
      }
    }
    result[pi] = out;
  });

  return { positions: result, ms: Date.now() - t0 };
}
