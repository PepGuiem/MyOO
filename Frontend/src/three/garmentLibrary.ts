/**
 * Biblioteca de modelos 3D de prendas (.glb hechos a mano, carpeta
 * prendas_3d_glb, optimizados con scripts/prepare-garments.mjs y servidos desde
 * public/models/prendas).
 *
 * Una prenda usa su modelo de la biblioteca cuando su tipo y su corte
 * coinciden con alguno; si no, se genera por código (garments.ts). Un
 * `modelUrl` propio de la prenda tiene siempre prioridad (GltfGarment.tsx).
 */
import { useSyncExternalStore } from 'react';
import * as THREE from 'three';
import type { Attributes } from '../api/types';
import type { Body } from './body';
import { bakeShading } from './cloth';
import { fabricFor, type FabricKind } from './fabric';
import type { GarmentBuild, GarmentPart, Role } from './garments';
import { loadGltfUncached } from './gltfLoad';
import { fitGeometry, hemHeight, scaleGeometry, shortenGeometry, tightenCollar, warpDetail } from './libraryFit';
import { libraryModel, type LibraryEntry } from './libraryCatalog';

export { libraryModel, type LibraryEntry };

const BASE = '/models/prendas/';

export type LibraryDetail = 'high' | 'low';

export function libraryUrl(entry: LibraryEntry, detail: LibraryDetail): string {
  // La versión ligera está en la carpeta lod/ junto al archivo.
  const slash = entry.file.lastIndexOf('/');
  const dir = entry.file.slice(0, slash + 1);
  const name = entry.file.slice(slash + 1);
  return BASE + dir + (detail === 'low' ? 'lod/' : '') + name;
}

// ---------------------------------------------------------------------------
// Carga (con caché) y preparación de la geometría
// ---------------------------------------------------------------------------

export interface LibraryPart {
  geometry: THREE.BufferGeometry;
  role: Role;
}

const ROLES: Role[] = ['body', 'trim', 'secondary', 'lining', 'seam', 'stitch', 'thread', 'button', 'zipper', 'hardware', 'sole', 'lace', 'label'];

const geometryCache = new Map<string, Promise<LibraryPart[]>>();

/**
 * Piezas de un modelo de la biblioteca, en coordenadas de la prenda y con
 * atributos en coma flotante. Si el archivo trae varios materiales con
 * `extras.role` (botones, pespuntes...), cada uno es una pieza con su papel.
 */
// URLs ya resueltas (bien o mal): las miniaturas enseñan el icono de carga hasta entonces.
const settled = new Set<string>();
const settledListeners = new Set<() => void>();
function markSettled(url: string) {
  if (settled.has(url)) return;
  settled.add(url);
  settledListeners.forEach((l) => l());
}
const subscribeSettled = (l: () => void) => {
  settledListeners.add(l);
  return () => settledListeners.delete(l);
};
/** ¿Ya terminó de cargar este modelo? (sin URL: no hay nada que esperar) */
export function useLibraryLoaded(url: string | null): boolean {
  return useSyncExternalStore(subscribeSettled, () => !url || settled.has(url));
}

export function loadLibrary(url: string): Promise<LibraryPart[]> {
  let p = geometryCache.get(url);
  if (!p) {
    // Sin la caché de gltfLoad: aquí se guarda solo la geometría ya preparada.
    p = loadGltfUncached(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const parts: LibraryPart[] = [];
      gltf.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.geometry;
        const g = new THREE.BufferGeometry();
        for (const name of ['position', 'normal'] as const) {
          const a = src.getAttribute(name);
          if (!a) continue;
          const arr = new Float32Array(a.count * 3);
          for (let i = 0; i < a.count; i++) {
            arr[i * 3] = a.getX(i);
            arr[i * 3 + 1] = a.getY(i);
            arr[i * 3 + 2] = a.getZ(i);
          }
          g.setAttribute(name, new THREE.BufferAttribute(arr, 3));
        }
        const col = src.getAttribute('color');
        if (col) {
          const ao = new Float32Array(col.count);
          for (let i = 0; i < col.count; i++) ao[i] = col.getX(i);
          g.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
        }
        const index = src.getIndex();
        if (index) g.setIndex(Array.from(index.array as ArrayLike<number>));
        g.applyMatrix4(mesh.matrixWorld);
        if (!g.getAttribute('normal')) g.computeVertexNormals();
        const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material | undefined;
        const role = material?.userData?.role as Role | undefined;
        parts.push({ geometry: g, role: role && ROLES.includes(role) ? role : 'body' });
      });
      if (!parts.length) throw new Error(`${url}: el archivo no tiene mallas`);
      return parts;
    });
    p.catch(() => geometryCache.delete(url));
    p.then(
      () => markSettled(url),
      () => markSettled(url),
    );
    geometryCache.set(url, p);
  }
  return p;
}

/** Sombreado horneado (oclusión del archivo × curvatura y desgaste), una vez por tejido. */
const shadedCache = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>();
function shaded(g: THREE.BufferGeometry, fabric: FabricKind | 'none'): THREE.BufferGeometry {
  let byFabric = shadedCache.get(g);
  if (!byFabric) {
    byFabric = new Map();
    shadedCache.set(g, byFabric);
  }
  const hit = byFabric.get(fabric);
  if (hit) return hit;
  const out = g.clone();
  bakeShading(out, fabric);
  const ao = out.getAttribute('ao') as THREE.BufferAttribute | undefined;
  const col = out.getAttribute('color') as THREE.BufferAttribute;
  if (ao) {
    // Arrays planos (los crean loadLibrary y bakeShading): acceso directo, sin getX/setXYZ.
    const a = ao.array as Float32Array;
    const c = col.array as Float32Array;
    for (let i = 0; i < col.count; i++) {
      // La curvatura ya oscurece los pliegues: suavizamos un poco la del archivo.
      const k = 0.15 + 0.85 * a[i];
      c[i * 3] *= k;
      c[i * 3 + 1] *= k;
      c[i * 3 + 2] *= k;
    }
    col.needsUpdate = true;
  }
  smoothVertexColors(out, 6);
  byFabric.set(fabric, out);
  return out;
}

/**
 * Suaviza el sombreado horneado promediando cada vértice con sus vecinos.
 * La oclusión de los archivos se calculó con pocos rayos por vértice y, en
 * las versiones de alta resolución, salía con ruido: manchas en dientes de
 * sierra bajo el canalé del cuello y en las costuras de las mangas.
 */
function smoothVertexColors(g: THREE.BufferGeometry, iterations: number): void {
  const col = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  const index = g.getIndex();
  if (!col || !index) return;
  const n = col.count;
  const idx = index.array;
  // Vecinos de cada vértice (CSR), con aristas repetidas: pesan más los que
  // comparten más triángulos, que es lo que queremos.
  const deg = new Uint32Array(n + 1);
  for (let t = 0; t < idx.length; t++) deg[idx[t] + 1] += 2;
  for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
  const fill = deg.slice(0, n);
  const nb = new Uint32Array(deg[n]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t];
    const b = idx[t + 1];
    const c = idx[t + 2];
    nb[fill[a]++] = b;
    nb[fill[a]++] = c;
    nb[fill[b]++] = a;
    nb[fill[b]++] = c;
    nb[fill[c]++] = a;
    nb[fill[c]++] = b;
  }
  let src = Float32Array.from(col.array as ArrayLike<number>);
  let dst = new Float32Array(src.length);
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < n; i++) {
      const s = deg[i];
      const e = deg[i + 1];
      if (e === s) {
        dst[i * 3] = src[i * 3];
        dst[i * 3 + 1] = src[i * 3 + 1];
        dst[i * 3 + 2] = src[i * 3 + 2];
        continue;
      }
      // Los tres canales en una sola pasada por los vecinos (mismo orden de suma).
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      for (let j = s; j < e; j++) {
        const q = nb[j] * 3;
        s0 += src[q];
        s1 += src[q + 1];
        s2 += src[q + 2];
      }
      dst[i * 3] = 0.4 * src[i * 3] + (0.6 * s0) / (e - s);
      dst[i * 3 + 1] = 0.4 * src[i * 3 + 1] + (0.6 * s1) / (e - s);
      dst[i * 3 + 2] = 0.4 * src[i * 3 + 2] + (0.6 * s2) / (e - s);
    }
    [src, dst] = [dst, src];
  }
  (col.array as Float32Array).set(src);
  col.needsUpdate = true;
}

const METAL_ROLES: Role[] = ['zipper', 'hardware'];

/** Altura del bajo de cada modelo (en el cuerpo de referencia), una vez por archivo. */
const hemCache = new WeakMap<LibraryPart[], number>();
function modelHem(parts: LibraryPart[], armDeg: number): number {
  let h = hemCache.get(parts);
  if (h === undefined) {
    const body = parts.filter((p) => p.role === 'body');
    h = hemHeight((body.length ? body : parts).map((p) => p.geometry), armDeg);
    hemCache.set(parts, h);
  }
  return h;
}

/** Geometría acortada (cortes que acaban en la cintura), con caché por largo. */
const shortCache = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>();
function shortened(g: THREE.BufferGeometry, from: number, to: number, armDeg: number): THREE.BufferGeometry {
  let byLength = shortCache.get(g);
  if (!byLength) {
    byLength = new Map();
    shortCache.set(g, byLength);
  }
  const key = `${from.toFixed(4)}|${to}|${armDeg}`;
  let out = byLength.get(key);
  if (!out) {
    out = shortenGeometry(g, from, to, armDeg);
    byLength.set(key, out);
  }
  return out;
}

/**
 * Construye la prenda a partir de su modelo de la biblioteca. Sin `body`, la
 * prenda se ve tal cual se modeló (pose en A); con `body`, ajustada al maniquí.
 */
export function buildLibraryGarment(
  entry: LibraryEntry,
  parts: LibraryPart[],
  modelKey: string,
  attributes: Attributes,
  body: Body | null,
  layer: number,
): GarmentBuild {
  const fabric = fabricFor(modelKey, attributes);
  const o = { region: entry.region, fit: entry.fit, layer, armDeg: entry.armDeg, headFit: entry.headFit };
  // Cortes más cortos que el modelo (boxy, crop, cazadoras): se sube el bajo.
  const hemFrom = entry.hemY !== undefined && entry.region === 'upper' ? modelHem(parts, entry.armDeg) : null;
  const out: GarmentPart[] = parts.map((part) => {
    const metal = METAL_ROLES.includes(part.role);
    const shadedBase = shaded(part.geometry, metal ? 'none' : fabric);
    const base = hemFrom !== null && entry.hemY !== undefined ? shortened(shadedBase, hemFrom, entry.hemY, entry.armDeg) : shadedBase;
    const geometry = body ? fitGeometry(base, body, o) : scaleGeometry(base, entry.fit);
    return {
      geometry: geometry === base ? base.clone() : geometry,
      tone: part.role === 'body' ? 'base' : part.role === 'sole' ? 'sole' : metal ? 'metal' : part.role === 'stitch' || part.role === 'thread' ? 'stitch' : 'dark',
      role: part.role,
      metal,
      // Ribetes de pelo (parka) y flecos (bufanda): aspecto de punto/lana, mate.
      ...(part.role === 'trim' && (modelKey === 'coat' || modelKey === 'scarf') ? { fabric: 'wool' as const } : {}),
      // Botones: lisos y algo brillantes (sin trama de tela).
      ...(part.role === 'button' ? { fabric: 'none' as const } : {}),
    };
  });
  // El escote abraza el cuello del maniquí (la bufanda se queda como está).
  if (body && entry.region === 'upper' && modelKey !== 'scarf') tightenCollar(out.map((p) => p.geometry), body, layer);
  return {
    parts: out,
    fabric,
    library: {
      entry,
      mapDetail: (p, n) => warpDetail(p, n, body, o),
    },
  };
}
