/**
 * Caché de prendas ya construidas (geometría ajustada y sombreada).
 *
 * Construir una prenda (deformarla al cuerpo, hornear su sombreado, generar
 * la geometría procedural...) cuesta decenas de milisegundos en el hilo
 * principal. La misma prenda con el mismo cuerpo sale siempre igual, y se
 * repite mucho: varias prendas iguales en distintos colores, la misma prenda
 * en varios outfits, y cada miniatura que se desmonta al alejarse y se vuelve
 * a montar al volver con el scroll.
 *
 * Se guarda una copia «plantilla» (nunca se pinta, así que no ocupa GPU) y
 * cada uso recibe su propia copia de las geometrías: quien la usa puede
 * deformarla (caída simulada) y liberarla al desmontarse sin afectar a nadie.
 */
import type * as THREE from 'three';
import type { Body } from './body';
import type { GarmentBuild } from './garments';

/** Memoria máxima de las plantillas (bytes de los arrays de geometría). */
const MAX_BYTES = 48 * 1024 * 1024;
const MAX_ENTRIES = 80;

interface Entry {
  build: GarmentBuild;
  bytes: number;
}

const entries = new Map<string, Entry>();
let totalBytes = 0;

// Los cuerpos salen de makeBody, que ya los guarda: su identidad basta como clave.
const bodyIds = new WeakMap<Body, number>();
let nextBodyId = 1;
function bodyKey(body: Body | null): string {
  if (!body) return '-';
  let id = bodyIds.get(body);
  if (id === undefined) {
    id = nextBodyId++;
    bodyIds.set(body, id);
  }
  return String(id);
}

/** Copia la prenda con geometrías nuevas (respeta las que se comparten entre piezas). */
function cloneBuild(build: GarmentBuild): GarmentBuild {
  const copies = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  return {
    ...build,
    parts: build.parts.map((part) => {
      let geometry = copies.get(part.geometry);
      if (!geometry) {
        geometry = part.geometry.clone();
        copies.set(part.geometry, geometry);
      }
      return { ...part, geometry };
    }),
  };
}

function sizeOf(build: GarmentBuild): number {
  const seen = new Set<THREE.BufferGeometry>();
  let bytes = 0;
  for (const { geometry } of build.parts) {
    if (seen.has(geometry)) continue;
    seen.add(geometry);
    for (const attr of Object.values(geometry.attributes)) bytes += (attr.array as ArrayLike<number> & { byteLength?: number }).byteLength ?? 0;
    const index = geometry.getIndex();
    if (index) bytes += (index.array as ArrayLike<number> & { byteLength?: number }).byteLength ?? 0;
  }
  return bytes;
}

/**
 * Devuelve la prenda de `key` + `body` desde la caché (como copia nueva) o la
 * construye con `make`. `key` debe describir todo lo que cambia la forma.
 */
export function cachedBuild(key: string, body: Body | null, make: () => GarmentBuild | null): GarmentBuild | null {
  const full = `${bodyKey(body)}|${key}`;
  const hit = entries.get(full);
  if (hit) {
    // Al final del Map = usada hace menos (se borra primero la más antigua).
    entries.delete(full);
    entries.set(full, hit);
    return cloneBuild(hit.build);
  }
  const build = make();
  if (!build) return null;
  const bytes = sizeOf(build);
  if (bytes > MAX_BYTES / 4) return build; // demasiado grande para guardarla
  entries.set(full, { build: cloneBuild(build), bytes });
  totalBytes += bytes;
  for (const [k, e] of entries) {
    if (totalBytes <= MAX_BYTES && entries.size <= MAX_ENTRIES) break;
    entries.delete(k);
    totalBytes -= e.bytes;
  }
  return build;
}
