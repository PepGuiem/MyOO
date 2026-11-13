/**
 * Texturas (GPU) de las baldosas de estampado de lib/patterns.ts.
 *
 * La textura guarda la cobertura de cada color en un canal (RGBA): los
 * colores, el giro y el tamaño se aplican en el shader (cloth.ts). Se
 * comparten entre prendas y se liberan las menos usadas.
 */
import * as THREE from 'three';
import type { PatternSpec } from '../api/types';
import { cachedTile, tileKey, tileResolution, type TileParams } from '../lib/patterns';

const cache = new Map<string, THREE.DataTexture>();
const MAX = 32;

export function tileParams(spec: PatternSpec): TileParams {
  return { kind: spec.kind, colors: spec.colors.length, thickness: spec.thickness, count: spec.count, softness: spec.softness };
}

/** Textura de la baldosa de un estampado (repetible, con mipmaps). */
export function patternTexture(spec: PatternSpec): THREE.DataTexture {
  const res = tileResolution(spec.size);
  const params = tileParams(spec);
  const key = tileKey(params, res);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const tex = new THREE.DataTexture(cachedTile(params, res), res, res, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  // Son coberturas (datos), no colores: sin conversión de espacio de color.
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  if (cache.size > MAX) {
    // Si una prenda aún la usa, three la vuelve a subir a la GPU al pintarla.
    const oldest = cache.keys().next().value as string;
    cache.get(oldest)?.dispose();
    cache.delete(oldest);
  }
  return tex;
}
