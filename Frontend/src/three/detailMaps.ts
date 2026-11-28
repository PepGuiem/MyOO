/**
 * Mapas de relieve horneados en Blender (costuras, cantos, bolsillos, arrugas)
 * de los modelos de la biblioteca que los traen.
 *
 * Los prepara scripts/prepare-textures.py (normal map en WebP, 512 y 1024 px)
 * y prepare-garments.mjs los apunta en el .glb (`asset.extras.detail`) junto
 * con las UV de las piezas que los usan. Sirve igual para cualquier prenda o
 * calzado: basta con que su .glb traiga esos datos.
 *
 * Carga progresiva:
 * - Mientras no llega el mapa (o si no se carga ninguno) se usa uno plano de
 *   1×1 px: la prenda se ve como antes, sin esperar a nada.
 * - Miniaturas: 512 px, o ninguno con «ahorro de datos» o la calidad 3D en
 *   ahorro (Personalizar).
 * - Vista de detalle: 512 px al abrirla y 1024 px al acercarse (cuando la
 *   prenda ocupa en pantalla más que lo que da el de 512). Con ahorro, se
 *   queda en 512.
 */
import * as THREE from 'three';
import { saveData } from '../lib/preload3d';
import { quality3d } from '../lib/preferences';

/** Lo que el .glb dice de sus mapas (URLs ya resueltas). */
export interface DetailMapInfo {
  /** Metros que mide una unidad de UV en la prenda (para repetir el tejido a escala). */
  uvMeters: number;
  /** URL del normal map por tamaño (px). */
  normal: Record<number, string>;
}

/** Lee `asset.extras.detail` de un .glb; `base` es la URL del propio .glb. */
export function parseDetailInfo(extras: unknown, base: string): DetailMapInfo | null {
  const d = (extras as { detail?: { uvMeters?: unknown; normal?: Record<string, unknown> } } | undefined)?.detail;
  if (!d || typeof d.uvMeters !== 'number' || !(d.uvMeters > 0) || !d.normal || typeof d.normal !== 'object') return null;
  const normal: Record<number, string> = {};
  for (const [size, rel] of Object.entries(d.normal)) {
    const px = Number(size);
    if (!Number.isFinite(px) || typeof rel !== 'string') continue;
    try {
      normal[px] = new URL(rel, new URL(base, 'http://local/')).pathname;
    } catch {
      // URL rara: se ignora ese tamaño
    }
  }
  return Object.keys(normal).length ? { uvMeters: d.uvMeters, normal } : null;
}

/** Tamaños disponibles, de menor a mayor. */
export function detailSizes(info: DetailMapInfo): number[] {
  return Object.keys(info.normal)
    .map(Number)
    .sort((a, b) => a - b);
}

/**
 * Tamaño que toca cargar. `thumb`: miniatura (versión ligera del modelo).
 * `wanted`: píxeles de pantalla por unidad de UV (0 si no se sabe): si pasa
 * del tamaño menor, se pide el mayor. Devuelve 0 si no hay que cargar ninguno.
 */
export function pickDetailSize(sizes: number[], o: { thumb: boolean; saver: boolean; wanted: number }): number {
  if (!sizes.length) return 0;
  const small = sizes[0];
  if (o.thumb) return o.saver ? 0 : small;
  if (o.saver) return small;
  // El mayor que haga falta: el primero que cubre los píxeles en pantalla.
  for (const s of sizes) if (s >= o.wanted * 0.8) return s;
  return sizes[sizes.length - 1];
}

/** ¿Ahorro de datos o calidad 3D en ahorro? */
export function detailSaver(): boolean {
  return quality3d() === 'saver' || saveData();
}

// ---------------------------------------------------------------------------
// Texturas: compartidas entre prendas, con recuento de uso
// ---------------------------------------------------------------------------

let flat: THREE.DataTexture | null = null;
/** Normal map plano (sin relieve): el valor mientras carga el de verdad. */
export function flatNormal(): THREE.DataTexture {
  if (!flat) {
    flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    flat.needsUpdate = true;
  }
  return flat;
}

interface Slot {
  promise: Promise<THREE.Texture>;
  texture: THREE.Texture | null;
  users: number;
}
const slots = new Map<string, Slot>();
/** Texturas sin usar que se guardan un rato (volver con el scroll no las recarga). */
const idle: string[] = [];
const MAX_IDLE = 8;

let loader: THREE.TextureLoader | null = null;

/** Pide la textura de `url` (y la cuenta como usada hasta `releaseDetail`). */
export function acquireDetail(url: string): Promise<THREE.Texture> {
  let slot = slots.get(url);
  if (!slot) {
    loader ??= new THREE.TextureLoader();
    const s: Slot = { promise: Promise.resolve(flatNormal()), texture: null, users: 0 };
    s.promise = loader.loadAsync(url).then((tex) => {
      // Las UV vienen de glTF (origen arriba a la izquierda): sin voltear.
      tex.flipY = false;
      tex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      s.texture = tex;
      return tex;
    });
    // Si falla, se quita para poder reintentar en otra visita.
    s.promise.catch(() => slots.delete(url));
    slots.set(url, s);
    slot = s;
  }
  slot.users++;
  const i = idle.indexOf(url);
  if (i >= 0) idle.splice(i, 1);
  return slot.promise;
}

/** Deja de usar la textura de `url`; si nadie la usa, se libera más tarde. */
export function releaseDetail(url: string): void {
  const slot = slots.get(url);
  if (!slot) return;
  slot.users = Math.max(0, slot.users - 1);
  if (slot.users > 0) return;
  idle.push(url);
  while (idle.length > MAX_IDLE) {
    const old = idle.shift()!;
    const s = slots.get(old);
    if (!s || s.users > 0) continue;
    s.texture?.dispose();
    slots.delete(old);
  }
}
