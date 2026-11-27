import { brandSvgUrl } from './brandColors';
import { currentNeon } from './preferences';

/**
 * Imagen de un outfit para redes: el render del maniquí vestido sobre el gris
 * oscuro de la web, con el nombre del outfit, el @usuario y el logo de MyOO en
 * el color neón elegido. Todo se compone en un canvas 2D y sale como PNG.
 */

export type ShareFormat = 'post' | 'story';

export interface ShareFormatSpec {
  width: number;
  height: number;
  /** Encuadre del render: distancia de la cámara y altura a la que mira. */
  distance: number;
  targetY: number;
}

/** Publicación (4:5, la vertical de Instagram) e historia (9:16). */
export const SHARE_FORMATS: Record<ShareFormat, ShareFormatSpec> = {
  post: { width: 1080, height: 1350, distance: 5, targetY: 0.86 },
  story: { width: 1080, height: 1920, distance: 5.6, targetY: 0.8 },
};

export interface ShareCard {
  /** Nombre del outfit. */
  title: string;
  /** Texto pequeño encima del nombre («OUTFIT»). */
  kicker: string;
  /** «@usuario», o null si no tiene. */
  handle: string | null;
}

const LOGO_URL = `${import.meta.env.BASE_URL}brand/logo.svg`;
const LOGO_RATIO = 451 / 944;
const FONT = "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif";
const INK = '#f1eee9';
const MUTED = 'rgba(241, 238, 233, 0.58)';

/** Compone la imagen final (PNG). `render`: el fotograma del maniquí, del tamaño del formato. */
export async function composeShareImage(render: HTMLCanvasElement, format: ShareFormat, card: ShareCard): Promise<Blob> {
  await loadFonts();
  const logo = await logoImage().catch(() => null);
  try {
    return await toPng(draw(render, format, card, logo));
  } catch (err) {
    // Si el navegador no deja exportar el canvas con el SVG del logo dentro
    // (algunos lo marcan como «contaminado»), se repite con el logo en texto.
    if (!logo) throw err;
    return toPng(draw(render, format, card, null));
  }
}

function draw(render: HTMLCanvasElement, format: ShareFormat, card: ShareCard, logo: HTMLImageElement | null): HTMLCanvasElement {
  const { width: W, height: H } = SHARE_FORMATS[format];
  const neon = currentNeon();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d');

  // Fondo: el gris oscuro de la web, algo más claro arriba.
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#25252a');
  bg.addColorStop(0.55, '#19191b');
  bg.addColorStop(1, '#111113');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Halo neón detrás del maniquí (muy suave).
  const cy = H * 0.46;
  const halo = ctx.createRadialGradient(W / 2, cy, 0, W / 2, cy, W * 0.62);
  halo.addColorStop(0, withAlpha(neon, 0.2));
  halo.addColorStop(1, withAlpha(neon, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // Viñeta en los bordes.
  const vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  // El maniquí vestido (fondo transparente).
  ctx.drawImage(render, 0, 0, W, H);

  const pad = 72;

  // Logo arriba a la izquierda.
  const logoW = 250;
  if (logo) {
    ctx.drawImage(logo, pad - 8, pad - 14, logoW, logoW * LOGO_RATIO);
  } else {
    ctx.fillStyle = INK;
    ctx.font = `800 64px ${FONT}`;
    ctx.textBaseline = 'top';
    ctx.fillText('MyOO', pad, pad);
    ctx.fillStyle = neon;
    ctx.fillRect(pad, pad + 76, 92, 6);
  }

  // Abajo: rótulo, nombre del outfit y @usuario.
  ctx.textBaseline = 'alphabetic';
  const maxW = W - pad * 2;
  let y = H - pad;
  if (card.handle) {
    ctx.fillStyle = neon;
    ctx.font = `700 38px ${FONT}`;
    ctx.fillText(fit(ctx, card.handle, maxW), pad, y);
    y -= 62;
  }
  const titleSize = fitSize(ctx, card.title, maxW, 76, 48);
  ctx.fillStyle = INK;
  ctx.font = `800 ${titleSize}px ${FONT}`;
  ctx.fillText(fit(ctx, card.title, maxW), pad, y);
  y -= titleSize + 22;
  ctx.fillStyle = MUTED;
  ctx.font = `600 26px ${FONT}`;
  const kicker = card.kicker.toUpperCase();
  setSpacing(ctx, '0.22em');
  ctx.fillText(kicker, pad + 34, y);
  setSpacing(ctx, '0px');
  // Raya neón delante del rótulo.
  ctx.fillStyle = neon;
  ctx.fillRect(pad, y - 13, 22, 5);

  return canvas;
}

function toPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png');
    } catch (err) {
      reject(err instanceof Error ? err : new Error('png'));
    }
  });
}

/** Espera a la tipografía de la web (si no ha llegado, se usa la del sistema). */
async function loadFonts(): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts?.load) return;
  await Promise.all([fonts.load(`800 76px ${FONT}`), fonts.load(`700 38px ${FONT}`), fonts.load(`600 26px ${FONT}`)]).catch(() => undefined);
}

/**
 * El logo con el color neón actual, listo para el canvas. Se le pone tamaño
 * al SVG (solo trae viewBox): sin él, Firefox no lo pinta en un canvas.
 */
async function logoImage(): Promise<HTMLImageElement> {
  const src = await brandSvgUrl(LOGO_URL);
  let svg = src.startsWith('data:') ? decodeURIComponent(src.slice(src.indexOf(',') + 1)) : await (await fetch(src)).text();
  const open = svg.slice(0, svg.indexOf('>') + 1);
  if (!/\swidth=/.test(open)) svg = svg.replace('<svg', '<svg width="944" height="451"');
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  return img;
}

/** El color con transparencia (acepta #rrggbb; si no, lo devuelve tal cual). */
function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Tamaño de letra que cabe en `maxW` (entre `max` y `min`), con la fuente del título. */
function fitSize(ctx: CanvasRenderingContext2D, text: string, maxW: number, max: number, min: number): number {
  for (let size = max; size > min; size -= 4) {
    ctx.font = `800 ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxW) return size;
  }
  return min;
}

/** Recorta el texto con «…» si no cabe (con la fuente ya puesta). */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

/** Espaciado entre letras (solo en navegadores que lo admiten en canvas). */
function setSpacing(ctx: CanvasRenderingContext2D, value: string): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = value;
}

/** Nombre del archivo: «myoo-<outfit>-<formato>.png», sin tildes ni espacios. */
export function shareFileName(title: string, format: ShareFormat): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `myoo-${slug || 'outfit'}-${format}.png`;
}

/** ¿Se puede compartir este archivo con el menú del sistema (Web Share nivel 2)? */
export function canShareFile(file: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Comparte la imagen con el menú del sistema. Hay que llamarlo directamente
 * desde el clic (el navegador lo exige). 'cancelled' si la persona lo cierra;
 * si falla por otra cosa, descarga el PNG.
 */
export async function shareFile(file: File, title: string): Promise<'shared' | 'cancelled' | 'downloaded'> {
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    downloadFile(file);
    return 'downloaded';
  }
}

/** Descarga el archivo (enlace temporal con `download`). */
export function downloadFile(file: File): void {
  const href = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = href;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}
