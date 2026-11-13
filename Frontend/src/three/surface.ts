/**
 * Utilidades de geometría para superficies "tipo tubo" definidas por una
 * función: point(u, φ) devuelve un punto 3D para u (a lo largo) y φ (alrededor),
 * ambos entre 0 y 1. Con esto modelamos cuerpo y ropa con control total de la
 * forma en cada ángulo (escotes, pliegues, bajos curvos...).
 */
import * as THREE from 'three';

export type P3 = [number, number, number];

/** Potencia con signo: base de las formas "superelipse" (algo más cuadradas que un óvalo). */
export function spow(v: number, p: number): number {
  return Math.sign(v) * Math.pow(Math.abs(v), p);
}

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Ondulación irregular (suma de senos) para pliegues de tela.
 * Devuelve aproximadamente un valor entre -1 y 1.
 */
export function folds(theta: number, count: number, seed = 0): number {
  return (
    0.6 * Math.sin(count * theta + seed) +
    0.3 * Math.sin(count * 1.7 * theta + seed * 2.3 + 1.1) +
    0.1 * Math.sin(count * 3.1 * theta + seed * 0.7)
  );
}

export interface SurfaceOptions {
  rows: number;
  cols: number;
  /** true si φ da la vuelta completa (tubo cerrado). */
  closed: boolean;
  point: (u: number, phi: number) => P3;
  /** Escala de UV (alrededor, a lo largo) en "repeticiones de textura". */
  uvScale?: [number, number];
}

/** Malla a partir de una función point(u, φ). */
export function paramSurface(o: SurfaceOptions): THREE.BufferGeometry {
  const { rows, cols, closed } = o;
  const perRow = cols + 1;
  const positions = new Float32Array((rows + 1) * perRow * 3);
  const uvs = new Float32Array((rows + 1) * perRow * 2);
  const [su, sv] = o.uvScale ?? [1, 1];

  for (let r = 0; r <= rows; r++) {
    const u = r / rows;
    for (let c = 0; c <= cols; c++) {
      const phi = c / cols;
      const p = o.point(u, closed && c === cols ? 0 : phi);
      const i = r * perRow + c;
      positions.set(p, i * 3);
      uvs[i * 2] = phi * su;
      uvs[i * 2 + 1] = u * sv;
    }
  }

  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = r * perRow + c;
      const b = a + perRow;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();

  // En la costura (φ = 0 y φ = 1 son el mismo punto) promediamos normales
  // para que no se vea una línea.
  if (closed) {
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let r = 0; r <= rows; r++) {
      const a = r * perRow;
      const b = a + cols;
      v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
      n.setXYZ(a, v.x, v.y, v.z);
      n.setXYZ(b, v.x, v.y, v.z);
    }
    n.needsUpdate = true;
  }
  return g;
}

/** Punto de una curva; fuera de [0, 1] se prolonga en línea recta. */
export function curvePoint(curve: THREE.Curve<THREE.Vector3>, t: number): THREE.Vector3 {
  if (t < 0) {
    return curve.getPointAt(0).addScaledVector(curve.getTangentAt(0), t * curve.getLength());
  }
  if (t > 1) {
    return curve.getPointAt(1).addScaledVector(curve.getTangentAt(1), (t - 1) * curve.getLength());
  }
  return curve.getPointAt(t);
}

export interface Frame {
  center: THREE.Vector3;
  tangent: THREE.Vector3;
  normal: THREE.Vector3;
  binormal: THREE.Vector3;
}

/**
 * Marcos de referencia a lo largo de una curva con "transporte paralelo":
 * evitan que la sección se retuerza al seguir el brazo o la pierna.
 */
export function curveFrames(curve: THREE.Curve<THREE.Vector3>, ts: number[]): Frame[] {
  const frames: Frame[] = [];
  let prevTangent = curve.getTangentAt(clamp01(ts[0]));
  const ref = Math.abs(prevTangent.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const normal = new THREE.Vector3().crossVectors(prevTangent, ref).normalize();
  for (const t of ts) {
    const tangent = curve.getTangentAt(clamp01(t));
    normal.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(prevTangent, tangent)).normalize();
    frames.push({
      center: curvePoint(curve, t),
      tangent: tangent.clone(),
      normal: normal.clone(),
      binormal: new THREE.Vector3().crossVectors(tangent, normal).normalize(),
    });
    prevTangent = tangent;
  }
  return frames;
}

/**
 * Tubo alrededor de una curva (brazo, pierna, manga, pernera).
 * radius(t, φ) permite variar el radio a lo largo y alrededor (arrugas).
 */
export function tubeAlong(
  curve: THREE.Curve<THREE.Vector3>,
  from: number,
  to: number,
  radius: (t: number, phi: number) => number,
  rows = 28,
  cols = 28,
): THREE.BufferGeometry {
  const ts = Array.from({ length: rows + 1 }, (_, i) => lerp(from, to, i / rows));
  const frames = curveFrames(curve, ts);
  const length = curve.getLength() * Math.abs(to - from);
  const meanR = radius((from + to) / 2, 0);
  return paramSurface({
    rows,
    cols,
    closed: true,
    uvScale: [2 * Math.PI * meanR * TEX_DENSITY, length * TEX_DENSITY],
    point: (u, phi) => {
      const i = Math.round(u * rows);
      const f = frames[i];
      const a = phi * Math.PI * 2;
      const r = radius(ts[i], phi);
      const p = f.center
        .clone()
        .addScaledVector(f.normal, Math.cos(a) * r)
        .addScaledVector(f.binormal, Math.sin(a) * r);
      return [p.x, p.y, p.z];
    },
  });
}

/** Cordón que sigue una línea de puntos (dobladillos, costuras, cremalleras). */
export function cord(points: THREE.Vector3[], radius: number, closed = false, radial = 6): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, radial, closed);
}

/** Repeticiones de textura de tejido por metro. */
export const TEX_DENSITY = 7;
