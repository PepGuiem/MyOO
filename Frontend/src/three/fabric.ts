/**
 * Texturas de tejido generadas por código (sin descargar imágenes).
 *
 * Cada tejido es un "mapa de alturas" (punto, sarga vaquera, lana...) que
 * convertimos en un normal map (relieve fino sin añadir polígonos) y en un
 * roughness map (variación de brillo entre hilos y huecos).
 *
 * Son texturas "tileables" de 256 px con mipmaps y filtrado anisótropo; la
 * escala física (TEX_DENSITY, en surface.ts) es la misma en todas las prendas.
 * Si algún día hay texturas fotográficas reales, se pueden sustituir aquí.
 */
import * as THREE from 'three';
import type { Attributes } from '../api/types';
import { t } from '../i18n';

export type FabricKind = 'jersey' | 'woven' | 'denim' | 'knit' | 'wool' | 'leather' | 'canvas' | 'nylon' | 'silk';

const SIZE = 256;

// Ruido de valor periódico (se repite sin costuras al usar la textura en mosaico).
function makeNoise(seed: number, period: number) {
  const grid = new Float32Array(period * period);
  let x = seed * 9301 + 49297;
  for (let i = 0; i < grid.length; i++) {
    x = (x * 9301 + 49297) % 233280;
    grid[i] = x / 233280;
  }
  const at = (i: number, j: number) => grid[((j % period) + period) % period * period + (((i % period) + period) % period)];
  return (u: number, v: number) => {
    const fx = u * period;
    const fy = v * period;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

const n32 = makeNoise(2, 32);
const n64 = makeNoise(3, 64);
const TAU = Math.PI * 2;

/** Altura (0..1) de cada tejido en las coordenadas u, v de la textura (0..1). */
const HEIGHT: Record<FabricKind, (u: number, v: number) => number> = {
  // Punto de camiseta: columnas de "uves" muy finas
  jersey: (u, v) => {
    const col = u * 64;
    const zig = Math.abs((col % 1) - 0.5);
    return 0.5 + 0.35 * Math.sin(TAU * (v * 96 + zig * 1.4)) * (0.6 + 0.4 * Math.sin(TAU * col)) + 0.15 * n64(u, v);
  },
  // Tafetán (camisas): trama y urdimbre alternadas
  woven: (u, v) => {
    const a = Math.sin(TAU * u * 80);
    const b = Math.sin(TAU * v * 80);
    return 0.5 + 0.3 * a * Math.sign(b) * 0.5 + 0.3 * b * Math.sign(a) * 0.5 + 0.2 * n64(u, v);
  },
  // Sarga vaquera: diagonales + "slubs" (irregularidades del hilo)
  denim: (u, v) => 0.5 + 0.32 * Math.sin(TAU * (u + v) * 72) + 0.25 * (n32(u * 0.25, v * 4) - 0.5) + 0.12 * n64(u, v),
  // Punto grueso de jersey: canalé vertical con ondas
  knit: (u, v) => {
    const col = u * 28;
    const vv = Math.abs((col % 1) - 0.5);
    return 0.5 + 0.35 * Math.cos(TAU * col) + 0.25 * Math.sin(TAU * (v * 36 + vv * 1.6)) + 0.1 * n64(u, v);
  },
  // Paño de lana: fieltro irregular
  wool: (u, v) => 0.35 * n64(u, v) + 0.25 * n32(u, v) + 0.4 * (0.5 + 0.5 * Math.sin(TAU * (u + v) * 40)),
  // Piel: grano fino (poros e irregularidades pequeñas), no "piel de naranja"
  leather: (u, v) => {
    const a = n64(u * 4, v * 4);
    const b = n64(u * 4 + 0.37, v * 4 + 0.11);
    const pores = Math.pow(1 - Math.abs(a - b), 6);
    return 0.5 + 0.18 * pores + 0.06 * (n32(u, v) - 0.5);
  },
  // Nailon ripstop (plumíferos, cortavientos): cuadrícula muy fina
  nylon: (u, v) => {
    const gx = Math.abs(((u * 24) % 1) - 0.5) < 0.04 ? 1 : 0;
    const gy = Math.abs(((v * 24) % 1) - 0.5) < 0.04 ? 1 : 0;
    return 0.5 + 0.25 * Math.max(gx, gy) + 0.08 * n64(u, v);
  },
  // Seda / satén: raso muy fino en diagonal larga y alguna irregularidad del hilo
  silk: (u, v) => 0.5 + 0.12 * Math.sin(TAU * (u * 4 + v) * 60) + 0.12 * (n32(u * 0.5, v * 6) - 0.5) + 0.06 * n64(u, v),
  // Lona (zapatillas, gorras): tejido grueso
  canvas: (u, v) => {
    const a = Math.sin(TAU * u * 48);
    const b = Math.sin(TAU * v * 48);
    return 0.5 + 0.25 * a + 0.25 * b * Math.sign(a) + 0.15 * n64(u, v);
  },
};

const cache = new Map<FabricKind, THREE.DataTexture>();
const roughCache = new Map<FabricKind, THREE.DataTexture>();
const heightCache = new Map<FabricKind, Float32Array>();

function heightsOf(kind: FabricKind): Float32Array {
  const cached = heightCache.get(kind);
  if (cached) return cached;
  const h = HEIGHT[kind];
  const heights = new Float32Array(SIZE * SIZE);
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) heights[j * SIZE + i] = h(i / SIZE, j / SIZE);
  }
  heightCache.set(kind, heights);
  return heights;
}

function tileTexture(data: Uint8Array): THREE.DataTexture {
  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Roughness map (compartido): las crestas del hilo son algo más rugosas que
 * los huecos, así los reflejos se rompen como en una tela real.
 * Valores de 0,75 a 1 (el material multiplica su rugosidad por ellos).
 */
export function fabricRoughnessMap(kind: FabricKind): THREE.DataTexture {
  const cached = roughCache.get(kind);
  if (cached) return cached;
  const heights = heightsOf(kind);
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const h = Math.min(1, Math.max(0, heights[i]));
    const v = Math.round((0.75 + 0.25 * h) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = tileTexture(data);
  roughCache.set(kind, tex);
  return tex;
}

/** Normal map (compartido) de un tejido. */
export function fabricNormalMap(kind: FabricKind): THREE.DataTexture {
  const cached = cache.get(kind);
  if (cached) return cached;
  const heights = heightsOf(kind);
  const data = new Uint8Array(SIZE * SIZE * 4);
  const strength = 2.2;
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      const l = heights[j * SIZE + ((i - 1 + SIZE) % SIZE)];
      const r = heights[j * SIZE + ((i + 1) % SIZE)];
      const d = heights[((j - 1 + SIZE) % SIZE) * SIZE + i];
      const u = heights[((j + 1) % SIZE) * SIZE + i];
      const nx = (l - r) * strength;
      const ny = (d - u) * strength;
      const len = Math.hypot(nx, ny, 1);
      const k = (j * SIZE + i) * 4;
      data[k] = ((nx / len) * 0.5 + 0.5) * 255;
      data[k + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[k + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[k + 3] = 255;
    }
  }
  const tex = tileTexture(data);
  cache.set(kind, tex);
  return tex;
}

export interface FabricLook {
  /** Rugosidad media (0 = espejo, 1 = mate). */
  roughness: number;
  /** Brillo suave de las fibras al mirar de lado (terciopelo, punto, lana). */
  sheen: number;
  sheenRoughness?: number;
  normalScale: number;
  /** Capa de barniz: brillo controlado del cuero o del nailon técnico. */
  clearcoat?: number;
  /** Reflejo alargado de la seda y el satén. */
  anisotropy?: number;
}

/**
 * Aspecto de cada tejido:
 * - algodón (jersey / tafetán): mate, fibra apenas visible;
 * - vaquero: sarga marcada, desgaste en las zonas salientes (ver cloth.ts);
 * - lana y punto: suaves, con brillo de fibra y volumen;
 * - seda: reflejos suaves y alargados;
 * - cuero: grano fino y reflejos contenidos;
 * - nailon técnico: más liso, con brillo sintético.
 */
export const FABRIC_LOOK: Record<FabricKind, FabricLook> = {
  jersey: { roughness: 0.88, sheen: 0.55, normalScale: 0.35 },
  woven: { roughness: 0.78, sheen: 0.35, normalScale: 0.3 },
  denim: { roughness: 0.92, sheen: 0.25, normalScale: 0.6 },
  knit: { roughness: 0.95, sheen: 0.7, normalScale: 0.9 },
  wool: { roughness: 0.93, sheen: 0.8, sheenRoughness: 0.75, normalScale: 0.16 },
  leather: { roughness: 0.58, sheen: 0.04, normalScale: 0.07, clearcoat: 0.22 },
  canvas: { roughness: 0.85, sheen: 0.3, normalScale: 0.45 },
  nylon: { roughness: 0.4, sheen: 0.12, normalScale: 0.2, clearcoat: 0.12 },
  silk: { roughness: 0.34, sheen: 0.9, sheenRoughness: 0.3, normalScale: 0.08, anisotropy: 0.55 },
};

/** Nombre del aspecto de cada tejido (para la ficha de la prenda). */
export const FABRIC_LABEL: Record<FabricKind, string> = {
  jersey: t('Punto de algodón'),
  woven: t('Tejido plano'),
  denim: t('Vaquero (sarga)'),
  knit: t('Punto grueso'),
  wool: t('Paño de lana'),
  leather: t('Cuero'),
  canvas: t('Lona'),
  nylon: t('Nailon técnico'),
  silk: t('Seda / satén'),
};

/** Tejido por defecto de cada prenda, que el atributo "material" puede cambiar. */
const DEFAULT_FABRIC: Record<string, FabricKind> = {
  tshirt: 'jersey',
  shirt: 'woven',
  sweater: 'knit',
  jacket: 'canvas',
  coat: 'wool',
  pants: 'denim',
  shorts: 'woven',
  underwear: 'jersey',
  skirt: 'woven',
  dress: 'jersey',
  sneakers: 'canvas',
  boots: 'leather',
  cap: 'canvas',
  scarf: 'knit',
  beanie: 'knit',
};

/** Tejido típico según el tipo de chaqueta, abrigo o calzado. */
const STYLE_FABRIC: Record<string, Record<string, FabricKind>> = {
  jacket: {
    bomber: 'nylon',
    biker: 'leather',
    denim: 'denim',
    blazer: 'wool',
    harrington: 'woven',
    field: 'canvas',
    overshirt: 'woven',
    puffer: 'nylon',
    windbreaker: 'nylon',
    varsity: 'wool',
    anorak: 'nylon',
    hooded: 'jersey',
    track: 'jersey',
    puffer_vest: 'nylon',
  },
  coat: { trench: 'woven', parka: 'canvas', puffer: 'nylon', raincoat: 'nylon' },
  sneakers: { running: 'knit', court: 'leather', high_top: 'leather', skate: 'canvas', chunky: 'leather', slip_on: 'canvas' },
  cap: { trucker: 'canvas', snapback: 'wool', five_panel: 'nylon', bucket: 'canvas' },
};

/** Tejido típico según el corte (atributo "fit"): un vestido lencero es de seda. */
const FIT_FABRIC: Record<string, Record<string, FabricKind>> = {
  dress: { slip: 'silk' },
  skirt: { slip: 'silk' },
  pants: { jogger: 'jersey', cargo: 'canvas', baggy: 'canvas', parachute: 'nylon' },
  shorts: { bike: 'jersey', cargo: 'canvas', basketball: 'nylon' },
};

/**
 * Tejido de una prenda: primero manda lo que el usuario escribió en
 * "material"; si no, el tipo (bomber = nailon, biker = cuero...); si no,
 * el tejido por defecto de la prenda.
 */
export function fabricFor(modelKey: string, attributes: Attributes): FabricKind {
  const material = String(attributes.material ?? '').toLowerCase();
  if (/vaquer|denim|tejan/.test(material)) return 'denim';
  if (/piel|cuero|leather|ante/.test(material)) return 'leather';
  if (/lana|wool|cachemir|mohair/.test(material)) return modelKey === 'sweater' ? 'knit' : 'wool';
  if (/punto|knit/.test(material)) return 'knit';
  if (/nail|nylon|poli[eé]ster|t[eé]cnic/.test(material)) return 'nylon';
  if (/seda|silk|sat[eé]n|satin|charmeuse/.test(material)) return 'silk';
  if (/lino|linen|popel|oxford/.test(material)) return 'woven';
  // Sudadera con capucha: felpa (punto de algodón), no punto grueso.
  const hoodie = modelKey === 'sweater' && ['hoodie', 'hoodie_zip', 'half_zip', 'quarter_zip', 'athletic'].includes(String(attributes.neckline));
  // Pantalón de algodón (chino): sarga lisa, no vaquero.
  if (/algod|cotton/.test(material)) return modelKey === 'tshirt' || modelKey === 'sweater' || hoodie ? 'jersey' : modelKey === 'pants' ? 'woven' : (DEFAULT_FABRIC[modelKey] ?? 'woven');
  if (hoodie) return 'jersey';
  const style = typeof attributes.style === 'string' ? attributes.style : '';
  const byStyle = STYLE_FABRIC[modelKey]?.[style];
  if (byStyle) return byStyle;
  const fit = typeof attributes.fit === 'string' ? attributes.fit : '';
  const byFit = FIT_FABRIC[modelKey]?.[fit];
  if (byFit) return byFit;
  return DEFAULT_FABRIC[modelKey] ?? 'jersey';
}
