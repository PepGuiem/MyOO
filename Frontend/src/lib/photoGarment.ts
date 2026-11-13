/**
 * Foto → prenda: lee la foto en el navegador (lib/photoAnalysis.ts) y prepara
 * lo que necesita el formulario: tipo, atributos, color, estampado y los
 * gráficos recortados (PNG con fondo transparente) para ponerlos como detalles.
 * La foto no se sube a ningún sitio; solo se guardan los gráficos recortados
 * (como imágenes del usuario) si hay alguno.
 */
import type { PatternSpec } from '../api/types';
import { normalizePattern } from './patterns';
import { analyzePixels, rgbToLab, type GraphicRegion, type PhotoGuess } from './photoAnalysis';

/** Lado mayor de la imagen que se analiza (rápido y suficiente para la silueta). */
const ANALYSIS_SIDE = 256;
/** Lado mayor de la imagen de la que se recortan los gráficos. */
const CROP_SIDE = 1600;
/** Lado mayor de cada gráfico recortado. */
const GRAPHIC_SIDE = 512;

/** Alto aproximado de cada tipo de prenda (m), para pasar tamaños de la foto a la prenda. */
const GARMENT_HEIGHT: Record<string, number> = {
  tshirt: 0.72,
  top: 0.6,
  shirt: 0.78,
  sweater: 0.68,
  jacket: 0.68,
  coat: 1.0,
  dress: 1.0,
  skirt: 0.6,
  pants: 1.05,
  shorts: 0.5,
};

export interface PhotoGraphic {
  blob: Blob;
  region: GraphicRegion;
  /** Ancho / alto del recorte. */
  aspect: number;
}

export interface PhotoReading {
  guess: PhotoGuess;
  graphics: PhotoGraphic[];
  /** Miniatura de la prenda recortada (data URL). */
  thumbnail: string;
}

function canvasOf(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const toBlob = (c: HTMLCanvasElement) =>
  new Promise<Blob | null>((resolve) => c.toBlob((b) => resolve(b), 'image/png'));

export async function readGarmentPhoto(file: File): Promise<PhotoReading | null> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = ANALYSIS_SIDE / Math.max(bitmap.width, bitmap.height);
    const aw = Math.max(1, Math.round(bitmap.width * scale));
    const ah = Math.max(1, Math.round(bitmap.height * scale));
    const small = canvasOf(aw, ah);
    const sctx = small.getContext('2d', { willReadFrequently: true })!;
    sctx.drawImage(bitmap, 0, 0, aw, ah);
    const px = sctx.getImageData(0, 0, aw, ah);
    const guess = analyzePixels({ data: px.data, w: aw, h: ah });
    if (!guess) return null;

    // Imagen grande para recortar los gráficos con detalle
    const big = Math.min(1, CROP_SIDE / Math.max(bitmap.width, bitmap.height));
    const bw = Math.round(bitmap.width * big);
    const bh = Math.round(bitmap.height * big);
    const hi = canvasOf(bw, bh);
    const hctx = hi.getContext('2d', { willReadFrequently: true })!;
    hctx.drawImage(bitmap, 0, 0, bw, bh);
    const k = bw / aw;
    const main = rgbToLabHex(guess.color);
    const graphics: PhotoGraphic[] = [];
    for (const region of guess.graphics) {
      const g = await cropGraphic(hctx, region, k, main, guess.mask, aw, ah);
      if (g) graphics.push({ ...g, region });
    }

    // Miniatura recortada (la silueta sobre transparente)
    const tw = Math.round(aw * 0.75), th = Math.round(ah * 0.75);
    const thumb = canvasOf(aw, ah);
    const tctx = thumb.getContext('2d')!;
    const img = tctx.createImageData(aw, ah);
    for (let i = 0; i < aw * ah; i++) {
      img.data[i * 4] = px.data[i * 4];
      img.data[i * 4 + 1] = px.data[i * 4 + 1];
      img.data[i * 4 + 2] = px.data[i * 4 + 2];
      img.data[i * 4 + 3] = guess.mask[i] ? 255 : 0;
    }
    tctx.putImageData(img, 0, 0);
    const out = canvasOf(tw, th);
    out.getContext('2d')!.drawImage(thumb, 0, 0, tw, th);
    return { guess, graphics, thumbnail: out.toDataURL('image/png') };
  } finally {
    bitmap.close();
  }
}

function rgbToLabHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return rgbToLab((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/**
 * Recorta un gráfico: lo que se parece al color de la prenda (o queda fuera de
 * ella) se vuelve transparente, con el borde suavizado.
 */
async function cropGraphic(
  ctx: CanvasRenderingContext2D,
  region: GraphicRegion,
  k: number,
  main: [number, number, number],
  mask: Uint8Array,
  aw: number,
  ah: number,
): Promise<{ blob: Blob; aspect: number } | null> {
  const pad = 0.12;
  const bw0 = region.box.x1 - region.box.x0 + 1;
  const bh0 = region.box.y1 - region.box.y0 + 1;
  const x0 = Math.max(0, Math.floor((region.box.x0 - bw0 * pad) * k));
  const y0 = Math.max(0, Math.floor((region.box.y0 - bh0 * pad) * k));
  const x1 = Math.min(ctx.canvas.width, Math.ceil((region.box.x1 + 1 + bw0 * pad) * k));
  const y1 = Math.min(ctx.canvas.height, Math.ceil((region.box.y1 + 1 + bh0 * pad) * k));
  const w = x1 - x0, h = y1 - y0;
  if (w < 4 || h < 4) return null;
  const data = ctx.getImageData(x0, y0, w, h);
  const d = data.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const ax = Math.min(aw - 1, Math.floor((x0 + x) / k));
      const ay = Math.min(ah - 1, Math.floor((y0 + y) / k));
      if (!mask[ay * aw + ax]) {
        d[i + 3] = 0;
        continue;
      }
      const [L, a, b] = rgbToLab(d[i], d[i + 1], d[i + 2]);
      const dc = Math.hypot(a - main[1], b - main[2]);
      const dl = Math.abs(L - main[0]);
      // Diferencia con la tela: de color, o de luz bastante marcada
      const diff = Math.max(dc / 18, dl / 40);
      const alpha = Math.min(1, Math.max(0, (diff - 0.55) / 0.45));
      d[i + 3] = Math.round(alpha * 255);
      if (alpha > 0.3) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const tmp = canvasOf(w, h);
  tmp.getContext('2d')!.putImageData(data, 0, 0);
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const s = Math.min(1, GRAPHIC_SIDE / Math.max(cw, ch));
  const out = canvasOf(Math.max(1, Math.round(cw * s)), Math.max(1, Math.round(ch * s)));
  out.getContext('2d')!.drawImage(tmp, minX, minY, cw, ch, 0, 0, out.width, out.height);
  const blob = await toBlob(out);
  return blob ? { blob, aspect: cw / ch } : null;
}

/** Estampado del formulario a partir de lo que se vio en la foto. */
export function patternFromPhoto(guess: PhotoGuess, modelKey: string): PatternSpec | null {
  const p = guess.pattern;
  if (!p) return null;
  const H = GARMENT_HEIGHT[modelKey] ?? 0.7;
  const size = Math.min(0.4, Math.max(0.008, p.periodRel * H));
  // Camuflaje: cada color es una capa de manchas sobre el color base de la prenda
  if (p.kind === 'camo')
    return normalizePattern({ kind: 'camo', colors: p.colors, size: 0.3, count: 2, thickness: Math.min(0.75, Math.max(0.35, p.thickness)) });
  if (p.kind === 'stripes') return normalizePattern({ kind: 'stripes', colors: [p.color], size, thickness: p.thickness, angle: p.angle });
  if (p.kind === 'checks') return normalizePattern({ kind: 'checks', colors: [p.color], size, thickness: Math.min(0.8, Math.max(0.2, p.thickness)) });
  return normalizePattern({ kind: 'dots', colors: [p.color], size: Math.min(0.08, size), thickness: p.thickness });
}

export { GARMENT_HEIGHT };
