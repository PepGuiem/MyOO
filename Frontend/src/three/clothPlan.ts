/**
 * Qué piezas de una prenda se simulan y con qué parámetros (según el tipo
 * de prenda y el tejido). Ver clothSim.ts.
 */
import * as THREE from 'three';
import type { Body } from './body';
import { bakeShading } from './cloth';
import type { FabricKind } from './fabric';
import type { GarmentBuild } from './garments';
import type { SimParams, SimPartIn } from './clothSim';

/** Rigidez a la flexión por tejido (compliance XPBD: mayor = más blanda). */
const BEND: Record<FabricKind, number> = {
  silk: 4.5e-5,
  jersey: 2.6e-5,
  knit: 2.1e-5,
  woven: 1.6e-5,
  nylon: 1.3e-5,
  wool: 9e-6,
  canvas: 6e-6,
  denim: 2.6e-6,
  leather: 2.5e-6,
};

/** Margen sobre la piel (capas de debajo): [arriba de la cintura, extra por debajo]. */
const MARGIN: Record<string, [number, number]> = {
  // Por debajo de la cintura hay que pasar por encima de la cinturilla,
  // trabillas y bolsillos del pantalón.
  tshirt: [0.004, 0.024],
  shirt: [0.005, 0.024],
  sweater: [0.008, 0.024],
  jacket: [0.03, 0.012],
  coat: [0.036, 0.016],
  dress: [0.004, 0.004],
  skirt: [0.006, 0.004],
  // Pantalones y shorts NO se simulan: su forma ya sigue la pierna y la
  // simulación (sin choques de la tela consigo misma) los deformaba.
};

const LONG_SLEEVES = new Set(['shirt', 'sweater', 'jacket', 'coat']);

export interface SimPlan {
  parts: SimPartIn[];
  params: SimParams;
}

/** Plan de simulación de una prenda, o null si no se simula (calzado, gorras). */
export function simPlan(modelKey: string, build: GarmentBuild, body: Body, layer: number): SimPlan | null {
  const margin = MARGIN[modelKey];
  if (!margin) return null;
  const torsoX = body.torso(body.y.chest);
  let anyCloth = false;
  const parts: SimPartIn[] = build.parts.map((part) => {
    const g = part.geometry;
    const pos = g.getAttribute('position').array as Float32Array;
    const index = g.getIndex();
    const count = pos.length / 3;
    const isCloth =
      !!index &&
      // Los cordones (dobladillos, vivos) no son tela que caiga: siguen a la tela.
      g.type !== 'TubeGeometry' &&
      !part.metal &&
      (part.role === undefined || part.role === 'body') &&
      part.fabric !== 'none' &&
      count >= 300;
    if (!isCloth) {
      const rigid = !!part.metal || part.role === 'button' || part.role === 'thread' || part.role === 'hardware' || part.role === 'label';
      return { positions: pos, index: null, mode: 'follow', rigid };
    }
    anyCloth = true;
    // ¿Es una manga larga o una pernera? Tela de más al final (se arruga).
    let cx = 0;
    let minY = Infinity;
    for (let i = 0; i < count; i++) {
      cx += Math.abs(pos[i * 3]);
      minY = Math.min(minY, pos[i * 3 + 1]);
    }
    cx /= count;
    const sleeve = cx > torsoX * 0.95 && minY > body.y.crotch - 0.1;
    let slack = 0;
    let slackSpan = 0.3;
    if (sleeve && LONG_SLEEVES.has(modelKey) && minY < body.y.waist) {
      slack = 0.04;
      slackSpan = 0.28;
    }
    return {
      positions: pos,
      index: index.array as Uint32Array | Uint16Array,
      mode: 'cloth',
      slack,
      slackSpan,
      collide: sleeve ? 'arms' : 'body',
    };
  });
  if (!anyCloth) return null;
  return {
    parts,
    params: {
      bodyShapeId: body.shape.id,
      armSpread: body.armSpread,
      bendCompliance: BEND[build.fabric] ?? 5e-4,
      margin: margin[0] + layer * 0.012,
      marginBelowWaist: margin[1],
    },
  };
}

/**
 * Aplica el resultado de la simulación a las geometrías de la prenda:
 * posiciones nuevas, normales suaves (también en las costuras de cierre) y
 * oclusión ambiental recalculada sobre los pliegues nuevos.
 */
export function applySimResult(build: GarmentBuild, positions: (Float32Array | null)[]): void {
  const done = new Set<THREE.BufferGeometry>();
  build.parts.forEach((part, i) => {
    const next = positions[i];
    const g = part.geometry;
    if (!next || done.has(g)) return;
    done.add(g);
    const attr = g.getAttribute('position') as THREE.BufferAttribute;
    if (attr.array.length !== next.length) return;
    (attr.array as Float32Array).set(next);
    attr.needsUpdate = true;
    if (g.getIndex()) {
      g.computeVertexNormals();
      smoothDuplicateNormals(g);
    } else {
      g.computeVertexNormals();
    }
    g.computeBoundingBox();
    g.computeBoundingSphere();
    const tiny = part.metal || part.role === 'stitch' || part.role === 'thread' || part.role === 'seam';
    bakeShading(g, part.metal ? 'none' : (part.fabric ?? build.fabric), tiny);
  });
}

/** Promedia las normales de vértices repetidos en el mismo punto (sin "costura" de luz). */
function smoothDuplicateNormals(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  }
  const v = new THREE.Vector3();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of list) v.add(new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i)));
    v.normalize();
    for (const i of list) nor.setXYZ(i, v.x, v.y, v.z);
  }
  nor.needsUpdate = true;
}
