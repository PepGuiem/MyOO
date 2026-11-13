import * as THREE from 'three';
import type { Body } from './body';

/**
 * Soporte de escaparate del maniquí: peana redonda en el suelo y una varilla que sube
 * por detrás del talón derecho y entra en la pantorrilla con un tramo corto.
 * Va por detrás de la pierna para no atravesar el calzado; el tramo horizontal entra
 * por la parte de atrás del pantalón, como en una tienda.
 * Coordenadas de la web: Y arriba, frente +Z.
 */
export interface StandGeometry {
  base: THREE.BufferGeometry;
  rod: THREE.BufferGeometry;
}

const ROD_R = 0.0072;
const BASE_R = 0.22;
const BASE_H = 0.006;

export function makeStand(body: Body, detail: 'low' | 'high' = 'high'): StandGeometry {
  const seg = detail === 'low' ? 24 : 64;
  const leg = body.legs[0];
  const t = body.kneeT + (1 - body.kneeT) * 0.38; // pantorrilla
  const calf = leg.curve.getPointAt(t);
  const r = leg.radius(t);
  const foot = body.feet.find((f) => f.side === leg.side) ?? body.feet[0];
  // Detrás de la pantorrilla y del talón (el talón está en foot.origin).
  const zRod = Math.min(calf.z - r - 0.03, foot.origin.z - 0.05);
  const x = calf.x;
  const top = calf.y;

  const parts: THREE.BufferGeometry[] = [];
  // tramo vertical
  const vertical = new THREE.CylinderGeometry(ROD_R, ROD_R, top - BASE_H / 2, seg / 2, 1, true);
  vertical.translate(x, (top + BASE_H / 2) / 2, zRod);
  parts.push(vertical);
  // codo
  const elbow = new THREE.SphereGeometry(ROD_R, seg / 2, seg / 4);
  elbow.translate(x, top, zRod);
  parts.push(elbow);
  // tramo que entra en la pantorrilla (acaba dentro de la pierna)
  const inLen = calf.z - r * 0.25 - zRod;
  const stub = new THREE.CylinderGeometry(ROD_R, ROD_R, inLen, seg / 2, 1, true);
  stub.rotateX(Math.PI / 2);
  stub.translate(x, top, zRod + inLen / 2);
  parts.push(stub);
  // casquillo donde la varilla se apoya en la peana
  const collar = new THREE.CylinderGeometry(ROD_R * 2.2, ROD_R * 2.6, 0.012, seg / 2);
  collar.translate(x, BASE_H / 2 + 0.006, zRod);
  parts.push(collar);
  const rod = mergeSimple(parts);

  // Peana: disco fino con el canto biselado, centrado entre los pies y la varilla.
  const base = new THREE.CylinderGeometry(BASE_R, BASE_R + 0.004, BASE_H, seg);
  base.translate(x * 0.35, 0, (zRod + foot.origin.z + foot.length * 0.5) / 2);
  return { base, rod };
}

/** Une geometrías no indexadas o indexadas con los mismos atributos (posición y normal). */
function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const q = g.getAttribute('normal') as THREE.BufferAttribute;
    pos.set(p.array as Float32Array, o * 3);
    nor.set(q.array as Float32Array, o * 3);
    o += p.count;
  }
  for (const g of list) g.dispose();
  for (const g of geos) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
