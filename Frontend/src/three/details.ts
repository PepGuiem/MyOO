/**
 * Detalles colocados a mano sobre una prenda: parches, bordados, estampados,
 * etiquetas, chapas, bolsillos (calcos que se adaptan a la tela) y botones,
 * remaches, tachuelas o cremalleras (piezas 3D).
 *
 * - Los calcos usan DecalGeometry: se proyectan sobre la malla de la prenda
 *   y siguen sus pliegues. Los dibujos a mano se proyectan desde el punto de
 *   vista en que se dibujaron (projectDrawing).
 * - Las texturas (texto, logos, bordes de parche...) se dibujan en un canvas;
 *   también su relieve (normal map): hilo del bordado, ribete del parche...
 * - Las posiciones se guardan para la silueta estándar y se trasladan a la
 *   silueta en uso (mapToBody).
 */
import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import type { CustomDetail, DetailFont, DetailShape } from '../api/types';
import { makeBody, type Body } from './body';
import { buttonDisc, place, zipper, type GarmentPart } from './garments';

// ---------------------------------------------------------------------------
// Silueta: trasladar un punto de la silueta estándar a otra
// ---------------------------------------------------------------------------

const LANDMARKS = ['ankle', 'knee', 'crotch', 'hip', 'waist', 'chest', 'shoulder', 'neck', 'chin', 'crown'] as const;

function mapY(y: number, from: Body, to: Body): number {
  const a = LANDMARKS.map((k) => from.y[k]);
  const b = LANDMARKS.map((k) => to.y[k]);
  if (y <= a[0]) return (y * b[0]) / Math.max(1e-3, a[0]);
  for (let i = 0; i < a.length - 1; i++) {
    if (y <= a[i + 1]) {
      const k = (y - a[i]) / Math.max(1e-6, a[i + 1] - a[i]);
      return b[i] + k * (b[i + 1] - b[i]);
    }
  }
  return b[b.length - 1] + (y - a[a.length - 1]);
}

/** Lleva un punto (y su normal) de la silueta estándar a `to`. */
export function mapToBody(p: THREE.Vector3, to: Body): THREE.Vector3 {
  const from = makeBody();
  if (to === from) return p.clone();
  const y = mapY(p.y, from, to);
  const yRef = Math.min(Math.max(p.y, from.y.crotch), from.y.neck);
  const yTo = Math.min(Math.max(y, to.y.crotch), to.y.neck);
  const sa = from.section(yRef);
  const sb = to.section(yTo);
  const kx = sb.rx / Math.max(0.02, sa.rx);
  const kz = p.z >= 0 ? sb.rzf / Math.max(0.02, sa.rzf) : sb.rzb / Math.max(0.02, sa.rzb);
  return new THREE.Vector3(p.x * kx, y, p.z * kz);
}

// ---------------------------------------------------------------------------
// Proyección sobre la tela
// ---------------------------------------------------------------------------

// Material solo para el raycast (las prendas se ven por las dos caras).
const RAY_MATERIAL = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

/** Mallas de referencia (sin dibujar) de las piezas de tela de una prenda. */
export function clothTargets(parts: GarmentPart[]): THREE.Mesh[] {
  return parts
    .filter((p) => !p.metal && (p.role === undefined || ['body', 'trim', 'secondary', 'lining'].includes(p.role)))
    .filter((p) => (p.geometry.getAttribute('position')?.count ?? 0) > 40)
    .map((p) => {
      const m = new THREE.Mesh(p.geometry, RAY_MATERIAL);
      m.updateMatrixWorld(true);
      return m;
    });
}

const raycaster = new THREE.Raycaster();

/** Punto de la tela más cercano a `p` buscando a lo largo de su normal. */
export function hitCloth(targets: THREE.Mesh[], p: THREE.Vector3, n: THREE.Vector3): { point: THREE.Vector3; normal: THREE.Vector3; mesh: THREE.Mesh } | null {
  const dir = n.clone().normalize().negate();
  raycaster.set(p.clone().addScaledVector(n, 0.06), dir);
  raycaster.far = 0.14;
  const hits = raycaster.intersectObjects(targets, false);
  const hit = hits[0];
  if (!hit || !hit.face) return null;
  const normal = hit.face.normal.clone();
  if (normal.dot(dir) > 0) normal.negate();
  return { point: hit.point.clone(), normal, mesh: hit.object as THREE.Mesh };
}

const Z = new THREE.Vector3(0, 0, 1);

/** Orientación del calco: +Z hacia fuera de la tela, girado `rotation` sobre ella. */
export function decalOrientation(n: THREE.Vector3, rotation: number): THREE.Euler {
  const q = new THREE.Quaternion().setFromUnitVectors(Z, n.clone().normalize());
  // "Arriba" del calco = proyección del eje Y del mundo (los textos quedan derechos).
  const upLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(q.clone().invert());
  const roll = Math.atan2(-upLocal.x, upLocal.y);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, -roll + rotation));
  return new THREE.Euler().setFromQuaternion(q);
}

export function projectDecal(
  targets: THREE.Mesh[],
  p: THREE.Vector3,
  n: THREE.Vector3,
  width: number,
  height: number,
  rotation: number,
): THREE.BufferGeometry | null {
  const hit = hitCloth(targets, p, n);
  if (!hit) return null;
  const orient = decalOrientation(hit.normal, rotation);
  const size = new THREE.Vector3(width, height, Math.max(0.02, Math.min(width, height) * 0.6));
  // Proyectamos sobre todas las piezas cercanas (un parche puede cruzar una costura).
  const geos = targets
    .map((t) => new DecalGeometry(t, hit.point, orient, size))
    .filter((g) => g.getAttribute('position').count > 0);
  return mergeDecals(geos);
}

/** Une varios calcos (uno por pieza de tela) en una sola geometría. */
function mergeDecals(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!geos.length) return null;
  if (geos.length === 1) return geos[0];
  const merged = new THREE.BufferGeometry();
  const attrs = ['position', 'normal', 'uv'] as const;
  for (const name of attrs) {
    const size = name === 'uv' ? 2 : 3;
    const total = geos.reduce((acc, g) => acc + g.getAttribute(name).count * size, 0);
    const arr = new Float32Array(total);
    let off = 0;
    for (const g of geos) {
      const src = g.getAttribute(name).array as Float32Array;
      arr.set(src, off);
      off += src.length;
    }
    merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  geos.forEach((g) => g.dispose());
  return merged;
}

/** Fondo de la caja de proyección de un dibujo (m): tela a ±8 cm del punto central. */
const DRAWING_DEPTH = 0.16;

/**
 * Proyecta un dibujo a lo largo de `n` (la dirección desde la que se dibujó),
 * como un proyector: no hace falta que el centro caiga sobre la tela (un trazo
 * puede ir de una manga a otra). Solo pinta la tela que mira hacia `n`: la cara
 * de atrás de la prenda, dentro de la misma caja, queda sin tinta.
 */
export function projectDrawing(
  targets: THREE.Mesh[],
  p: THREE.Vector3,
  n: THREE.Vector3,
  width: number,
  height: number,
  rotation: number,
): THREE.BufferGeometry | null {
  const dir = n.clone().normalize();
  const orient = decalOrientation(dir, rotation);
  const size = new THREE.Vector3(width, height, DRAWING_DEPTH);
  const geos = targets
    .map((t) => facing(new DecalGeometry(t, p, orient, size), dir))
    .filter((g): g is THREE.BufferGeometry => !!g);
  return mergeDecals(geos);
}

/**
 * Deja solo los triángulos del calco que miran hacia `dir`. Si la malla tiene
 * las normales al revés (casi ninguno mira hacia `dir`), se usa el otro lado.
 */
function facing(g: THREE.BufferGeometry, dir: THREE.Vector3): THREE.BufferGeometry | null {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const tris = pos.count / 3;
  if (!tris) {
    g.dispose();
    return null;
  }
  const dots = new Float32Array(tris);
  let front = 0;
  let back = 0;
  for (let t = 0; t < tris; t++) {
    let d = 0;
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k;
      d += nor.getX(i) * dir.x + nor.getY(i) * dir.y + nor.getZ(i) * dir.z;
    }
    dots[t] = d / 3;
    if (dots[t] > 0.05) front++;
    else if (dots[t] < -0.05) back++;
  }
  const sign = back > front * 3 ? -1 : 1;
  const keep: number[] = [];
  for (let t = 0; t < tris; t++) if (dots[t] * sign > 0.05) keep.push(t);
  if (!keep.length) {
    g.dispose();
    return null;
  }
  const out = new THREE.BufferGeometry();
  const copy = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number) => {
    const arr = new Float32Array(keep.length * 3 * size);
    let o = 0;
    for (const t of keep) {
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k;
        for (let c = 0; c < size; c++) arr[o++] = attr.getComponent(i, c);
      }
    }
    return new THREE.BufferAttribute(arr, size);
  };
  out.setAttribute('position', copy(pos, 3));
  out.setAttribute('normal', copy(nor, 3));
  out.setAttribute('uv', copy(uv, 2));
  g.dispose();
  return out;
}

// ---------------------------------------------------------------------------
// Texturas dibujadas en canvas
// ---------------------------------------------------------------------------

const FONT: Record<DetailFont, (px: number) => string> = {
  sans: (px) => `700 ${px}px Archivo, system-ui, sans-serif`,
  serif: (px) => `700 ${px}px Georgia, "Times New Roman", serif`,
  script: (px) => `italic 600 ${px}px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive`,
  mono: (px) => `700 ${px}px "Courier New", Consolas, monospace`,
  college: (px) => `800 ${px}px Archivo, Impact, "Arial Black", sans-serif`,
};

/** Proporción (ancho/alto) de cada forma de parche (el recortado sigue a su imagen o texto). */
const SHAPE_ASPECT: Record<Exclude<DetailShape, 'cutout'>, number> = { rect: 1.45, rounded: 1.45, circle: 1, oval: 1.55, shield: 0.85 };

function shapePath(ctx: CanvasRenderingContext2D, shape: Exclude<DetailShape, 'cutout'>, w: number, h: number, inset: number) {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  ctx.beginPath();
  if (shape === 'circle' || shape === 'oval') {
    ctx.ellipse(w / 2, h / 2, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, Math.PI * 2);
  } else if (shape === 'shield') {
    const mx = w / 2;
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1, y0 + (y1 - y0) * 0.45);
    ctx.quadraticCurveTo(x1, y1 - (y1 - y0) * 0.15, mx, y1);
    ctx.quadraticCurveTo(x0, y1 - (y1 - y0) * 0.15, x0, y0 + (y1 - y0) * 0.45);
    ctx.closePath();
  } else {
    const r = shape === 'rounded' ? Math.min(w, h) * 0.16 : Math.min(w, h) * 0.03;
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, r);
  }
}

/** Texto ajustado a un ancho máximo. Devuelve el tamaño de fuente usado. */
function fitText(ctx: CanvasRenderingContext2D, text: string, font: DetailFont, maxW: number, maxH: number): number {
  let px = Math.floor(maxH);
  ctx.font = FONT[font](px);
  const w = ctx.measureText(text).width;
  if (w > maxW) px = Math.floor((px * maxW) / w);
  ctx.font = FONT[font](px);
  return px;
}

function drawGraphic(
  ctx: CanvasRenderingContext2D,
  d: CustomDetail,
  image: ImageBitmap | null,
  box: { x: number; y: number; w: number; h: number },
  color: string,
) {
  if (image) {
    const k = Math.min(box.w / image.width, box.h / image.height);
    const w = image.width * k;
    const h = image.height * k;
    ctx.drawImage(image, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
  } else if (d.text) {
    const font = d.font ?? 'sans';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, d.text, font, box.w, box.h * 0.8);
    if (font === 'college') {
      ctx.lineWidth = Math.max(2, box.h * 0.05);
      ctx.strokeStyle = d.secondaryColor && d.kind !== 'patch' ? d.secondaryColor : 'rgba(0,0,0,0)';
      ctx.strokeText(d.text, box.x + box.w / 2, box.y + box.h / 2);
    }
    ctx.fillText(d.text, box.x + box.w / 2, box.y + box.h / 2);
  }
}

/** Mapa de normales a partir de un mapa de alturas (canal rojo, 0..255). */
function normalsFromHeight(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const hd = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  const img = octx.createImageData(w, h);
  const H = (x: number, y: number) => hd[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (H(x - 1, y) - H(x + 1, y)) * strength;
      const ny = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/**
 * Silueta blanca (opaca donde la imagen lo es) de una imagen o canvas: el
 * relieve sigue la forma del PNG transparente, no sus colores.
 */
function silhouette(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(src, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  return out;
}

export interface DetailTextures {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  /** Proporción ancho/alto del calco. */
  aspect: number;
}

/**
 * Texturas (color + relieve) de un calco. El tamaño del canvas depende del
 * tamaño del detalle para no gastar memoria en detalles pequeños.
 */
export function drawDetail(d: CustomDetail, image: ImageBitmap | null): DetailTextures {
  let aspect = 1;
  const cutout = d.kind === 'patch' && d.shape === 'cutout';
  if (d.kind === 'patch' && !cutout) aspect = SHAPE_ASPECT[(d.shape ?? 'rounded') as Exclude<DetailShape, 'cutout'>];
  else if (d.kind === 'label') aspect = 2.2;
  else if (d.kind === 'pocket') aspect = 0.9;
  else if (image) aspect = Math.min(4, Math.max(0.25, image.width / image.height));
  else if (d.text) {
    const probe = document.createElement('canvas').getContext('2d')!;
    probe.font = FONT[d.font ?? 'sans'](100);
    aspect = Math.min(6, Math.max(0.6, (probe.measureText(d.text).width + 30) / 120));
  }
  // Los dibujos pueden ser grandes: más resolución (sin pasar de la imagen).
  const res =
    d.kind === 'drawing' && image
      ? Math.min(2048, Math.max(512, image.width, image.height))
      : d.size > 0.12
        ? 1024
        : 512;
  const W = aspect >= 1 ? res : Math.round(res * aspect);
  const Hh = aspect >= 1 ? Math.round(res / aspect) : res;

  const color = document.createElement('canvas');
  color.width = W;
  color.height = Hh;
  const c = color.getContext('2d')!;
  const height = document.createElement('canvas');
  height.width = W;
  height.height = Hh;
  const hgt = height.getContext('2d')!;
  hgt.fillStyle = '#000';
  hgt.fillRect(0, 0, W, Hh);

  const border = Math.min(W, Hh) * 0.07;
  if (d.kind === 'drawing') {
    // Dibujo a mano: la imagen tal cual, a sangre (el tamaño del calco es el del
    // dibujo). La tinta apenas tiene relieve.
    if (image) c.drawImage(image, 0, 0, W, Hh);
    hgt.globalAlpha = 0.18;
    if (image) hgt.drawImage(silhouette(image, W, Hh), 0, 0);
    hgt.globalAlpha = 1;
  } else if (cutout) {
    // Parche recortado: la tela es la silueta de la imagen (o de las letras),
    // sin fondo ni ribete. Relieve: toda la silueta sube, con el canto redondeado.
    const pad = Math.min(W, Hh) * 0.04;
    const box = { x: pad, y: pad, w: W - pad * 2, h: Hh - pad * 2 };
    drawGraphic(c, d, image, box, d.color);
    const mask = document.createElement('canvas');
    mask.width = W;
    mask.height = Hh;
    const mctx = mask.getContext('2d')!;
    drawGraphic(mctx, d, image, box, '#ffffff');
    const solid = image ? silhouette(mask, W, Hh) : mask;
    hgt.filter = `blur(${Math.max(1.5, Math.min(W, Hh) * 0.006)}px)`;
    hgt.globalAlpha = 0.6;
    hgt.drawImage(solid, 0, 0);
    hgt.filter = 'none';
    hgt.globalAlpha = 0.22;
    hgt.globalCompositeOperation = 'lighter';
    hgt.drawImage(solid, 0, 0);
    hgt.globalCompositeOperation = 'source-over';
    hgt.globalAlpha = 1;
  } else if (d.kind === 'patch' || d.kind === 'label' || d.kind === 'pocket') {
    const shape: Exclude<DetailShape, 'cutout'> = d.kind === 'patch' ? ((d.shape ?? 'rounded') as Exclude<DetailShape, 'cutout'>) : 'rect';
    // Fondo
    shapePath(c, shape, W, Hh, 2);
    c.fillStyle = d.color;
    c.fill();
    // Relieve: el parche entero sube y tiene un ribete alrededor
    shapePath(hgt, shape, W, Hh, 2);
    hgt.fillStyle = '#7a7a7a';
    hgt.fill();
    if (d.kind === 'patch') {
      // Ribete "merrow": puntadas apretadas alrededor
      const edge = d.secondaryColor ?? d.color;
      c.save();
      shapePath(c, shape, W, Hh, 2 + border / 2);
      c.lineWidth = border;
      c.strokeStyle = edge;
      c.stroke();
      c.setLineDash([2.5, 2.5]);
      c.lineWidth = border * 0.9;
      c.strokeStyle = 'rgba(0,0,0,0.18)';
      c.stroke();
      c.restore();
      hgt.save();
      shapePath(hgt, shape, W, Hh, 2 + border / 2);
      hgt.lineWidth = border;
      hgt.strokeStyle = '#d0d0d0';
      hgt.stroke();
      hgt.restore();
    } else {
      // Etiqueta o bolsillo: pespunte discontinuo alrededor
      c.save();
      shapePath(c, shape, W, Hh, border * 1.1);
      c.setLineDash([border * 0.55, border * 0.35]);
      c.lineWidth = Math.max(2, border * 0.14);
      c.strokeStyle = d.secondaryColor ?? 'rgba(255,255,255,0.75)';
      c.stroke();
      c.restore();
      if (d.kind === 'pocket') {
        // Dobladillo de la boca del bolsillo
        hgt.fillStyle = '#b4b4b4';
        hgt.fillRect(2, 2, W - 4, border * 1.6);
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.fillRect(2, border * 1.6, W - 4, 3);
      }
    }
    const pad = d.kind === 'patch' ? border * 2.2 : border * 1.8;
    drawGraphic(c, d, image, { x: pad, y: pad, w: W - pad * 2, h: Hh - pad * 2 }, d.secondaryColor ?? '#F2F2F2');
    // El dibujo del parche también tiene algo de relieve (bordado)
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = Hh;
    const tctx = tmp.getContext('2d')!;
    drawGraphic(tctx, d, image, { x: pad, y: pad, w: W - pad * 2, h: Hh - pad * 2 }, '#ffffff');
    hgt.globalCompositeOperation = 'lighter';
    hgt.globalAlpha = 0.35;
    hgt.drawImage(tmp, 0, 0);
    hgt.globalAlpha = 1;
    hgt.globalCompositeOperation = 'source-over';
  } else {
    // Bordado, estampado o chapa: el dibujo sin fondo
    drawGraphic(c, d, image, { x: 8, y: 8, w: W - 16, h: Hh - 16 }, d.color);
    if (d.kind === 'embroidery') {
      // Hilo: rayado diagonal dentro del dibujo y relieve alto
      const mask = document.createElement('canvas');
      mask.width = W;
      mask.height = Hh;
      const mctx = mask.getContext('2d')!;
      drawGraphic(mctx, d, image, { x: 8, y: 8, w: W - 16, h: Hh - 16 }, '#ffffff');
      c.save();
      c.globalCompositeOperation = 'source-atop';
      c.strokeStyle = 'rgba(0,0,0,0.16)';
      c.lineWidth = 1.2;
      for (let x = -Hh; x < W; x += 4) {
        c.beginPath();
        c.moveTo(x, Hh);
        c.lineTo(x + Hh, 0);
        c.stroke();
      }
      c.restore();
      hgt.filter = 'blur(2px)';
      hgt.drawImage(mask, 0, 0);
      hgt.filter = 'none';
      hgt.save();
      hgt.globalCompositeOperation = 'source-atop';
      hgt.strokeStyle = 'rgba(0,0,0,0.45)';
      hgt.lineWidth = 1.2;
      for (let x = -Hh; x < W; x += 4) {
        hgt.beginPath();
        hgt.moveTo(x, Hh);
        hgt.lineTo(x + Hh, 0);
        hgt.stroke();
      }
      hgt.restore();
    } else {
      // Estampado: casi plano (la tinta solo marca un poco el borde)
      const mask = document.createElement('canvas');
      mask.width = W;
      mask.height = Hh;
      drawGraphic(mask.getContext('2d')!, d, image, { x: 8, y: 8, w: W - 16, h: Hh - 16 }, '#ffffff');
      hgt.globalAlpha = 0.25;
      hgt.drawImage(mask, 0, 0);
      hgt.globalAlpha = 1;
    }
  }

  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const normalMap = new THREE.CanvasTexture(normalsFromHeight(height, d.kind === 'embroidery' ? 6 : cutout ? 5 : 4));
  normalMap.anisotropy = 4;
  return { map, normalMap, aspect };
}

// ---------------------------------------------------------------------------
// Detalles 3D (botones, remaches, tachuelas, chapas, cremalleras)
// ---------------------------------------------------------------------------

export interface DetailPiece {
  geometry: THREE.BufferGeometry;
  /** 'metal' = metal con el color del detalle; 'base' = pieza con el color; 'thread' = hilo; 'face' = cara con la textura. */
  look: 'metal' | 'base' | 'thread' | 'face';
}

/** Piezas 3D de un detalle ya situado en (p, n). */
export function detailPieces(d: CustomDetail, p: THREE.Vector3, n: THREE.Vector3, targets: THREE.Mesh[]): DetailPiece[] {
  const r = d.size / 2;
  const out: DetailPiece[] = [];
  if (d.kind === 'button') {
    out.push({ geometry: place(buttonDisc(r), p.clone().addScaledVector(n, 0.0012), n, d.rotation), look: 'base' });
    const h = r * 0.28;
    const lift = Math.max(0.0022, r * 0.3) * 0.5 + 0.0016;
    for (const [x0, z0, x1, z1] of [[-h, -h, h, h], [-h, h, h, -h]]) {
      const g = new THREE.CylinderGeometry(0.00045, 0.00045, Math.hypot(x1 - x0, z1 - z0) + 0.0009, 5);
      g.rotateZ(Math.PI / 2);
      g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
      g.translate((x0 + x1) / 2, lift, (z0 + z1) / 2);
      out.push({ geometry: place(g, p, n, d.rotation), look: 'thread' });
    }
  } else if (d.kind === 'rivet') {
    const g = new THREE.SphereGeometry(r, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
    g.scale(1, 0.6, 1);
    out.push({ geometry: place(g, p.clone().addScaledVector(n, 0.0004), n), look: 'metal' });
  } else if (d.kind === 'stud') {
    const g = new THREE.ConeGeometry(r, r * 0.9, 4, 1);
    g.translate(0, r * 0.45, 0);
    out.push({ geometry: place(g, p, n, d.rotation + Math.PI / 4), look: 'metal' });
  } else if (d.kind === 'pin') {
    // Chapa: disco metálico con la cara superior dibujada
    const body = new THREE.CylinderGeometry(r, r * 0.97, r * 0.16, 32, 1, true);
    body.translate(0, r * 0.08, 0);
    out.push({ geometry: place(body, p.clone().addScaledVector(n, 0.0008), n), look: 'metal' });
    const face = new THREE.CircleGeometry(r * 0.98, 40);
    face.rotateX(-Math.PI / 2);
    face.translate(0, r * 0.16 + 0.0002, 0);
    out.push({ geometry: place(face, p.clone().addScaledVector(n, 0.0008), n, d.rotation), look: 'face' });
  } else if (d.kind === 'zipper') {
    // Cremallera decorativa: línea sobre la tela, girada `rotation`
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q.clone().invert());
    const along = new THREE.Vector3(up.x, up.y, 0).normalize().applyAxisAngle(new THREE.Vector3(0, 0, 1), d.rotation).applyQuaternion(q);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const s = (i / 12 - 0.5) * d.size;
      const guess = p.clone().addScaledVector(along, s);
      const hit = hitCloth(targets, guess, n);
      pts.push((hit ? hit.point : guess).addScaledVector(n, 0.0008));
    }
    for (const part of zipper(pts)) out.push({ geometry: part.geometry, look: part.metal ? 'metal' : 'base' });
  }
  return out;
}

/** ¿Se dibuja como calco (textura sobre la tela)? */
export function isDecal(kind: CustomDetail['kind']): boolean {
  return kind === 'patch' || kind === 'embroidery' || kind === 'print' || kind === 'label' || kind === 'pocket' || kind === 'drawing';
}
