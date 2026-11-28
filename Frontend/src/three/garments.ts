/**
 * Modelos 3D procedurales de prendas.
 *
 * Cada prenda se genera "vistiendo" el cuerpo paramétrico de `body.ts`:
 * - El torso de la prenda sigue la sección del cuerpo más una holgura (ease).
 * - `drape` decide cuánto cae recta la tela desde el pecho (en vez de pegarse
 *   a la cintura), como pasa con la ropa real.
 * - Pliegues, arrugas, bajos con dobladillo, escotes, cuellos, costuras y
 *   botones se añaden por código.
 *
 * Si una prenda tiene `modelUrl` (un .glb real), el visor carga ese archivo
 * en lugar de este modelo procedural (ver GltfGarment.tsx).
 */
import * as THREE from 'three';
import type { Attributes } from '../api/types';
import { footPoint, footSurface, makeBody, type Body, type Foot, type Limb, type Section } from './body';
import { bakeShading } from './cloth';
import type { DetailMapInfo } from './detailMaps';
import type { LibraryEntry } from './libraryCatalog';
import { fabricFor, type FabricKind } from './fabric';
import { mergeGeometries, mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  cord,
  curveFrames,
  curvePoint,
  folds,
  lerp,
  paramSurface,
  smoothstep,
  TEX_DENSITY,
  tubeAlong,
  type P3,
} from './surface';

/** Tono de cada pieza: base = color de la prenda; el resto se deriva de él. */
export type Tone = 'base' | 'dark' | 'light' | 'sole' | 'metal' | 'stitch';

/**
 * Papel de cada pieza: decide qué color de la personalización se le aplica
 * (botones, pespuntes, cremallera...). Sin color propio, se usa el tono
 * derivado del color principal.
 */
export type Role =
  | 'body'
  | 'trim'
  | 'secondary'
  | 'lining'
  | 'seam'
  | 'stitch'
  | 'thread'
  | 'button'
  | 'zipper'
  | 'hardware'
  | 'sole'
  | 'lace'
  | 'label';

export interface GarmentPart {
  geometry: THREE.BufferGeometry;
  tone: Tone;
  /** Tejido de esta pieza; por defecto, el de la prenda. 'none' = liso. */
  fabric?: FabricKind | 'none';
  /** Papel (para los colores personalizados). Por defecto se deduce del tono. */
  role?: Role;
  /** Pieza metálica (cremalleras, remaches, botones de metal). */
  metal?: boolean;
  /** Prenda forrada: la cara interior se ve con el color del forro. */
  lined?: boolean;
  /**
   * Relieve horneado en Blender (modelos de la biblioteca que lo traen): la
   * geometría lleva el atributo `detailUv` (u, v, máscara). Ver detailMaps.ts.
   */
  detail?: DetailMapInfo;
}

export interface GarmentBuild {
  parts: GarmentPart[];
  fabric: FabricKind;
  /** Rotación con la que la prenda se ve mejor cuando se muestra sola. */
  presentation?: [number, number, number];
  /**
   * Prenda hecha con un modelo de la biblioteca (garmentLibrary.ts): no se
   * simula (la caída ya está modelada) y sus detalles se colocan con su
   * propia deformación al cuerpo.
   */
  library?: {
    entry: LibraryEntry;
    mapDetail: (p: THREE.Vector3, n: THREE.Vector3) => { p: THREE.Vector3; n: THREE.Vector3 };
  };
}

// ---------------------------------------------------------------------------
// Personalización (piezas, tipo de botón, pespunte, metal)
// ---------------------------------------------------------------------------

export type ButtonStyle = 'four_hole' | 'two_hole' | 'shank' | 'snap' | 'toggle' | 'covered';
export type StitchStyle = 'single' | 'double' | 'none';
export type MetalFinish = 'silver' | 'gold' | 'gunmetal' | 'brass' | 'copper' | 'black';

/** Lo que usan los constructores (ya resuelto, con valores por defecto). */
export interface BuildOptions {
  parts?: Record<string, boolean>;
  buttonStyle?: ButtonStyle;
  stitchStyle?: StitchStyle;
}

interface BuildContext {
  parts: Record<string, boolean>;
  buttonStyle: ButtonStyle | null;
  stitch: StitchStyle;
}

/**
 * Contexto de la prenda que se está construyendo. Se fija en buildGarment
 * (la construcción es síncrona), así los ayudantes (botones, pespuntes...) no
 * necesitan recibirlo en cada llamada.
 */
let ctx: BuildContext = { parts: {}, buttonStyle: null, stitch: 'single' };

/** ¿Lleva la pieza `key`? Manda la personalización; si no, el estilo. */
const has = (key: string, styleDefault: boolean): boolean => ctx.parts[key] ?? styleDefault;

const attr = (a: Attributes, key: string): string | undefined => {
  const v = a[key];
  return typeof v === 'string' ? v : undefined;
};

/** Busca `key` en un mapa; si no está, devuelve `fallback`. */
function pick<T>(map: Record<string, T>, key: string | undefined, fallback: T): T {
  return key !== undefined && key in map ? map[key] : fallback;
}

/** Muestras equiespaciadas entre a y b. */
function steps(a: number, b: number, n: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => lerp(a, b, i / n));
}

const v3 = (p: P3) => new THREE.Vector3(p[0], p[1], p[2]);
const FRONT = Math.PI / 2;

// ---------------------------------------------------------------------------
// Torso de una prenda ("shell")
// ---------------------------------------------------------------------------

interface ShellOptions {
  /** Altura del bajo y del borde superior para cada ángulo θ. */
  bottom: (theta: number) => number;
  top: (theta: number) => number;
  ease: number;
  /** 0 = ceñido al cuerpo; 1 = cae recto desde el pecho. */
  drape: number;
  /** Holgura extra según la altura (vuelo de faldas y abrigos). */
  flare?: (y: number, sec: Section) => number;
  /** Amplitud de pliegues verticales según u (0 = bajo, 1 = arriba). */
  foldAmp?: (u: number) => number;
  foldCount?: number;
  /** Semiángulo de la abertura delantera (chaquetas abiertas). */
  gap?: (u: number) => number;
  closeBottom?: boolean;
  rows?: number;
  cols?: number;
}

/** Sección de la prenda: con caída, la tela no se mete en la cintura. */
/**
 * Sección del cuerpo para vestirlo. En las siluetas de mujer, el pecho del
 * maniquí esculpido queda algo por debajo de la altura de pecho del perfil y
 * sobresale unos milímetros: la ropa generada por código lleva ahí un poco
 * más de holgura delante para no dejarlo asomar.
 */
function clothSection(b: Body, y: number): Section {
  const sec = b.section(y);
  if (b.shape.sex !== 'female') return sec;
  const apex = b.y.chest - 0.035 * b.s;
  const k = Math.exp(-Math.pow((y - apex) / (0.05 * b.s), 2));
  return { ...sec, rzf: sec.rzf + k * (0.006 + 0.02 * Math.max(0, b.shape.bust - 1)) };
}

function drapedSection(b: Body, y: number, drape: number): Section {
  const sec = clothSection(b, y);
  if (y >= b.y.chest || drape <= 0) return sec;
  const c = clothSection(b, b.y.chest);
  const dy = b.y.chest - y;
  const taper = lerp(0.9, 0, drape);
  return {
    rx: Math.max(sec.rx, c.rx - dy * taper),
    rzf: Math.max(sec.rzf, c.rzf - dy * taper),
    rzb: Math.max(sec.rzb, c.rzb - dy * taper * 1.2),
  };
}

function shell(b: Body, o: ShellOptions) {
  const thetaOf = (u: number, phi: number) => {
    if (!o.gap) return FRONT + phi * Math.PI * 2;
    const g = o.gap(u);
    return FRONT + g + phi * (Math.PI * 2 - 2 * g);
  };
  const point = (u: number, phi: number, extra = 0): P3 => {
    const theta = thetaOf(u, phi);
    const y = lerp(o.bottom(theta), o.top(theta), u);
    let sec = drapedSection(b, y, o.drape);
    let e = o.ease + extra + (o.flare ? o.flare(y, sec) : 0);
    if (o.foldAmp) e += o.foldAmp(u) * folds(theta, o.foldCount ?? 9, 1.3);
    if (o.closeBottom) {
      const k = Math.sqrt(smoothstep(0, 0.22, u));
      // Por detrás se cierra antes: el glúteo del maniquí baja hasta la
      // entrepierna y, si no, asomaba por el fondillo del pantalón.
      const kb = Math.sqrt(smoothstep(0, 0.05, u));
      sec = { rx: sec.rx * k, rzf: sec.rzf * k, rzb: sec.rzb * kb };
      e *= k;
    }
    return b.surface(y, theta, e, sec);
  };
  const height = o.top(FRONT) - o.bottom(FRONT);
  const geometry = paramSurface({
    rows: o.rows ?? 40,
    cols: o.cols ?? 72,
    closed: !o.gap,
    point,
    uvScale: [0.95 * TEX_DENSITY, Math.abs(height) * TEX_DENSITY],
  });
  /** Puntos de un borde (u fijo) para dobladillos y costuras. */
  const edge = (u: number, extra = 0.002, n = 72) =>
    Array.from({ length: n + (o.gap ? 1 : 0) }, (_, i) => v3(point(u, i / n, extra)));
  /** Puntos a lo largo (φ fijo), p. ej. el borde de una chaqueta abierta. */
  const along = (phi: number, extra = 0.002, n = 24) =>
    Array.from({ length: n + 1 }, (_, i) => v3(point(i / n, phi, extra)));
  return { geometry, edge, along, closed: !o.gap };
}

/** Dobladillo (cordón) en un borde. */
function hem(points: THREE.Vector3[], radius: number, closed: boolean, tone: Tone = 'base', role: Role = 'body'): GarmentPart {
  return { geometry: cord(points, radius, closed, 8), tone, role };
}

/**
 * Bajo con dobladillo: el borde (cordón fino) y el pespunte del dobladillo
 * a `up` por encima, como en la ropa real.
 */
function hemWithStitch(edge: THREE.Vector3[], stitchEdge: THREE.Vector3[], radius: number, closed: boolean, role: Role = 'body'): GarmentPart[] {
  return [hem(edge, radius, closed, 'base', role), ...stitches(stitchEdge, closed)];
}

/** Punto sobre la tela (teniendo en cuenta su caída). */
function onCloth(b: Body, y: number, theta: number, e: number, drape: number): THREE.Vector3 {
  return v3(b.surface(y, theta, e, drapedSection(b, y, drape)));
}

/** Normal (hacia fuera) de la tela en (y, θ), calculada con dos puntos vecinos. */
function clothNormal(b: Body, y: number, theta: number, e: number, drape: number): THREE.Vector3 {
  const p = onCloth(b, y, theta, e, drape);
  const pu = onCloth(b, y + 0.004, theta, e, drape).sub(p);
  const pt = onCloth(b, y, theta + 0.02, e, drape).sub(p);
  const n = new THREE.Vector3().crossVectors(pu, pt).normalize();
  // Debe apuntar hacia fuera (lejos del eje del cuerpo).
  if (n.x * p.x + n.z * (p.z - 0.01) < 0) n.negate();
  return n;
}

/** Orienta una geometría construida con su eje en +Y hacia la normal `n` y la coloca en `p`. */
export function place(g: THREE.BufferGeometry, p: THREE.Vector3, n: THREE.Vector3, spin = 0): THREE.BufferGeometry {
  if (spin) g.rotateY(spin);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize()));
  g.translate(p.x, p.y, p.z);
  return g;
}

/** Perfil de botón de 2/4 agujeros: borde alzado y centro hundido. */
export function buttonDisc(r: number): THREE.BufferGeometry {
  const t = Math.max(0.0022, r * 0.3);
  const pts = [
    new THREE.Vector2(0.0001, t * 0.45),
    new THREE.Vector2(r * 0.55, t * 0.5),
    new THREE.Vector2(r * 0.72, t * 0.85),
    new THREE.Vector2(r * 0.9, t),
    new THREE.Vector2(r, t * 0.6),
    new THREE.Vector2(r * 0.97, 0),
    new THREE.Vector2(0.0001, 0),
  ];
  return new THREE.LatheGeometry(pts, 20);
}

/**
 * Botón cosido sobre la tela, según el tipo elegido (cuatro o dos agujeros
 * con hilo, de pie metálico, automático, alamar o forrado de tela).
 * `fallback` es el tipo propio de la prenda si el usuario no elige otro.
 */
function button(
  b: Body,
  y: number,
  theta: number,
  e: number,
  r = 0.0075,
  tone: Tone = 'light',
  drape = 0,
  fallback: ButtonStyle = 'four_hole',
): GarmentPart[] {
  const style = ctx.buttonStyle ?? fallback;
  const p = onCloth(b, y, theta, e + 0.0015, drape);
  const n = clothNormal(b, y, theta, e, drape);
  const parts: GarmentPart[] = [];
  if (style === 'four_hole' || style === 'two_hole') {
    parts.push({ geometry: place(buttonDisc(r), p, n), tone, role: 'button', fabric: 'none' });
    // Hilo cruzado (o recto) entre los agujeros.
    const h = r * 0.28;
    const lift = Math.max(0.0022, r * 0.3) * 0.5 + 0.0004;
    const segs: [number, number, number, number][] =
      style === 'four_hole' ? [[-h, -h, h, h], [-h, h, h, -h]] : [[-h, 0, h, 0]];
    for (const [x0, z0, x1, z1] of segs) {
      const g = new THREE.CylinderGeometry(0.00045, 0.00045, Math.hypot(x1 - x0, z1 - z0) + 0.0009, 5);
      g.rotateZ(Math.PI / 2);
      g.rotateY(-Math.atan2(z1 - z0, x1 - x0));
      g.translate((x0 + x1) / 2, lift, (z0 + z1) / 2);
      parts.push({ geometry: place(g, p, n), tone: 'stitch', role: 'thread', fabric: 'none' });
    }
  } else if (style === 'shank') {
    const g = new THREE.SphereGeometry(r * 0.95, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
    g.scale(1, 0.55, 1);
    g.translate(0, -r * 0.33, 0);
    parts.push({ geometry: place(g, p, n), tone: 'metal', role: 'button', fabric: 'none', metal: true });
  } else if (style === 'snap') {
    const ring = new THREE.TorusGeometry(r * 0.78, r * 0.2, 8, 24);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, r * 0.12, 0);
    const cap = new THREE.CylinderGeometry(r * 0.62, r * 0.7, r * 0.22, 20);
    cap.translate(0, r * 0.16, 0);
    parts.push({ geometry: place(ring, p, n), tone: 'metal', role: 'button', fabric: 'none', metal: true });
    parts.push({ geometry: place(cap, p, n), tone: 'metal', role: 'button', fabric: 'none', metal: true });
  } else if (style === 'toggle') {
    const g = new THREE.CapsuleGeometry(r * 0.42, r * 3.2, 4, 10);
    g.rotateZ(Math.PI / 2);
    g.translate(0, r * 0.45, 0);
    parts.push({ geometry: place(g, p, n), tone, role: 'button', fabric: 'none' });
  } else {
    // Forrado: cúpula con la misma tela de la prenda.
    const g = new THREE.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.45);
    g.scale(1, 0.55, 1);
    g.translate(0, -r * 0.08, 0);
    parts.push({ geometry: place(g, p, n), tone: 'base', role: 'body' });
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Pespuntes (puntadas reales, discontinuas) y costuras
// ---------------------------------------------------------------------------

/**
 * Pespunte: puntadas cortas separadas a lo largo de `points` (como una
 * costura de verdad, no una línea continua). Con estilo "double", dos filas
 * paralelas. Devuelve [] si el usuario ha elegido "sin pespunte".
 */
function stitches(points: THREE.Vector3[], closed = false, opts: { gap?: number; force?: StitchStyle } = {}): GarmentPart[] {
  const style = opts.force ?? ctx.stitch;
  if (style === 'none' || points.length < 2) return [];
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  const length = curve.getLength();
  const dash = 0.0028;
  const space = 0.0016;
  const n = Math.max(2, Math.floor(length / (dash + space)));
  const offsets = style === 'double' ? [-(opts.gap ?? 0.0032) / 2, (opts.gap ?? 0.0032) / 2] : [0];
  const radial = 5;
  const radius = 0.00052;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const tmpSide = new THREE.Vector3();
  const tmpOut = new THREE.Vector3();
  for (const off of offsets) {
    for (let i = 0; i < n; i++) {
      const u0 = i / n;
      const u1 = Math.min(1, u0 + (dash / length));
      const a = curve.getPointAt(u0);
      const c = curve.getPointAt(u1);
      const tan = c.clone().sub(a).normalize();
      // "Fuera" ≈ alejándose del eje vertical del cuerpo.
      tmpOut.set(a.x, 0, a.z - 0.01).normalize();
      tmpSide.crossVectors(tan, tmpOut).normalize();
      if (off) {
        a.addScaledVector(tmpSide, off);
        c.addScaledVector(tmpSide, off);
      }
      // Cada puntada: tubo corto de 5 lados, algo hundido en la tela.
      const up = new THREE.Vector3().crossVectors(tmpSide, tan).normalize();
      const base = positions.length / 3;
      for (const q of [a, c]) {
        for (let j = 0; j < radial; j++) {
          const ang = (j / radial) * Math.PI * 2;
          const dir = tmpSide.clone().multiplyScalar(Math.cos(ang)).addScaledVector(up, Math.sin(ang));
          const pos = q.clone().addScaledVector(dir, radius);
          positions.push(pos.x, pos.y, pos.z);
          normals.push(dir.x, dir.y, dir.z);
        }
      }
      for (let j = 0; j < radial; j++) {
        const j1 = (j + 1) % radial;
        indices.push(base + j, base + radial + j, base + j1, base + j1, base + radial + j, base + radial + j1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setIndex(indices);
  return [{ geometry: g, tone: 'stitch', role: 'stitch', fabric: 'none' }];
}

/** Costura: surco fino (algo más oscuro que la tela). */
function seamLine(points: THREE.Vector3[], closed = false): GarmentPart {
  return { geometry: cord(points, 0.0007, closed, 4), tone: 'dark', role: 'seam', fabric: 'none' };
}

/** Puntos sobre la tela a partir de [y, θ] (para costuras y pespuntes). */
const clothPts = (b: Body, pts: [number, number][], e: number, drape = 0) => pts.map(([y, th]) => onCloth(b, y, th, e, drape));

/**
 * Bolsillo de parche sobre el torso: pieza de tela algo abombada, con
 * dobladillo arriba, pespunte alrededor y, si se pide, solapa con botón.
 * (cy, thC) es el centro; w y h, ancho y alto en metros.
 */
function patchPocket(
  b: Body,
  cy: number,
  thC: number,
  w: number,
  h: number,
  e: number,
  drape: number,
  o: { pointed?: boolean; flap?: boolean; tone?: Tone; role?: Role; fabric?: FabricKind } = {},
): GarmentPart[] {
  const center = onCloth(b, cy, thC, e, drape);
  const R = Math.max(0.05, Math.hypot(center.x, center.z - 0.01));
  const dth = w / 2 / R;
  const bottomAt = (k: number) => cy - h / 2 - (o.pointed ? 0.014 * (1 - Math.abs(k)) : 0);
  const pt = (u: number, k: number, lift: number) => {
    const y = lerp(bottomAt(k), cy + h / 2, u);
    return onCloth(b, y, thC + k * dth, e + lift, drape);
  };
  const bulge = (u: number, k: number) => 0.0028 * Math.sin(Math.PI * u) * Math.cos((k * Math.PI) / 2) + 0.0016;
  const parts: GarmentPart[] = [
    {
      geometry: paramSurface({
        rows: 8,
        cols: 10,
        closed: false,
        uvScale: [w * TEX_DENSITY, h * TEX_DENSITY],
        point: (u, phi) => {
          const k = phi * 2 - 1;
          const q = pt(u, k, bulge(u, k));
          return [q.x, q.y, q.z];
        },
      }),
      tone: o.tone ?? 'base',
      role: o.role ?? 'body',
      fabric: o.fabric,
    },
    // Dobladillo de la boca del bolsillo
    { geometry: cord(steps(-1, 1, 8).map((k) => pt(1, k, bulge(1, k) + 0.0006)), 0.0012, false, 5), tone: o.tone ?? 'base', role: o.role ?? 'body', fabric: o.fabric },
  ];
  // Pespunte en "U" a 3 mm del borde
  const inset = 0.92;
  const outline = [
    ...steps(1, 0, 6).map((u) => pt(u * 0.96, -inset, bulge(u, -inset) + 0.0009)),
    ...steps(-inset, inset, 8).map((k) => pt(0.03, k, bulge(0.03, k) + 0.0009)),
    ...steps(0, 1, 6).map((u) => pt(u * 0.96, inset, bulge(u, inset) + 0.0009)),
  ];
  parts.push(...stitches(outline));
  if (o.flap) {
    const flapH = Math.min(0.03, h * 0.35);
    const fp = (u: number, k: number) => {
      const y = cy + h / 2 + 0.004 - u * flapH * (o.pointed ? 1 - 0.35 * Math.abs(k) : 1);
      return onCloth(b, y, thC + k * dth * 1.04, e + 0.0042, drape);
    };
    parts.push({
      geometry: paramSurface({ rows: 3, cols: 10, closed: false, point: (u, phi) => {
        const q = fp(u, phi * 2 - 1);
        return [q.x, q.y, q.z];
      } }),
      tone: o.tone ?? 'base',
      role: o.role ?? 'body',
      fabric: o.fabric,
    });
    parts.push(...stitches(steps(-0.9, 0.9, 8).map((k) => fp(0.75, k).add(new THREE.Vector3(0, 0, 0.0006)))));
    parts.push(...button(b, cy + h / 2 + 0.004 - flapH * 0.6, thC, e + 0.004, 0.0055, 'light', drape));
  }
  return parts;
}


// ---------------------------------------------------------------------------
// Piezas comunes: charreteras, cremalleras, cinturones, trabillas, remaches
// ---------------------------------------------------------------------------

/** Altura de la tela en el costado (θ) a una distancia x del eje (sobre el hombro). */
function shoulderY(b: Body, x: number, theta: number, e: number, drape: number): number {
  let lo = b.y.shoulder - 0.04;
  let hi = b.y.neck + 0.02;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const px = Math.abs(onCloth(b, mid, theta, e, drape).x);
    if (px > x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Charreteras: tira sobre cada hombro con su botón junto al cuello. */
function epaulettes(b: Body, ease: number, drape: number, width = 0.034): GarmentPart[] {
  const parts: GarmentPart[] = [];
  const x0 = b.neckR + 0.03;
  // Termina antes de la copa de la manga (que cubre el hombro).
  const x1 = lerp(x0, b.torso(b.y.shoulder), 0.72);
  for (const side of [0, Math.PI]) {
    const yAt = (u: number) => shoulderY(b, lerp(x0, x1, u), side, ease, drape);
    const R = x1;
    const pt = (u: number, k: number, lift: number) => onCloth(b, yAt(u), side + (side ? -1 : 1) * k * (width / 2 / R), ease + lift, drape);
    parts.push({
      geometry: paramSurface({
        rows: 8,
        cols: 6,
        closed: false,
        point: (u, phi) => {
          const k = phi * 2 - 1;
          const q = pt(u, k, 0.0035 + 0.0012 * (1 - k * k));
          return [q.x, q.y, q.z];
        },
      }),
      tone: 'base',
    });
    parts.push(...stitches([...steps(0.95, 0.05, 6).map((u) => pt(u, -0.75, 0.0052)), ...steps(0.05, 0.95, 6).map((u) => pt(u, 0.75, 0.0052))]));
    const bp = pt(0.12, 0, 0.0055);
    const n = bp.clone().sub(onCloth(b, yAt(0.12), side, ease - 0.01, drape)).normalize();
    parts.push({ geometry: place(buttonDisc(0.0055), bp, n), tone: 'light', role: 'button', fabric: 'none' });
  }
  return parts;
}

/**
 * Cremallera real: cinta, dos filas de dientes que encajan y el carro con
 * su tirador arriba. `points` va de abajo arriba sobre la tela.
 */
export function zipper(points: THREE.Vector3[], o: { teeth?: number; pull?: boolean } = {}): GarmentPart[] {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const length = curve.getLength();
  const pitch = o.teeth ?? 0.0021;
  const n = Math.max(4, Math.floor(length / pitch));
  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n;
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u);
    const out = new THREE.Vector3(p.x, 0, p.z - 0.01).normalize();
    const side = new THREE.Vector3().crossVectors(tan, out).normalize();
    // Dientes alternos a cada lado, encajados en el centro
    const s = i % 2 === 0 ? 1 : -1;
    const g = new THREE.BoxGeometry(0.0042, 0.0013, 0.0016);
    const m = new THREE.Matrix4().makeBasis(side, out, tan);
    g.applyMatrix4(m);
    g.translate(p.x + side.x * s * 0.0011 + out.x * 0.0012, p.y + side.y * s * 0.0011 + out.y * 0.0012, p.z + side.z * s * 0.0011 + out.z * 0.0012);
    geos.push(g);
  }
  const teeth = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  const parts: GarmentPart[] = [
    // Cinta textil plana a ambos lados de los dientes
    { geometry: ribbon(curve, 0.011, 0.0006), tone: 'dark', role: 'zipper', fabric: 'woven' },
  ];
  if (teeth) parts.push({ geometry: teeth, tone: 'metal', role: 'zipper', fabric: 'none', metal: true });
  if (o.pull !== false) {
    const top = curve.getPointAt(0.97);
    const tan = curve.getTangentAt(0.97);
    const out = new THREE.Vector3(top.x, 0, top.z - 0.01).normalize();
    const side = new THREE.Vector3().crossVectors(tan, out).normalize();
    const m = new THREE.Matrix4().makeBasis(side, out, tan);
    const slider = new THREE.BoxGeometry(0.009, 0.004, 0.012);
    slider.applyMatrix4(m);
    slider.translate(top.x + out.x * 0.003, top.y + out.y * 0.003, top.z + out.z * 0.003);
    const tab = new THREE.BoxGeometry(0.007, 0.0015, 0.022);
    tab.translate(0, 0, -0.012);
    tab.applyMatrix4(m);
    tab.translate(top.x + out.x * 0.0055, top.y + out.y * 0.0055 - 0.004, top.z + out.z * 0.0055);
    parts.push({ geometry: slider, tone: 'metal', role: 'zipper', fabric: 'none', metal: true });
    parts.push({ geometry: tab, tone: 'metal', role: 'zipper', fabric: 'none', metal: true });
  }
  return parts;
}

/** Cinta plana que sigue una curva sobre la tela (cintas, vivos). */
function ribbon(curve: THREE.Curve<THREE.Vector3>, width: number, lift: number, rows = 48): THREE.BufferGeometry {
  return paramSurface({
    rows,
    cols: 2,
    closed: false,
    point: (u, phi) => {
      const p = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const out = new THREE.Vector3(p.x, 0, p.z - 0.01).normalize();
      const side = new THREE.Vector3().crossVectors(tan, out).normalize();
      const q = p.addScaledVector(side, (phi - 0.5) * width).addScaledVector(out, lift);
      return [q.x, q.y, q.z];
    },
  });
}

/** Cinturón con hebilla metálica delante (y trabilla). */
function belt(b: Body, y: number, ease: number, drape: number, o: { height?: number; fabric?: FabricKind; role?: Role; tone?: Tone } = {}): GarmentPart[] {
  const h = o.height ?? 0.032 * b.s;
  const band = shell(b, { bottom: () => y - h / 2, top: () => y + h / 2, ease: ease + 0.006, drape, rows: 4, cols: 96 });
  const parts: GarmentPart[] = [
    { geometry: band.geometry, tone: o.tone ?? 'dark', role: o.role ?? 'trim', fabric: o.fabric ?? 'leather' },
    ...stitches(band.edge(0.82, 0.0008), true),
    ...stitches(band.edge(0.18, 0.0008), true),
  ];
  // Hebilla: marco rectangular de metal con su púa
  const p = onCloth(b, y, FRONT + 0.06, ease + 0.0085, drape);
  const n = clothNormal(b, y, FRONT + 0.06, ease, drape);
  const frame = new THREE.TorusGeometry(h * 0.62, 0.0018, 6, 4);
  frame.rotateZ(Math.PI / 4);
  frame.scale(0.95, 1, 1);
  frame.rotateX(Math.PI / 2);
  parts.push({ geometry: place(frame, p, n), tone: 'metal', role: 'hardware', fabric: 'none', metal: true });
  const prong = new THREE.CylinderGeometry(0.0011, 0.0011, h * 0.9, 6);
  prong.rotateZ(Math.PI / 2);
  parts.push({ geometry: place(prong, p.clone().addScaledVector(n, 0.001), n), tone: 'metal', role: 'hardware', fabric: 'none', metal: true });
  return parts;
}

/** Trabillas del pantalón alrededor de la cinturilla. */
function beltLoops(b: Body, waistY: number, ease: number): GarmentPart[] {
  const parts: GarmentPart[] = [];
  const ths = [FRONT + 0.62, FRONT - 0.62, 0.05, Math.PI - 0.05, -Math.PI / 2, -Math.PI / 2 + 0.75, -Math.PI / 2 - 0.75];
  for (const th of ths) {
    const R = Math.hypot(onCloth(b, waistY, th, ease, 0).x, onCloth(b, waistY, th, ease, 0).z);
    const dth = 0.0055 / R;
    parts.push({
      geometry: paramSurface({
        rows: 4,
        cols: 3,
        closed: false,
        point: (u, phi) => {
          const y = lerp(waistY - 0.036 * b.s, waistY + 0.004, u);
          const bump = 0.0018 * Math.sin(Math.PI * u) + 0.0032;
          const q = onCloth(b, y, th + (phi * 2 - 1) * dth, ease + bump, 0);
          return [q.x, q.y, q.z];
        },
      }),
      tone: 'base',
      role: 'trim',
    });
  }
  return parts;
}

/** Remache de vaquero (cabeza abombada de metal). */
function rivet(b: Body, y: number, theta: number, e: number, drape = 0): GarmentPart {
  const g = new THREE.SphereGeometry(0.0026, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
  g.scale(1, 0.6, 1);
  return { geometry: place(g, onCloth(b, y, theta, e + 0.0005, drape), clothNormal(b, y, theta, e, drape)), tone: 'metal', role: 'hardware', fabric: 'none', metal: true };
}

// ---------------------------------------------------------------------------
// Mangas y perneras
// ---------------------------------------------------------------------------

/** Anillo de puntos alrededor de un brazo/pierna en t (para dobladillos). */
function limbRing(limb: Limb, t: number, r: number, n = 28): THREE.Vector3[] {
  const [f] = curveFrames(limb.curve, [t]);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return f.center.clone().addScaledVector(f.normal, Math.cos(a) * r).addScaledVector(f.binormal, Math.sin(a) * r);
  });
}

interface SleeveOptions {
  from: number;
  to: number;
  ease: (t: number) => number;
  /** Arrugas: [centro t, anchura, amplitud] */
  wrinkles?: [number, number, number][];
  /**
   * Cierra el principio con una "copa" redondeada (copa de manga sobre el
   * hombro). Sin ella, el tubo quedaría abierto y se vería como un cilindro.
   */
  cap?: boolean;
  /** Acolchado: altura de cada "canal" en metros (plumíferos). */
  puff?: number;
  /** Pespunte del dobladillo junto al final (por defecto, sí). */
  hemStitch?: boolean;
  /** Holgura extra según t y φ (p. ej., el fondillo detrás de la pernera). */
  extra?: (t: number, phi: number) => number;
}

function sleeveLike(limb: Limb, o: SleeveOptions): GarmentPart[] {
  const length = limb.curve.getLength();
  const base = (t: number, phi: number) => {
    let w = 0;
    for (const [c, width, amp] of o.wrinkles ?? []) {
      const g = Math.exp(-Math.pow((t - c) / width, 2));
      w += g * amp * Math.sin(t * 95 + Math.sin(phi * Math.PI * 4 + t * 20) * 1.6);
    }
    if (o.puff) w += puffAt(t * length, o.puff);
    return limb.radius(t) + o.ease(t) + w + (o.extra ? o.extra(t, phi) : 0);
  };

  let from = o.from;
  let r = base;
  if (o.cap) {
    // La copa es media esfera (algo achatada) centrada en la articulación del
    // hombro: el radio cae de forma circular hasta cerrarse.
    const r0 = limb.radius(0) + o.ease(0);
    const dt = (r0 * 1.05) / length;
    from = -dt;
    r = (t: number, phi: number) => {
      if (t >= 0) return base(t, phi);
      const k = t / -dt; // 0 en la articulación, 1 en el extremo
      return r0 * Math.sqrt(Math.max(0, 1 - k * k));
    };
  }
  const parts: GarmentPart[] = [
    { geometry: tubeAlong(limb.curve, from, o.to, r, 40, 32), tone: 'base' },
    hem(limbRing(limb, o.to - 0.004, r(o.to, 0) + 0.001), 0.0032, true),
  ];
  if (o.hemStitch !== false) {
    // Pespunte del dobladillo, a ~1,5 cm del borde.
    const tS = o.to - 0.015 / length;
    parts.push(...stitches(limbRing(limb, tS, r(tS, 0) + 0.0007, 64), true));
  }
  return parts;
}

/** Abultamiento de un acolchado (canales separados por costuras). */
function puffAt(d: number, period: number): number {
  return 0.012 * Math.pow(Math.abs(Math.sin((Math.PI * d) / period)), 0.6);
}

interface SleeveExtras {
  cuff?: boolean;
  /** Mangas remangadas (vuelta ancha de tela por encima del codo o del bíceps). */
  rolled?: boolean;
  /** Puño elástico de canalé (bomber, varsity). */
  ribCuff?: boolean;
  /** Mangas cortas algo más largas (oversize). */
  extraLength?: number;
  puff?: number;
}

function sleeves(b: Body, kind: string, ease: number, opts: SleeveExtras = {}): GarmentPart[] {
  if (kind === 'sleeveless') return [];
  let end = pick({ short: 0.33, three_quarter: 0.72, long: 1.01, raglan: 1.01 }, kind, 0.33);
  const isShort = end < 0.5;
  if (isShort) end += opts.extraLength ?? 0;
  // Remangadas: la manga larga se queda por debajo del codo; la corta, más corta.
  if (opts.rolled) end = isShort ? end - 0.05 : Math.min(end, b.elbowT + 0.12);
  const parts: GarmentPart[] = [];
  // Las mangas largas se estrechan del codo al puño (con la misma holgura en
  // todo el brazo, el puño quedaba muy ancho y la manga parecía acampanada).
  const taper = (t: number) => (isShort ? 1 : 1 - 0.45 * smoothstep(b.elbowT - 0.1, 1, t));
  for (const arm of b.arms) {
    parts.push(
      ...sleeveLike(arm, {
        from: 0,
        to: opts.ribCuff ? end - 0.06 : end,
        cap: true,
        // Las mangas cortas se abren un poco; las largas se arrugan en codo y muñeca
        ease: (t) => ease * taper(t) + (isShort ? (0.008 * Math.max(0, t)) / end : 0),
        wrinkles: isShort ? [] : [[b.elbowT, 0.07, 0.0028], [0.93, 0.06, 0.0032]],
        puff: opts.puff,
        hemStitch: !opts.rolled && !opts.ribCuff && !opts.cuff,
      }),
    );
    if (opts.rolled) {
      // Vuelta de tela: un tubo algo más ancho con su borde.
      const len = arm.curve.getLength();
      const w = (isShort ? 0.03 : 0.055) / len;
      const rr = (t: number, phi: number) => arm.radius(t) + ease * taper(t) + 0.006 + 0.0015 * Math.sin(phi * Math.PI * 2 * 3 + t * 40);
      parts.push({ geometry: tubeAlong(arm.curve, end - w, end + 0.004 / len, rr, 6, 40), tone: 'base' });
      parts.push(hem(limbRing(arm, end - w, arm.radius(end - w) + ease * taper(end - w) + 0.0065), 0.003, true));
      continue;
    }
    if (opts.ribCuff && !isShort) {
      parts.push({
        geometry: tubeAlong(arm.curve, end - 0.065, end, (t, phi) => arm.radius(t) + 0.008 + 0.0012 * Math.sin(phi * Math.PI * 2 * 30), 6, 120),
        tone: 'dark',
        role: 'trim',
        fabric: 'knit',
      });
    } else if (opts.cuff && !isShort) {
      parts.push({
        geometry: tubeAlong(arm.curve, end - 0.07, end, (t) => arm.radius(t) + ease * taper(t) + 0.004, 6, 30),
        tone: 'base',
        role: 'trim',
      });
      // Pespunte del puño
      parts.push(...stitches(limbRing(arm, end - 0.062, arm.radius(end - 0.062) + ease * taper(end - 0.062) + 0.0047, 64), true));
    }
  }
  return parts;
}

/** Banda de canalé (bajo de bomber, cinturilla de jersey...). */
function ribBand(b: Body, bottom: number, height: number, ease: number, drape: number, tone: Tone = 'base'): GarmentPart {
  const rib = shell(b, {
    bottom: () => bottom,
    top: () => bottom + height,
    ease,
    drape,
    foldAmp: () => 0.0012,
    foldCount: 110,
    rows: 6,
    cols: 220,
  });
  return { geometry: rib.geometry, tone, role: 'trim', fabric: 'knit' };
}

/**
 * Holgura mínima para que faldas, vestidos y abrigos no atraviesen las
 * piernas (sobre todo en cortes ceñidos como lápiz o sirena).
 */
function legClearance(b: Body) {
  // Tabla con el centro y el radio de la pierna a varias alturas (la rodilla
  // va algo adelantada, así que también tenemos en cuenta la profundidad).
  const leg = b.legs[0];
  const samples = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    const c = curvePoint(leg.curve, t);
    return { y: c.y, x: Math.abs(c.x), z: c.z, r: leg.radius(t) };
  });
  const topY = samples[0].y;
  const bottomY = samples[40].y;
  const need = (y: number, sec: Section): number => {
    const f = Math.min(40, Math.max(0, ((topY - y) / (topY - bottomY)) * 40));
    const i = Math.min(39, Math.floor(f));
    const k = f - i;
    const p = samples[i];
    const q = samples[i + 1];
    const x = lerp(p.x, q.x, k);
    const z = lerp(p.z, q.z, k);
    const r = lerp(p.r, q.r, k);
    // Margen extra: los pliegues pueden "entrar" hacia dentro
    const xNeed = x + r + 0.02;
    const front = z + r + 0.03;
    const back = -z + r + 0.026;
    return Math.max(0, xNeed - sec.rx, front - sec.rzf, back - sec.rzb);
  };
  // Por encima de la pierna la exigencia se desvanece poco a poco (sin escalones)
  return (y: number, sec: Section): number =>
    y >= topY ? need(topY, sec) * smoothstep(topY + 0.12, topY, y) : need(y, sec);
}

// ---------------------------------------------------------------------------
// Partes de arriba
// ---------------------------------------------------------------------------

interface TopFit {
  ease: number;
  drape: number;
  /** Desplazamiento del bajo (en proporción a la altura): + más largo, - más corto. */
  hem: number;
  sleeveEase: number;
  sleeveLength?: number;
}

/** Cortes de camisetas, camisas y jerséis. */
const TOP_FIT: Record<string, TopFit> = {
  slim: { ease: -0.006, drape: 0.15, hem: 0, sleeveEase: -0.003 },
  regular: { ease: 0, drape: 0.5, hem: 0, sleeveEase: 0 },
  relaxed: { ease: 0.012, drape: 0.8, hem: 0.015, sleeveEase: 0.006 },
  oversized: { ease: 0.03, drape: 1, hem: 0.045, sleeveEase: 0.014, sleeveLength: 0.09 },
  // Boxy: recta y corta, el bajo a la altura de la cintura (cubre justo la
  // pretina del pantalón). Crop: por encima de la cintura.
  boxy: { ease: 0.026, drape: 1, hem: -0.106, sleeveEase: 0.012, sleeveLength: 0.03 },
  cropped: { ease: 0.01, drape: 0.6, hem: -0.215, sleeveEase: 0.004 },
  longline: { ease: 0.008, drape: 0.7, hem: 0.13, sleeveEase: 0.004 },
  muscle: { ease: 0.002, drape: 0.45, hem: 0, sleeveEase: 0 },
  // Baby tee: ceñida, corta y con la manga muy corta.
  baby: { ease: -0.01, drape: 0.1, hem: -0.17, sleeveEase: -0.006, sleeveLength: -0.08 },
};

const topFit = (a: Attributes): TopFit => TOP_FIT[attr(a, 'fit') ?? 'regular'] ?? TOP_FIT.regular;

type NeckKind = 'crew' | 'v' | 'scoop' | 'high' | 'boat' | 'square' | 'mock';

/** Borde superior: escote redondo, de pico, barco, cuadrado, sisas... */
function neckline(b: Body, kind: NeckKind, sleeveless: boolean, deepArmholes = false) {
  // Cerca del cuello (no en el hombro) para que el escote abrace el cuello
  const base = b.y.shoulder + 0.052 * b.s;
  return (theta: number) => {
    const front = Math.max(0, Math.sin(theta));
    const back = Math.max(0, -Math.sin(theta));
    let y = base;
    if (kind === 'crew') y -= 0.04 * b.s * Math.pow(front, 3) + 0.008 * b.s * back;
    if (kind === 'v') y -= 0.15 * b.s * Math.pow(front, 10) + 0.03 * b.s * Math.pow(front, 2);
    if (kind === 'scoop') y -= 0.11 * b.s * Math.pow(front, 4) + 0.04 * b.s * Math.pow(back, 3);
    if (kind === 'boat') y -= 0.035 * b.s + 0.01 * b.s * front;
    if (kind === 'square') y -= 0.11 * b.s * smoothstep(0.55, 0.8, front) + 0.03 * b.s * back;
    if (kind === 'high' || kind === 'mock') y += 0.004;
    // Sisas: el borde baja solo en los costados y deja tirantes sobre los hombros
    if (sleeveless) y -= (deepArmholes ? 0.21 : 0.15) * b.s * Math.pow(Math.abs(Math.cos(theta)), deepArmholes ? 6 : 9);
    return y;
  };
}

interface TopOptions {
  /** Mangas remangadas. */
  rolled?: boolean;
  ease: number;
  bottom: (theta: number) => number;
  neck: NeckKind;
  sleeve: string;
  sleeveEase: number;
  cuff?: boolean;
  foldAmp?: number;
  /** Abertura delantera (cárdigan, camisa abierta). */
  gap?: (u: number) => number;
}

function topBody(a: Attributes, b: Body, layer: number, o: TopOptions) {
  const fit = topFit(a);
  const ease = o.ease + fit.ease + layer;
  const muscle = attr(a, 'fit') === 'muscle';
  const sleeve = muscle ? 'sleeveless' : (attr(a, 'sleeve') ?? o.sleeve);
  const clear = legClearance(b);
  const hipRx = b.section(b.y.hip).rx;
  const sh = shell(b, {
    bottom: (th) => o.bottom(th) - fit.hem * b.s,
    top: neckline(b, o.neck, sleeve === 'sleeveless', muscle),
    ease,
    drape: fit.drape,
    // Por debajo de la cadera la tela cae recta y no atraviesa el pantalón
    flare: (y, sec) =>
      Math.max(y < b.y.hip ? Math.max(0, hipRx - sec.rx) : 0, clear(y, sec) + 0.006 - ease),
    foldAmp: (u) => (o.foldAmp ?? 0.0035) * Math.pow(1 - u, 2),
    foldCount: 7,
    gap: o.gap,
  });
  const parts: GarmentPart[] = [
    { geometry: sh.geometry, tone: 'base' },
    ...hemWithStitch(sh.edge(0), sh.edge(0.018 / Math.max(0.2, b.y.shoulder - b.y.hip), 0.0012), 0.0032, sh.closed),
    ...sleeves(b, sleeve, o.sleeveEase + fit.sleeveEase + layer, { cuff: o.cuff, extraLength: fit.sleeveLength, rolled: o.rolled }),
  ];
  return { parts, ease, shell: sh, drape: fit.drape };
}

interface CollarOptions {
  /** Ángulo de apertura de las puntas delante. */
  open: number;
  /** false = solo pie de cuello (cuello mao). */
  leaf?: boolean;
  /** Tamaño de la solapa (1 = camisa; > 1 = solapas de chaqueta o abrigo). */
  size?: number;
  /** Botoncitos en las puntas (button-down). */
  buttonDown?: boolean;
  tone?: Tone;
  /** Papel del cuello (por defecto "ribete": puede tener color propio). */
  role?: Role;
}

/**
 * Cuello de camisa: pie de cuello alrededor del cuello + solapa que se dobla
 * hacia fuera y descansa sobre los hombros.
 */
function collar(b: Body, ease: number, o: CollarOptions): GarmentPart[] {
  const baseY = b.y.shoulder + 0.046 * b.s;
  const standH = 0.03 * b.s;
  const rn = b.neckR * 1.12 + 0.006;
  const size = o.size ?? 1;
  const tone = o.tone ?? 'base';
  const neckPoint = (th: number, y: number, r: number) =>
    new THREE.Vector3(r * Math.cos(th), y, 0.012 + r * 0.95 * Math.sin(th));
  const stand = paramSurface({
    rows: 4,
    cols: 48,
    closed: false,
    point: (u, phi) => {
      const th = FRONT + o.open * 0.25 + phi * (Math.PI * 2 - o.open * 0.5);
      const p = neckPoint(th, baseY + u * standH, rn);
      return [p.x, p.y, p.z];
    },
  });
  const role: Role = o.role ?? 'trim';
  const parts: GarmentPart[] = [{ geometry: stand, tone, role }];
  const standTop = Array.from({ length: 49 }, (_, i) => neckPoint(FRONT + o.open * 0.25 + (i / 48) * (Math.PI * 2 - o.open * 0.5), baseY + standH, rn));
  if (o.leaf === false) {
    parts.push(hem(standTop, 0.0025, false, tone, role));
    parts.push(...stitches(standTop.map((q) => q.clone().add(new THREE.Vector3(0, -0.005, 0)).add(q.clone().setY(0).normalize().multiplyScalar(0.0012)))));
    return parts;
  }
  const leafPoint = (u: number, phi: number) => {
    // Las puntas se abren por delante y son algo más largas
    const g = o.open * (0.3 + 0.7 * u);
    const th = FRONT + g + phi * (Math.PI * 2 - 2 * g);
    const front = Math.pow(Math.max(0, Math.sin(th)), 2);
    const start = neckPoint(th, baseY + standH + 0.002, rn + 0.004);
    // El borde exterior apoya sobre la prenda, un poco más abajo
    const yEnd = baseY - (0.012 + 0.035 * front) * b.s * size;
    const end = new THREE.Vector3(...b.surface(yEnd, th, ease + 0.006));
    // Curva suave: sube un poco y luego cae (el doblez del cuello)
    const p = start.clone().lerp(end, u);
    p.y += Math.sin(u * Math.PI) * 0.006;
    return p;
  };
  parts.push(
    {
      geometry: paramSurface({
        rows: 8,
        cols: 48,
        closed: false,
        point: (u, phi) => {
          const p = leafPoint(u, phi);
          return [p.x, p.y, p.z];
        },
      }),
      tone,
      role,
    },
    hem(Array.from({ length: 49 }, (_, i) => leafPoint(1, i / 48)), 0.0022, false, tone, role),
  );
  // Pespunte a lo largo del borde del cuello
  parts.push(...stitches(Array.from({ length: 49 }, (_, i) => leafPoint(0.9, i / 48).add(new THREE.Vector3(0, 0.0012, 0.001)))));
  if (o.buttonDown) {
    for (const phi of [0.02, 0.98]) {
      const p = leafPoint(0.85, phi);
      const n = p.clone().setY(0).normalize().add(new THREE.Vector3(0, 0.6, 0)).normalize();
      const style = ctx.buttonStyle ?? 'four_hole';
      const g = style === 'shank' || style === 'snap' ? new THREE.SphereGeometry(0.0036, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45) : buttonDisc(0.0036);
      parts.push({ geometry: place(g, p.clone().addScaledVector(n, 0.0012), n), tone: style === 'shank' || style === 'snap' ? 'metal' : 'light', role: 'button', fabric: 'none', metal: style === 'shank' || style === 'snap' });
    }
  }
  return parts;
}

/** Solapas de chaqueta o abrigo: cuello grande abierto en "V". */
const lapels = (b: Body, ease: number, open = 0.85, size = 1.6) => collar(b, ease, { open, size, role: 'body' });

function tshirt(a: Attributes, b: Body, layer: number): GarmentBuild {
  const neckAttr = attr(a, 'neckline') ?? 'crew';
  const neck: NeckKind = pick<NeckKind>({ v_neck: 'v', scoop: 'scoop', boat: 'boat', mock: 'mock' }, neckAttr, 'crew');
  const { parts, ease, shell: sh, drape } = topBody(a, b, layer, {
    ease: 0.024,
    bottom: (th) => b.y.hip - 0.035 * b.s + 0.004 * Math.sin(th * 3),
    neck,
    sleeve: 'short',
    sleeveEase: 0.012,
    rolled: has('rolledSleeves', false),
  });
  if (neck === 'mock') {
    // Cuello perkins: banda corta de canalé alrededor del cuello
    parts.push({ ...collar(b, ease, { open: 0, leaf: false })[0], fabric: 'knit' });
  } else {
    // Cuello de canalé siguiendo el escote, con su pespunte
    parts.push({ ...hem(sh.edge(1, 0.001), 0.0062, true, 'base', 'trim'), fabric: 'knit' });
    parts.push(...stitches(sh.edge(1 - 0.012 / Math.max(0.2, b.y.shoulder - b.y.hip), 0.0012), true));
  }
  if (neckAttr === 'polo') {
    parts.push(...collar(b, ease, { open: 0.25 }));
  }
  if (neckAttr === 'polo' || neckAttr === 'henley') {
    // Tapeta corta con botones: dos pespuntes y el cierre inferior
    const top = b.y.shoulder + 0.01 * b.s;
    const low = top - 0.13 * b.s;
    for (const d of [0.032, -0.032]) parts.push(...stitches(clothPts(b, steps(low, top, 8).map((y): [number, number] => [y, FRONT + d]), ease + 0.0012, drape)));
    parts.push(...stitches(clothPts(b, steps(FRONT - 0.032, FRONT + 0.032, 4).map((th): [number, number] => [low, th]), ease + 0.0012, drape)));
    parts.push(seamLine(clothPts(b, steps(low, top, 6).map((y): [number, number] => [y, FRONT + 0.002]), ease + 0.0008, drape)));
    for (let i = 0; i < 3; i++) {
      parts.push(...button(b, top - (0.03 + i * 0.04) * b.s, FRONT, ease, 0.006, 'light', drape));
    }
  }
  if (has('chestPocket', false)) {
    parts.push(...patchPocket(b, b.y.chest + 0.025 * b.s, FRONT + 0.45, 0.095 * b.s, 0.105 * b.s, ease, drape));
  }
  if (has('sideSlits', false)) {
    // Aberturas laterales: corte vertical en los costados con remate
    for (const th of [0, Math.PI]) {
      const y0 = b.y.hip - 0.035 * b.s - topFit(a).hem * b.s;
      parts.push(seamLine(clothPts(b, [[y0, th], [y0 + 0.045, th]], ease + 0.001, drape)));
      parts.push(...stitches(clothPts(b, [[y0 + 0.045, th - 0.05], [y0 + 0.045, th + 0.05]], ease + 0.0012, drape)));
    }
  }
  if (has('hemLabel', false)) {
    // Etiqueta tejida asomando en el bajo (lado izquierdo)
    const y0 = b.y.hip - 0.035 * b.s - topFit(a).hem * b.s + 0.012;
    const th = FRONT + 0.85;
    const p = onCloth(b, y0, th, ease + 0.0016, drape);
    const n = clothNormal(b, y0, th, ease, drape);
    const g = new THREE.BoxGeometry(0.018, 0.0008, 0.024);
    parts.push({ geometry: place(g, p, n, th), tone: 'dark', role: 'label', fabric: 'none' });
  }
  return { parts, fabric: fabricFor('tshirt', a) };
}

function shirt(a: Attributes, b: Body, layer: number): GarmentBuild {
  const collarType = attr(a, 'collar') ?? 'classic';
  const camp = collarType === 'camp';
  const { parts, ease, drape } = topBody(a, b, layer, {
    ease: 0.024,
    // Bajo curvo: más largo delante y detrás que en los costados (recto en la cubana)
    bottom: camp
      ? () => b.y.hip - 0.03 * b.s
      : (th) => b.y.hip - 0.055 * b.s - 0.04 * b.s * Math.pow(Math.sin(th), 2),
    neck: camp ? 'crew' : 'high',
    sleeve: camp ? 'short' : 'long',
    sleeveEase: 0.014,
    cuff: true,
    foldAmp: 0.003,
    rolled: has('rolledSleeves', false),
  });
  const collarOpts: Record<string, CollarOptions> = {
    classic: { open: 0.32 },
    button_down: { open: 0.3, buttonDown: true },
    spread: { open: 0.6 },
    mandarin: { open: 0.15, leaf: false },
    camp: { open: 1.0, size: 1.5 },
  };
  parts.push(...collar(b, ease, collarOpts[collarType] ?? collarOpts.classic));
  // Tapeta y botones
  const top = b.y.shoulder + (camp ? -0.07 : 0.02) * b.s;
  const low = b.y.hip - 0.09 * b.s;
  const placket = (th: number) => steps(low, top, 16).map((y): [number, number] => [y, th]);
  // Tapeta: dos pespuntes a ambos lados y el borde de la tela que cruza
  for (const d of [0.034, -0.034]) parts.push(...stitches(clothPts(b, placket(FRONT + d), ease + 0.0012, drape)));
  parts.push(seamLine(clothPts(b, placket(FRONT - 0.034), ease + 0.0009, drape)));
  for (let i = 0; i < 6; i++) {
    parts.push(...button(b, lerp(b.y.hip - 0.02, top - 0.03 * b.s, i / 5), FRONT, ease, 0.0075, 'light', drape));
  }
  // Bolsillos de pecho (el primero, a la izquierda de quien la lleva)
  const py = b.y.chest + 0.02 * b.s;
  const flaps = has('pocketFlaps', false);
  if (has('chestPocket', !camp)) parts.push(...patchPocket(b, py, FRONT + 0.47, 0.11 * b.s, 0.125 * b.s, ease, drape, { pointed: true, flap: flaps }));
  if (has('secondPocket', false)) parts.push(...patchPocket(b, py, FRONT - 0.47, 0.11 * b.s, 0.125 * b.s, ease, drape, { pointed: true, flap: flaps }));
  if (has('epaulettes', false)) parts.push(...epaulettes(b, ease, drape));
  return { parts, fabric: fabricFor('shirt', a) };
}

function sweater(a: Attributes, b: Body, layer: number): GarmentBuild {
  const fit = topFit(a);
  const bottom = b.y.hip - 0.03 * b.s - fit.hem * b.s;
  const neckAttr = attr(a, 'neckline');
  const chunky = attr(a, 'knit') === 'chunky';
  const cardigan = neckAttr === 'cardigan';
  const neck: NeckKind = cardigan ? 'v' : pick<NeckKind>({ v_neck: 'v', turtleneck: 'high', mock: 'mock' }, neckAttr, 'crew');
  const ribTop = has('ribHem', true) ? 0.05 * b.s : 0;
  const { parts, ease, shell: sh, drape } = topBody(a, b, layer, {
    ease: chunky ? 0.038 : 0.03,
    bottom: () => b.y.hip - 0.03 * b.s + ribTop,
    neck,
    sleeve: 'long',
    sleeveEase: chunky ? 0.024 : 0.018,
    cuff: !has('ribCuffs', true),
    foldAmp: 0.004,
    gap: cardigan ? () => 0.035 : undefined,
  });
  // En un jersey de punto no hay pespuntes: quitamos los del bajo y las mangas.
  // Bajo y puños de canalé
  if (has('ribHem', true)) parts.push(ribBand(b, bottom - 0.004, 0.055 * b.s, ease + 0.002, drape));
  if (has('ribCuffs', true)) {
    for (const arm of b.arms) {
      parts.push({
        geometry: tubeAlong(arm.curve, 0.93, 1.01, (t, phi) => arm.radius(t) + 0.007 + 0.001 * Math.sin(phi * Math.PI * 2 * 34), 6, 136),
        tone: 'base',
        role: 'trim',
        fabric: 'knit',
      });
    }
  }
  if (has('elbowPatches', false)) {
    for (const arm of b.arms) {
      const [f] = curveFrames(arm.curve, [b.elbowT]);
      // El codo mira hacia atrás (−Z)
      const back = new THREE.Vector3(0, 0, -1).projectOnPlane(f.tangent).normalize();
      const side = new THREE.Vector3().crossVectors(f.tangent, back).normalize();
      const R = arm.radius(b.elbowT) + (chunky ? 0.024 : 0.018) + 0.004;
      const len = arm.curve.getLength();
      parts.push({
        geometry: paramSurface({
          rows: 8,
          cols: 12,
          closed: false,
          point: (u, phi) => {
            const ang = (phi - 0.5) * 1.5;
            const t = b.elbowT + (u - 0.5) * (0.12 / len);
            const k = Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.5) * 2, 2)));
            const q = curvePoint(arm.curve, t)
              .addScaledVector(back, Math.cos(ang * k) * R)
              .addScaledVector(side, Math.sin(ang * k) * R);
            return [q.x, q.y, q.z];
          },
        }),
        tone: 'dark',
        role: 'trim',
        fabric: 'leather',
      });
    }
  }
  if (cardigan) {
    // Bordes delanteros con botones
    parts.push({ ...hem(sh.along(0), 0.006, false, 'base', 'trim'), fabric: 'knit' }, { ...hem(sh.along(1), 0.006, false, 'base', 'trim'), fabric: 'knit' });
    for (let i = 0; i < 5; i++) {
      parts.push(...button(b, lerp(bottom + 0.06, b.y.chest - 0.02, i / 4), FRONT + 0.05, ease, 0.007, 'dark', drape));
    }
    if (has('pockets', false)) {
      for (const sgn of [1, -1]) parts.push(...patchPocket(b, bottom + 0.11 * b.s, FRONT + sgn * 0.55, 0.12 * b.s, 0.12 * b.s, ease, drape, { fabric: 'knit' }));
    }
  } else if (has('pockets', false)) {
    for (const sgn of [1, -1]) parts.push(...patchPocket(b, bottom + 0.11 * b.s, FRONT + sgn * 0.55, 0.12 * b.s, 0.12 * b.s, ease, drape, { fabric: 'knit' }));
  } else if (neck === 'high' || neck === 'mock') {
    // Cuello vuelto (alto) o perkins (corto)
    const topY = neck === 'high' ? b.y.chin - 0.01 : b.y.shoulder + 0.085 * b.s;
    parts.push({
      geometry: paramSurface({
        rows: 12,
        cols: 40,
        closed: true,
        point: (u, phi) => {
          const th = phi * Math.PI * 2;
          const r = b.neckR + 0.02 + 0.004 * Math.sin(u * Math.PI * 3);
          const y0 = b.y.shoulder + 0.025 * b.s;
          return [r * Math.cos(th), y0 + u * (topY - y0), 0.01 + r * 0.95 * Math.sin(th)];
        },
      }),
      tone: 'base',
      role: 'trim',
      fabric: 'knit',
    });
  } else {
    parts.push({ ...hem(sh.edge(1, 0.002), 0.009, true, 'base', 'trim'), fabric: 'knit' });
  }
  // El punto no lleva pespuntes visibles: los quitamos.
  return { parts: parts.filter((p) => p.role !== 'stitch'), fabric: fabricFor('sweater', a) };
}

// ---------------------------------------------------------------------------
// Chaquetas y abrigos
// ---------------------------------------------------------------------------

type CollarKind = 'shirt' | 'lapel' | 'rib' | 'stand' | 'shawl' | 'none';
type PocketKind = 'chest' | 'hip' | 'four' | 'none';

interface OuterStyle {
  /** Altura del bajo. */
  hem: (b: Body) => number;
  ease: number;
  drape: number;
  closure: 'zip' | 'buttons' | 'double' | 'open' | 'toggles' | 'asym' | 'none';
  collar: CollarKind;
  ribHem?: boolean;
  ribCuffs?: boolean;
  /** Acolchado (altura de los canales). */
  puff?: number;
  belt?: boolean;
  hood?: boolean;
  /** Vuelo por debajo de la cadera. */
  flare?: number;
  pockets: PocketKind;
  sleeves?: boolean;
}

const JACKET_STYLES: Record<string, OuterStyle> = {
  // Cazadoras (bomber, biker, vaquera, Harrington, varsity): acaban en la
  // cintura, con el bajo sobre la cadera alta.
  bomber: { hem: (b) => b.y.waist - 0.085 * b.s, ease: 0.052, drape: 0.6, closure: 'zip', collar: 'rib', ribHem: true, ribCuffs: true, pockets: 'none' },
  biker: { hem: (b) => b.y.waist - 0.07 * b.s, ease: 0.038, drape: 0.3, closure: 'asym', collar: 'lapel', pockets: 'chest' },
  denim: { hem: (b) => b.y.waist - 0.095 * b.s, ease: 0.045, drape: 0.5, closure: 'buttons', collar: 'shirt', pockets: 'chest' },
  blazer: { hem: (b) => b.y.hip - 0.12 * b.s, ease: 0.04, drape: 0.4, closure: 'open', collar: 'lapel', pockets: 'hip' },
  harrington: { hem: (b) => b.y.waist - 0.085 * b.s, ease: 0.048, drape: 0.6, closure: 'zip', collar: 'stand', ribHem: true, ribCuffs: true, pockets: 'none' },
  field: { hem: (b) => b.y.hip - 0.14 * b.s, ease: 0.056, drape: 0.8, closure: 'zip', collar: 'shirt', pockets: 'four' },
  overshirt: { hem: (b) => b.y.hip - 0.08 * b.s, ease: 0.04, drape: 0.7, closure: 'buttons', collar: 'shirt', pockets: 'chest' },
  puffer: { hem: (b) => b.y.hip - 0.03 * b.s, ease: 0.07, drape: 0.8, closure: 'zip', collar: 'stand', puff: 0.085, pockets: 'none' },
  windbreaker: { hem: (b) => b.y.hip - 0.05 * b.s, ease: 0.06, drape: 0.9, closure: 'zip', collar: 'stand', hood: true, pockets: 'none' },
  varsity: { hem: (b) => b.y.waist - 0.085 * b.s, ease: 0.05, drape: 0.6, closure: 'buttons', collar: 'rib', ribHem: true, ribCuffs: true, pockets: 'none' },
};

/** Largo de los abrigos. */
const COAT_LENGTH: Record<string, (b: Body) => number> = {
  hip: (b) => b.y.hip - 0.06 * b.s,
  thigh: (b) => (b.y.crotch + b.y.knee) / 2,
  knee: (b) => b.y.knee + 0.035 * b.s,
  midi: (b) => b.y.knee - 0.14 * b.s,
  maxi: (b) => b.y.ankle + 0.12 * b.s,
};

const COAT_STYLES: Record<string, OuterStyle & { length: string }> = {
  overcoat: { length: 'knee', hem: COAT_LENGTH.knee, ease: 0.058, drape: 1, closure: 'buttons', collar: 'lapel', flare: 0.06, pockets: 'hip' },
  trench: { length: 'knee', hem: COAT_LENGTH.knee, ease: 0.058, drape: 1, closure: 'double', collar: 'lapel', belt: true, flare: 0.14, pockets: 'hip' },
  peacoat: { length: 'thigh', hem: COAT_LENGTH.thigh, ease: 0.056, drape: 1, closure: 'double', collar: 'lapel', flare: 0.05, pockets: 'hip' },
  parka: { length: 'thigh', hem: COAT_LENGTH.thigh, ease: 0.07, drape: 1, closure: 'zip', collar: 'stand', hood: true, flare: 0.04, pockets: 'four' },
  puffer: { length: 'thigh', hem: COAT_LENGTH.thigh, ease: 0.08, drape: 1, closure: 'zip', collar: 'stand', puff: 0.1, flare: 0.02, pockets: 'none' },
  duffle: { length: 'thigh', hem: COAT_LENGTH.thigh, ease: 0.064, drape: 1, closure: 'toggles', collar: 'none', hood: true, flare: 0.06, pockets: 'hip' },
  wrap: { length: 'midi', hem: COAT_LENGTH.midi, ease: 0.058, drape: 1, closure: 'none', collar: 'shawl', belt: true, flare: 0.12, pockets: 'none' },
  car_coat: { length: 'hip', hem: COAT_LENGTH.hip, ease: 0.056, drape: 1, closure: 'buttons', collar: 'shirt', flare: 0.04, pockets: 'hip' },
  raincoat: { length: 'knee', hem: COAT_LENGTH.knee, ease: 0.064, drape: 1, closure: 'zip', collar: 'stand', hood: true, flare: 0.1, pockets: 'hip' },
  cape: { length: 'knee', hem: COAT_LENGTH.knee, ease: 0.06, drape: 1, closure: 'buttons', collar: 'stand', flare: 0.1, pockets: 'none', sleeves: false },
};

/** Corte (slim, oversize...) aplicado a chaquetas y abrigos. */
const OUTER_FIT: Record<string, { ease: number; hem: number }> = {
  slim: { ease: -0.01, hem: 0 },
  regular: { ease: 0, hem: 0 },
  oversized: { ease: 0.024, hem: 0.03 },
  cropped: { ease: 0, hem: -0.12 },
};

function hood(b: Body, ease: number): GarmentPart {
  // Capucha recogida a la espalda
  return {
    geometry: paramSurface({
      rows: 10,
      cols: 30,
      closed: false,
      point: (u, phi) => {
        const th = -Math.PI / 2 + (phi - 0.5) * 2.6;
        const r = b.neckR + 0.05 + ease * 0.3 + 0.04 * Math.sin(u * Math.PI);
        return [r * Math.cos(th), b.y.shoulder + 0.02 + u * 0.1 * b.s, -0.01 + r * Math.sin(th) - 0.04 * u];
      },
    }),
    tone: 'base',
  };
}

function outerwear(a: Attributes, b: Body, layer: number, st: OuterStyle, isCoat: boolean): GarmentPart[] {
  const fit = OUTER_FIT[attr(a, 'fit') ?? 'regular'] ?? OUTER_FIT.regular;
  const ease = st.ease + fit.ease + layer;
  // Crop: a la cintura (nunca más largo que el modelo).
  const bottom = attr(a, 'fit') === 'cropped' ? Math.max(st.hem(b), b.y.waist - 0.045 * b.s) : st.hem(b) - fit.hem * b.s;
  const closureAttr = attr(a, 'closure');
  const closure = closureAttr === 'zip' || closureAttr === 'buttons' || closureAttr === 'open' ? closureAttr : st.closure;
  const open = closure === 'open';
  // Abierta con solapas (americana, abrigos de solapa, o un estilo sin cuello
  // propio): escote en pico. Si el estilo tiene cuello camisero, alto o de
  // canalé, se queda con él y solo se abre el delantero.
  const lapelOpen = open && (st.closure === 'open' || st.collar === 'lapel' || st.collar === 'shawl' || st.collar === 'none');
  const hipRx = b.section(b.y.hip).rx;
  const clear = legClearance(b);
  const isCape = st.sleeves === false;
  const chestRx = b.section(b.y.chest).rx;
  // Con bajo de canalé, la tela termina donde empieza el canalé (sin solaparse).
  const ribTop = has('ribHem', !!st.ribHem) ? 0.044 * b.s : 0;
  // Abierta: semiángulo de la abertura (rad), casi constante y algo mayor
  // arriba, donde caen las solapas. Antes se abría mucho hacia el cuello y se
  // veía una «T» con la prenda de debajo.
  const openGap = lapelOpen
    ? (u: number) => 0.07 + 0.3 * smoothstep(0.5, 1, u)
    : open
      ? (u: number) => 0.06 + 0.12 * smoothstep(0.6, 1, u)
      : undefined;
  /** Cuánto se separa el delantero a una altura: lo que se desplazan bolsillos y botones. */
  const gapAt = (y: number) => (openGap ? openGap(THREE.MathUtils.clamp((y - bottom) / Math.max(0.2, b.y.shoulder - bottom), 0, 1)) : 0);
  const sh = shell(b, {
    bottom: (th) => bottom + ribTop + (isCoat ? 0.006 * Math.sin(th * 5) : 0),
    top: neckline(b, lapelOpen ? 'v' : 'high', false),
    ease,
    drape: st.drape,
    flare: (y, sec) => {
      let f = 0;
      if (isCape) {
        // La capa cae desde los hombros y cubre los brazos
        f = Math.max(0, chestRx + 0.1 - sec.rx) * smoothstep(b.y.shoulder + 0.02, b.y.waist, y) + Math.max(0, b.y.chest - y) * 0.08;
      } else if (y < b.y.hip && st.flare) {
        f = Math.max(0, hipRx - sec.rx) + (b.y.hip - y) * st.flare;
      }
      if (st.puff) f += puffAt(y, st.puff);
      // Por encima de cualquier prenda de debajo (incluidos pantalones anchos)
      return Math.max(f, clear(y, sec) + 0.045 - ease);
    },
    foldAmp: (u) => (isCoat ? 0.009 : 0.003) * Math.pow(1 - u, 2.2),
    foldCount: 8,
    rows: isCoat ? 56 : 44,
    cols: st.puff ? 96 : 72,
    gap: openGap,
  });
  // La tela principal va forrada por dentro (color del forro).
  const parts: GarmentPart[] = [{ geometry: sh.geometry, tone: 'base', role: 'body', lined: true }];
  const height = Math.max(0.2, b.y.shoulder - bottom);
  const ribHem = has('ribHem', !!st.ribHem);
  if (ribHem) {
    parts.push(ribBand(b, bottom - 0.004, 0.05 * b.s, ease + 0.003, st.drape));
  } else {
    parts.push(...hemWithStitch(sh.edge(0), sh.edge(0.022 / height, 0.0012), isCoat ? 0.0042 : 0.0036, sh.closed));
  }
  const ribCuffs = has('ribCuffs', !!st.ribCuffs);
  if (!isCape) {
    parts.push(
      ...sleeves(b, 'long', (isCoat ? 0.042 : 0.036) + fit.ease * 0.5 + layer + (st.puff ? 0.02 : 0), {
        cuff: !ribCuffs,
        ribCuff: ribCuffs,
        puff: st.puff,
      }),
    );
  }

  // Cuello
  if (lapelOpen) parts.push(...lapels(b, ease));
  else if (st.collar === 'lapel') parts.push(...lapels(b, ease, 0.7, isCoat ? 1.9 : 1.5));
  else if (st.collar === 'shawl') parts.push(...lapels(b, ease, 0.95, 2.4));
  // Abierta, el cuello se abre por delante tanto como el delantero.
  else if (st.collar === 'shirt') parts.push(...collar(b, ease, { open: open ? 0.75 : 0.25, size: 1.2 }));
  else if (st.collar === 'stand') parts.push(...collar(b, ease, { open: open ? 0.75 : 0.1, leaf: false }));
  else if (st.collar === 'rib') parts.push({ ...collar(b, ease, { open: open ? 0.75 : 0.05, leaf: false })[0], fabric: 'knit', tone: 'dark' });

  // Cierre
  const drape = st.drape;
  const topY = b.y.shoulder + 0.03 * b.s;
  const frontEdge = (th: number) => clothPts(b, steps(bottom + 0.004, topY, 24).map((y): [number, number] => [y, th]), ease + 0.0012, drape);
  if (closure === 'zip') {
    parts.push(...zipper(clothPts(b, steps(bottom + 0.004, topY, 32).map((y): [number, number] => [y, FRONT]), ease + 0.0006, drape)));
    for (const d of [0.05, -0.05]) parts.push(...stitches(frontEdge(FRONT + d)));
  } else if (closure === 'asym') {
    // Cremallera cruzada de la biker
    const zip = steps(bottom + 0.004, topY, 32).map((y): [number, number] => [y, FRONT - 0.32 * smoothstep(bottom, topY, y) + 0.05]);
    parts.push(...zipper(clothPts(b, zip, ease + 0.0006, drape)));
  } else if (closure === 'buttons') {
    const n = isCoat ? 4 : 5;
    for (let i = 0; i < n; i++) parts.push(...button(b, lerp(bottom + 0.06, b.y.chest + 0.02, i / (n - 1)), FRONT, ease, 0.009, 'dark', drape, isCoat ? 'four_hole' : 'shank'));
    for (const d of [0.05, -0.05]) parts.push(...stitches(frontEdge(FRONT + d)));
  } else if (closure === 'double') {
    for (const y of [b.y.waist + 0.06, b.y.waist + 0.14, b.y.chest]) {
      parts.push(...button(b, y, FRONT + 0.22, ease, 0.01, 'dark', drape), ...button(b, y, FRONT - 0.22, ease, 0.01, 'dark', drape));
    }
    const edge = steps(bottom, b.y.shoulder, 18).map((y): [number, number] => [y, FRONT - 0.3 + 0.08 * smoothstep(b.y.chest, b.y.shoulder, y)]);
    parts.push({ geometry: cord(clothPts(b, edge, ease + 0.002, drape), 0.0024, false, 6), tone: 'base' });
    parts.push(...stitches(clothPts(b, edge.map(([y, th]): [number, number] => [y, th + 0.035]), ease + 0.0013, drape)));
  } else if (closure === 'toggles') {
    // Trenca: alamares de madera/asta con su presilla de cordón
    for (let i = 0; i < 4; i++) {
      const y = lerp(b.y.waist - 0.05, b.y.chest + 0.03, i / 3);
      parts.push(...button(b, y, FRONT + 0.06, ease + 0.003, 0.0085, 'light', drape, 'toggle'));
      parts.push({ geometry: cord(clothPts(b, [[y, FRONT - 0.12], [y + 0.004, FRONT + 0.02], [y, FRONT + 0.1]], ease + 0.005, drape), 0.0022, false, 6), tone: 'dark', role: 'trim', fabric: 'none' });
    }
  } else if (open && !isCoat) {
    // Americana abierta: bordes delanteros con pespunte y un botón en la cintura
    parts.push(hem(sh.along(0), 0.004, false), hem(sh.along(1), 0.004, false));
    parts.push(...button(b, b.y.waist + 0.02, FRONT + 0.12, ease, 0.009, 'dark', drape));
  }
  if (open && isCoat) parts.push(hem(sh.along(0), 0.005, false), hem(sh.along(1), 0.005, false));

  // Solapa de tormenta (gabardina): pieza en el pecho derecho
  if (has('stormFlap', st.closure === 'double' && isCoat && !!st.belt)) {
    const th0 = FRONT - 0.15;
    const th1 = FRONT - 0.95;
    const y0 = b.y.chest - 0.07 * b.s;
    const y1 = b.y.shoulder + 0.01;
    parts.push({
      geometry: paramSurface({
        rows: 8,
        cols: 10,
        closed: false,
        point: (u, phi) => {
          const y = lerp(y0 - 0.02 * Math.sin(Math.PI * phi), y1, u);
          const q = onCloth(b, y, lerp(th0, th1, phi), ease + 0.0045, drape);
          return [q.x, q.y, q.z];
        },
      }),
      tone: 'base',
    });
    parts.push(...stitches(steps(0, 1, 10).map((phi) => onCloth(b, y0 - 0.02 * Math.sin(Math.PI * phi) + 0.01, lerp(th0, th1, phi), ease + 0.006, drape))));
  }

  // Cinturón (con trabillas en los costados)
  if (has('belt', !!st.belt)) {
    parts.push(...belt(b, b.y.waist, ease + 0.003, drape, { fabric: fabricFor(isCoat ? 'coat' : 'jacket', a), role: 'body', tone: 'base', height: 0.04 * b.s }));
  }
  if (has('hood', !!st.hood || a.hooded === true)) parts.push(hood(b, ease));
  if (has('epaulettes', isCoat && !!st.belt && st.closure === 'double')) parts.push(...epaulettes(b, ease + 0.002, drape, 0.04));
  if (!isCape && has('cuffStraps', isCoat && !!st.belt && st.closure === 'double')) {
    for (const arm of b.arms) {
      const t = 0.9;
      const ring = limbRing(arm, t, arm.radius(t) + (isCoat ? 0.042 : 0.036) + 0.006, 40);
      parts.push({ geometry: cord(ring, 0.006, true, 6), tone: 'base' });
      parts.push(...stitches(limbRing(arm, t - 0.012, arm.radius(t) + 0.049, 64), true));
    }
  }
  if (!isCape && has('sleevePocket', false)) {
    // Bolsillo con cremallera en la manga izquierda (estilo bomber)
    const arm = b.arms[1];
    const [f] = curveFrames(arm.curve, [0.3]);
    const out = new THREE.Vector3(arm.side, 0, 0).projectOnPlane(f.tangent).normalize();
    const r = arm.radius(0.3) + 0.04;
    const pts = steps(0.22, 0.38, 10).map((t) => curvePoint(arm.curve, t).addScaledVector(out, r + 0.002));
    parts.push(...zipper(pts, { pull: true }));
  }

  // Bolsillos
  const chest = has('chestPockets', st.pockets === 'chest' || st.pockets === 'four');
  const hip = has('hipPockets', st.pockets === 'hip' || st.pockets === 'four');
  const patch = st.pockets === 'four' || st.collar === 'shirt';
  if (chest) {
    // Con la prenda abierta, los bolsillos se van con su delantero (si no,
    // quedaban flotando sobre la abertura).
    const shift = gapAt(b.y.chest + 0.04);
    for (const sgn of [1, -1]) {
      if (patch) parts.push(...patchPocket(b, b.y.chest + 0.02, FRONT + sgn * (0.48 + shift), 0.115 * b.s, 0.125 * b.s, ease, drape, { flap: true, pointed: st.collar === 'shirt' }));
      else parts.push(...weltPocket(b, b.y.chest + 0.04, FRONT + sgn * (0.3 + shift), FRONT + sgn * (0.62 + shift), ease, drape));
    }
  }
  if (hip) {
    const py = Math.max(bottom + 0.1, b.y.hip - 0.02);
    for (const sgn of [1, -1]) {
      if (patch && isCoat === false && st.pockets === 'four') parts.push(...patchPocket(b, py, FRONT + sgn * 0.85, 0.15 * b.s, 0.16 * b.s, ease, drape, { flap: true }));
      else parts.push(...weltPocket(b, py, FRONT + sgn * 0.75, FRONT + sgn * 1.15, ease, drape, isCoat));
    }
  }
  return parts;
}

/** Bolsillo de ojal (vivo) con o sin cartera, como en americanas y abrigos. */
function weltPocket(b: Body, y: number, th0: number, th1: number, ease: number, drape: number, flap = false): GarmentPart[] {
  const edge = clothPts(b, steps(0, 1, 10).map((k): [number, number] => [y + 0.012 * k, lerp(th0, th1, k)]), ease + 0.002, drape);
  const parts: GarmentPart[] = [
    { geometry: cord(edge, 0.0026, false, 6), tone: 'base' },
    seamLine(edge.map((q) => q.clone().add(new THREE.Vector3(0, -0.0034, 0)))),
  ];
  if (flap) {
    const pt = (u: number, k: number) => onCloth(b, y + 0.012 * k - u * 0.045, lerp(th0, th1, k), ease + 0.0038, drape);
    parts.push({
      geometry: paramSurface({ rows: 4, cols: 10, closed: false, point: (u, phi) => {
        const q = pt(u, phi);
        return [q.x, q.y, q.z];
      } }),
      tone: 'base',
    });
    parts.push(...stitches(steps(0.04, 0.96, 10).map((k) => pt(0.85, k).add(new THREE.Vector3(0, 0, 0.0005)))));
  }
  return parts;
}

function jacket(a: Attributes, b: Body, layer: number): GarmentBuild {
  const st: OuterStyle = JACKET_STYLES[attr(a, 'style') ?? ''] ?? {
    hem: (bb: Body) => bb.y.hip - 0.06 * bb.s,
    ease: 0.048,
    drape: 0.7,
    closure: 'zip',
    collar: 'shirt',
    pockets: 'chest',
  };
  return { parts: outerwear(a, b, layer, st, false), fabric: fabricFor('jacket', a) };
}

function coat(a: Attributes, b: Body, layer: number): GarmentBuild {
  const base = COAT_STYLES[attr(a, 'style') ?? ''] ?? COAT_STYLES.overcoat;
  const length = attr(a, 'length');
  const st: OuterStyle = { ...base, hem: length && COAT_LENGTH[length] ? COAT_LENGTH[length] : base.hem };
  return { parts: outerwear(a, b, layer, st, true), fabric: fabricFor('coat', a) };
}

// ---------------------------------------------------------------------------
// Partes de abajo
// ---------------------------------------------------------------------------

/** Altura de la cintura del pantalón según el tiro. */
function riseY(b: Body, rise: string | undefined): number {
  return pick({ low: b.y.waist - 0.055 * b.s, mid: b.y.waist - 0.015 * b.s, high: b.y.waist + 0.035 * b.s }, rise, b.y.waist);
}

/** Parte alta del pantalón: cadera, cinturilla, bragueta, bolsillos, trabillas... */
function waistPart(b: Body, layer: number, fabric: FabricKind, waistY: number, elastic = false): GarmentPart[] {
  const ease = 0.009 + layer;
  const s = b.s;
  const denim = fabric === 'denim';
  const hipShell = shell(b, {
    bottom: () => b.y.crotch - 0.04 * s,
    top: () => waistY,
    ease,
    drape: 0,
    closeBottom: true,
    // Filas y columnas de sobra: el borde por donde salen las perneras se veía
    // dentado (en forma de «V» de dientes de sierra en la entrepierna).
    rows: 44,
    cols: 96,
  });
  const band = shell(b, {
    bottom: () => waistY - 0.03 * s,
    top: () => waistY + 0.006,
    ease: ease + 0.003,
    drape: 0,
    foldAmp: elastic ? () => 0.0015 : undefined,
    foldCount: 80,
    rows: 3,
    cols: elastic ? 160 : 72,
  });
  const parts: GarmentPart[] = [
    { geometry: hipShell.geometry, tone: 'base' },
    { geometry: band.geometry, tone: 'base', role: 'trim', fabric: elastic ? 'knit' : undefined },
    hem(band.edge(1, 0.001), 0.0026, true, 'base', 'trim'),
  ];
  if (!elastic) {
    // Pespuntes de la cinturilla (arriba y abajo)
    parts.push(...stitches(band.edge(0.12, 0.0009), true), ...stitches(band.edge(0.85, 0.0009), true));
    parts.push(seamLine(band.edge(0, 0.0006), true));
    // Bragueta: pespunte en "J" y costura central
    const fly: [number, number][] = [
      [waistY - 0.03 * s, FRONT + 0.1],
      [b.y.crotch + 0.07 * s, FRONT + 0.1],
      [b.y.crotch + 0.045 * s, FRONT + 0.07],
      [b.y.crotch + 0.035 * s, FRONT + 0.01],
    ];
    parts.push(...stitches(clothPts(b, fly, ease + 0.0012)));
    parts.push(seamLine(clothPts(b, steps(waistY - 0.03 * s, b.y.crotch + 0.03 * s, 8).map((y): [number, number] => [y, FRONT + 0.004]), ease + 0.0008)));
    parts.push(...button(b, waistY - 0.012 * s, FRONT, ease + 0.003, 0.0085, 'dark', 0, denim ? 'shank' : 'four_hole'));
  } else {
    // Cordón de ajuste
    const p = onCloth(b, waistY - 0.012 * s, FRONT, ease + 0.006, 0);
    parts.push({ geometry: cord([p.clone().add(new THREE.Vector3(-0.012, 0, 0)), p.clone().add(new THREE.Vector3(-0.006, -0.06, 0.004))], 0.0025, false, 5), tone: 'light', role: 'trim', fabric: 'none' });
    parts.push({ geometry: cord([p.clone().add(new THREE.Vector3(0.012, 0, 0)), p.clone().add(new THREE.Vector3(0.008, -0.065, 0.004))], 0.0025, false, 5), tone: 'light', role: 'trim', fabric: 'none' });
  }
  // Bolsillos delanteros: abertura curva desde la cintura hacia el costado
  if (has('frontPockets', true)) {
    for (const sgn of [1, -1]) {
      const opening: [number, number][] = steps(0, 1, 10).map((k) => [
        lerp(waistY - 0.03 * s, b.y.hip + 0.01 * s, Math.pow(k, 0.8)),
        FRONT + sgn * lerp(0.5, 1.05, Math.sin((k * Math.PI) / 2)),
      ]);
      parts.push({ geometry: cord(clothPts(b, opening, ease + 0.0016), 0.0016, false, 5), tone: 'base' });
      parts.push(seamLine(clothPts(b, opening.map(([y, th]): [number, number] => [y - 0.002, th + sgn * 0.01]), ease + 0.0007)));
      parts.push(...stitches(clothPts(b, opening.map(([y, th]): [number, number] => [y, th - sgn * 0.045]), ease + 0.0012)));
      if (has('rivets', denim)) {
        parts.push(rivet(b, waistY - 0.032 * s, FRONT + sgn * 0.47, ease + 0.001));
        parts.push(rivet(b, b.y.hip + 0.012 * s, FRONT + sgn * 1.07, ease + 0.001));
      }
    }
    // Bolsillo relojero (a la derecha de quien lo lleva)
    if (has('coinPocket', denim)) {
      parts.push(...patchPocket(b, waistY - 0.06 * s, FRONT - 0.66, 0.048 * s, 0.04 * s, ease + 0.0004, 0));
    }
  }
  // Canesú trasero (vaquero): costura en "V" bajo la cinturilla
  if (denim) {
    const yoke = steps(-1, 1, 16).map((k): [number, number] => [waistY - 0.035 * s - 0.045 * s * (1 - Math.abs(k)), -Math.PI / 2 + k * 1.15]);
    parts.push(seamLine(clothPts(b, yoke, ease + 0.0007)));
    parts.push(...stitches(clothPts(b, yoke.map(([y, th]): [number, number] => [y - 0.004, th]), ease + 0.0012)));
  }
  // Bolsillos traseros de parche, en punta
  if (has('backPockets', true)) {
    for (const sgn of [1, -1]) {
      parts.push(...patchPocket(b, b.y.hip + 0.02 * s, -Math.PI / 2 + sgn * 0.52, 0.13 * s, 0.14 * s, ease, 0, { pointed: true }));
    }
  }
  if (!elastic && has('beltLoops', true)) parts.push(...beltLoops(b, waistY, ease + 0.003));
  if (has('belt', false)) parts.push(...belt(b, waistY - 0.012 * s, ease + 0.006, 0));
  return parts;
}

interface LegCut {
  /** Holgura de la pernera en t (0 = cadera, 1 = tobillo), conocido el radio de la pierna. */
  ease: (t: number, legR: (t: number) => number, b: Body) => number;
  length?: string;
  rise?: string;
  /** Arrugas extra al final (tela que se acumula). */
  stack?: number;
  cuff?: 'jogger' | 'rolled';
  cargo?: boolean;
}

/** Cortes de pantalón: cómo se separa la pernera de la pierna a lo largo. */
const PANTS_CUTS: Record<string, LegCut> = {
  skinny: { ease: () => 0.004 },
  jeggings: { ease: () => 0.003 },
  slim: { ease: () => 0.009 },
  straight: { ease: (t, r, b) => Math.max(0.012, r(b.kneeT * 0.5) + 0.012 - r(t)) },
  regular: { ease: (t) => lerp(0.014, 0.026, Math.max(0, t)) },
  tapered: { ease: (t) => lerp(0.026, 0.006, Math.max(0, t)) },
  carrot: { ease: (t) => lerp(0.042, 0.005, Math.pow(Math.max(0, t), 0.8)), length: 'ankle' },
  relaxed: { ease: (t) => lerp(0.022, 0.048, Math.max(0, t)) },
  mom: { ease: (t) => lerp(0.03, 0.012, Math.max(0, t)), rise: 'high', length: 'ankle' },
  boyfriend: { ease: (t) => 0.03 + 0.006 * Math.max(0, t), rise: 'low', length: 'ankle', cuff: 'rolled' },
  barrel: { ease: (t) => 0.012 + 0.055 * Math.sin(Math.PI * Math.max(0, Math.min(1, t))), length: 'ankle' },
  bootcut: { ease: (t, _r, b) => 0.01 + Math.max(0, t - b.kneeT) * 0.08 },
  flare: { ease: (t, _r, b) => 0.008 + Math.max(0, t - b.kneeT) * 0.17, rise: 'high' },
  wide: { ease: (t, r) => Math.max(0.02, r(0) + 0.022 - r(t)) },
  palazzo: { ease: (t, r) => Math.max(0.03, r(0) + 0.03 - r(t)) + 0.05 * Math.max(0, t), rise: 'high', stack: 0.004 },
  baggy: { ease: (t, r) => Math.max(0.03, r(0) + 0.035 - r(t)) + 0.02 * Math.max(0, t), rise: 'low', stack: 0.008 },
  oversized: { ease: (t) => lerp(0.03, 0.072, Math.max(0, t)), stack: 0.006 },
  cargo: { ease: (t) => lerp(0.024, 0.04, Math.max(0, t)), cargo: true },
  jogger: { ease: (t) => lerp(0.026, 0.01, Math.max(0, t)), cuff: 'jogger' },
};

const PANTS_LENGTH: Record<string, number> = { full: 1.035, ankle: 0.94, cropped: 0.8 };

/** Bolsillo de parche en el lateral del muslo (pantalón cargo). */
function cargoPocket(leg: Limb, t0: number, t1: number, e: (t: number) => number): GarmentPart[] {
  const point = (t: number, dz: number, extra: number) => {
    const c = curvePoint(leg.curve, t);
    const R = leg.radius(t) + e(t) + extra;
    const x = Math.sqrt(Math.max(0, R * R - dz * dz));
    return new THREE.Vector3(c.x + leg.side * x, c.y, c.z + dz);
  };
  const patch = paramSurface({
    rows: 6,
    cols: 8,
    closed: false,
    point: (u, phi) => {
      const p = point(lerp(t0, t1, u), lerp(-0.045, 0.045, phi), 0.006 + 0.003 * Math.sin(phi * Math.PI));
      return [p.x, p.y, p.z];
    },
  });
  const outline = [point(t0, -0.045, 0.007), point(t0, 0.045, 0.007), point(t1, 0.045, 0.007), point(t1, -0.045, 0.007)];
  const flap = [point(t0 - 0.02, -0.048, 0.01), point(t0 - 0.02, 0.048, 0.01)];
  const inner = [point(t0 + 0.006, -0.041, 0.0075), point(t0 + 0.006, 0.041, 0.0075), point(t1 - 0.004, 0.041, 0.0075), point(t1 - 0.004, -0.041, 0.0075)];
  return [
    { geometry: patch, tone: 'base' },
    seamLine(outline, true),
    ...stitches([...inner, inner[0]]),
    { geometry: cord(flap, 0.004, false, 6), tone: 'base' },
  ];
}

function pants(a: Attributes, b: Body, layer: number): GarmentBuild {
  const fabric = fabricFor('pants', a);
  const cut = PANTS_CUTS[attr(a, 'fit') ?? 'regular'] ?? PANTS_CUTS.regular;
  const end = PANTS_LENGTH[attr(a, 'length') ?? cut.length ?? 'full'] ?? PANTS_LENGTH.full;
  const rise = attr(a, 'rise') ?? cut.rise;
  const elastic = cut.cuff === 'jogger';
  const parts = waistPart(b, layer, fabric, riseY(b, rise), elastic);
  for (const leg of b.legs) {
    // Por encima de la entrepierna la pernera queda dentro de la cadera del
    // pantalón; el corte (ancho, campana...) empieza a notarse por debajo.
    const ease = (t: number) => lerp(0.008, cut.ease(t, leg.radius, b), smoothstep(-0.05, 0.16, t)) + layer;
    const legEnd = cut.cuff === 'jogger' ? Math.min(end, 0.97) : end;
    parts.push(
      ...sleeveLike(leg, {
        from: -0.05,
        to: legEnd,
        ease,
        extra: seatExtra(b, leg),
        // Arrugas detrás de la rodilla y tela acumulada sobre el zapato
        wrinkles: [
          [b.kneeT, 0.06, 0.002],
          [legEnd - 0.06, 0.05, 0.0045 + (cut.stack ?? 0)],
        ],
      }),
    );
    if (cut.cuff === 'jogger') {
      parts.push({
        geometry: tubeAlong(leg.curve, legEnd - 0.005, legEnd + 0.05, (t, phi) => leg.radius(t) + 0.006 + 0.001 * Math.sin(phi * Math.PI * 2 * 40), 4, 120),
        tone: 'base',
        role: 'trim',
        fabric: 'knit',
      });
    } else if (has('turnUps', cut.cuff === 'rolled')) {
      // Bajo vuelto
      const len = leg.curve.getLength();
      const w = 0.045 / len;
      parts.push({ geometry: tubeAlong(leg.curve, legEnd - w, legEnd, (t) => leg.radius(t) + ease(t) + 0.005, 4, 32), tone: 'base' });
      parts.push(hem(limbRing(leg, legEnd - w, leg.radius(legEnd - w) + ease(legEnd - w) + 0.0055), 0.003, true));
    }
    if (has('cargoPockets', !!cut.cargo)) parts.push(...cargoPocket(leg, 0.3, 0.48, ease));
    // Costura lateral exterior (en vaquero, con pespunte)
    const seam = steps(0.02, legEnd - 0.01, 24).map((t) => {
      const p = curvePoint(leg.curve, t);
      return p.add(new THREE.Vector3(leg.side * (leg.radius(t) + ease(t) + 0.0005), 0, 0));
    });
    parts.push(seamLine(seam));
    if (fabric === 'denim') parts.push(...stitches(seam.map((q) => q.clone().add(new THREE.Vector3(0, 0, 0.004)))));
  }
  return { parts, fabric };
}

const SHORTS_CUTS: Record<string, (t: number) => number> = {
  slim: (t) => 0.008 + Math.max(0, t) * 0.02,
  regular: (t) => 0.012 + Math.max(0, t) * 0.04,
  relaxed: (t) => 0.02 + Math.max(0, t) * 0.05,
  wide: (t) => 0.03 + Math.max(0, t) * 0.08,
  oversized: (t) => 0.035 + Math.max(0, t) * 0.08,
  cargo: (t) => 0.02 + Math.max(0, t) * 0.05,
  bike: (t) => 0.003 + Math.max(0, t) * 0.004,
};

/**
 * Fondillo: holgura extra detrás de la parte alta de la pernera, para que
 * cubra el pliegue del glúteo del maniquí (que baja hasta la entrepierna,
 * más aún en el femenino). Se desvanece hacia el muslo y hacia los lados.
 */
function seatExtra(b: Body, leg: Limb, scale = 1): (t: number, phi: number) => number {
  const [f] = curveFrames(leg.curve, [0]);
  // Ángulo φ (0–1) que apunta hacia atrás (−Z) en el marco del tubo.
  const phiBack = Math.atan2(-f.binormal.z, -f.normal.z) / (Math.PI * 2);
  const amount = scale * Math.max(0.017, 0.018 + 0.05 * (b.shape.glutes - 1));
  const len = leg.curve.getLength();
  const tCrotch = (0.06 * b.s) / len;
  return (t, phi) => {
    // Por encima de la entrepierna la pernera queda algo por dentro de la
    // cadera del pantalón: así la cadera la tapa entera y la unión es una
    // curva limpia junto a la entrepierna (antes asomaban las perneras y se
    // veía una «V» con el borde dentado).
    const c = Math.cos((phi - phiBack) * Math.PI * 2);
    // Solo por delante: detrás hace falta el fondillo.
    const inside = c < 0 ? -0.008 * Math.sqrt(-c) * (1 - smoothstep(tCrotch - 0.03, tCrotch + 0.03, t)) : 0;
    const along = 1 - smoothstep(tCrotch, tCrotch + 0.12, t);
    if (along <= 0) return inside;
    return inside + (c > 0 ? amount * along * Math.pow(c, 0.7) : 0);
  };
}

/** Ropa interior (modelo de reserva: los de la biblioteca son mejores). */
function underwear(a: Attributes, b: Body, layer: number): GarmentBuild {
  const fabric = fabricFor('underwear', a);
  const style = attr(a, 'style') ?? 'boxer_brief';
  const parts = waistPart(b, layer, fabric, b.y.hip + 0.04 * b.s, true);
  const end = b.kneeT * pick({ slip: 0.06, boxer_brief: 0.3, boxer_long: 0.52 }, style, 0.3);
  for (const leg of b.legs) {
    const ease = (t: number) => 0.003 + Math.max(0, t) * 0.004 + layer;
    parts.push(...sleeveLike(leg, { from: -0.05, to: end, ease }));
  }
  return { parts, fabric };
}

function shorts(a: Attributes, b: Body, layer: number): GarmentBuild {
  const fabric = fabricFor('shorts', a);
  const fitAttr = attr(a, 'fit') ?? 'regular';
  const easeFn = SHORTS_CUTS[fitAttr] ?? SHORTS_CUTS.regular;
  const parts = waistPart(b, layer, fabric, b.y.waist - 0.015 * b.s);
  const end = b.kneeT * pick({ short: 0.45, mid: 0.72, bermuda: 1.02 }, attr(a, 'length'), fitAttr === 'bike' ? 0.6 : 0.72);
  for (const leg of b.legs) {
    const ease = (t: number) => lerp(0.008, easeFn(t), smoothstep(-0.05, 0.16, t)) + layer;
    parts.push(...sleeveLike(leg, { from: -0.05, to: end, ease, extra: seatExtra(b, leg, fitAttr === 'bike' ? 0.5 : 1) }));
    if (has('cargoPockets', fitAttr === 'cargo')) parts.push(...cargoPocket(leg, end * 0.45, end * 0.85, ease));
    if (has('turnUps', false)) {
      const len = leg.curve.getLength();
      const w = 0.035 / len;
      parts.push({ geometry: tubeAlong(leg.curve, end - w, end, (t) => leg.radius(t) + ease(t) + 0.005, 4, 32), tone: 'base' });
      parts.push(hem(limbRing(leg, end - w, leg.radius(end - w) + ease(end - w) + 0.0055), 0.003, true));
    }
  }
  return { parts, fabric };
}

interface SkirtCut {
  /** Vuelo por debajo de la cadera (m por m de caída). Negativo = se estrecha. */
  rate: number;
  folds: number;
  foldCount: number;
  /** Ajustes especiales del contorno. */
  shape?: (y: number, b: Body, hemY: number) => number;
  hem?: (theta: number, hemY: number, b: Body) => number;
  tiers?: number;
  wrap?: boolean;
  pleats?: boolean;
}

const SKIRT_CUTS: Record<string, SkirtCut> = {
  pencil: { rate: -0.05, folds: 0, foldCount: 9 },
  straight: { rate: 0, folds: 0.003, foldCount: 9 },
  a_line: { rate: 0.22, folds: 0.012, foldCount: 9 },
  flared: { rate: 0.4, folds: 0.022, foldCount: 11 },
  circle: { rate: 0.75, folds: 0.034, foldCount: 14 },
  pleated: { rate: 0.2, folds: 0.006, foldCount: 34, pleats: true },
  wrap: { rate: 0.24, folds: 0.012, foldCount: 9, wrap: true, hem: (th, h, b) => h - 0.05 * b.s * Math.max(0, Math.cos(th - FRONT + 0.9)) },
  tiered: { rate: 0.3, folds: 0.014, foldCount: 12, tiers: 2 },
  mermaid: {
    rate: -0.04,
    folds: 0.02,
    foldCount: 12,
    shape: (y, b) => (y < b.y.knee ? (b.y.knee - y) * 0.75 : 0),
  },
  balloon: {
    rate: 0.05,
    folds: 0.01,
    foldCount: 10,
    shape: (y, b, hemY) => (y < b.y.hip ? 0.06 * Math.sin(Math.PI * Math.min(1, (b.y.hip - y) / (b.y.hip - hemY))) : 0),
  },
  asymmetric: { rate: 0.28, folds: 0.016, foldCount: 10, hem: (th, h, b) => h - 0.12 * b.s * (0.5 + 0.5 * Math.cos(th - 0.3)) },
  slip: { rate: 0.08, folds: 0.009, foldCount: 6 },
};

/** Parte de falda (también la usa el vestido): de `topY` al bajo con el corte dado. */
function skirtShell(b: Body, cut: SkirtCut, topY: number, hemY: number, ease: number, startY = b.y.hip) {
  const hipRx = b.section(b.y.hip).rx;
  const clear = legClearance(b);
  const span = Math.max(0.01, startY - hemY);
  const tierStep = (y: number) => (cut.tiers ? Math.floor(Math.max(0, startY - y) / (span / (cut.tiers + 1))) * 0.014 : 0);
  return shell(b, {
    bottom: (th) => (cut.hem ? cut.hem(th, hemY, b) : hemY) + 0.008 * folds(th, cut.foldCount, 0.4),
    top: () => topY,
    ease,
    drape: 0,
    flare: (y, sec) => {
      let f = y < startY ? Math.max(0, hipRx - sec.rx) * smoothstep(startY, b.y.hip, y) + (startY - y) * cut.rate : 0;
      if (cut.shape) f += cut.shape(y, b, hemY);
      f += tierStep(y);
      return Math.max(f, clear(y, sec) - ease);
    },
    foldAmp: (u) => {
      const y = lerp(hemY, topY, u);
      if (y >= startY) return 0;
      const k = Math.pow((startY - y) / span, cut.pleats ? 0.4 : 1.4);
      return cut.folds * k;
    },
    foldCount: cut.foldCount,
    rows: 50,
    cols: cut.pleats ? 200 : 120,
  });
}

function skirt(a: Attributes, b: Body, layer: number): GarmentBuild {
  const cut = SKIRT_CUTS[attr(a, 'fit') ?? 'a_line'] ?? SKIRT_CUTS.a_line;
  const hemY = pick(
    { mini: b.y.crotch - 0.08 * b.s, midi: b.y.knee - 0.1 * b.s, maxi: b.y.ankle + 0.06 * b.s },
    attr(a, 'length'),
    b.y.knee - 0.1 * b.s,
  );
  const ease = 0.01 + layer;
  const sk = skirtShell(b, cut, b.y.waist, hemY, ease);
  const band = shell(b, { bottom: () => b.y.waist - 0.03 * b.s, top: () => b.y.waist + 0.006, ease: ease + 0.003, drape: 0, rows: 3 });
  const span = Math.max(0.2, b.y.waist - hemY);
  const parts: GarmentPart[] = [
    { geometry: sk.geometry, tone: 'base', lined: true },
    ...hemWithStitch(sk.edge(0), sk.edge(0.02 / span, 0.0012), 0.0032, true),
    { geometry: band.geometry, tone: 'base', role: 'trim' },
    hem(band.edge(1, 0.001), 0.0026, true, 'base', 'trim'),
    ...stitches(band.edge(0.2, 0.0009), true),
    seamLine(band.edge(0, 0.0006), true),
  ];
  parts.push(...skirtDetails(b, cut, sk, b.y.hip, hemY));
  // Cremallera invisible detrás (solo se ve la costura y el tirador)
  parts.push(seamLine(clothPts(b, steps(b.y.hip - 0.04, b.y.waist, 10).map((y): [number, number] => [y, -Math.PI / 2]), ease + 0.001)));
  if (has('pockets', false)) {
    for (const sgn of [1, -1]) {
      const opening = clothPts(b, steps(0, 1, 8).map((k): [number, number] => [lerp(b.y.waist - 0.03, b.y.hip - 0.02, k), FRONT + sgn * lerp(0.75, 1.15, k)]), ease + 0.0014);
      parts.push({ geometry: cord(opening, 0.0016, false, 5), tone: 'base' }, ...stitches(opening.map((q) => q.clone().add(new THREE.Vector3(0, 0.003, 0)))));
    }
  }
  if (has('belt', false)) parts.push(...belt(b, b.y.waist - 0.012 * b.s, ease + 0.004, 0));
  if (has('frontSlit', false)) {
    const y0 = hemY;
    const y1 = hemY + Math.min(0.18, span * 0.35);
    parts.push(seamLine(clothPts(b, steps(y0, y1, 6).map((y): [number, number] => [y, FRONT + 0.12]), ease + 0.002 + (cut.rate > 0 ? 0.01 : 0))));
  }
  if (has('buttonFront', false)) {
    // Sobre la superficie real de la falda (con su vuelo): punto delantero de cada anillo.
    for (let i = 0; i < 6; i++) {
      const u = lerp(0.08, 0.9, i / 5);
      const ring = sk.edge(u, 0.0022, 72);
      const p = ring[0];
      const n = ring[1].clone().sub(ring[ring.length - 1]).cross(sk.edge(u + 0.01, 0.0022, 72)[0].sub(p)).normalize();
      if (n.z < 0) n.negate();
      parts.push({ geometry: place(buttonDisc(0.0075), p, n), tone: 'light', role: 'button', fabric: 'none' });
    }
  }
  return { parts, fabric: fabricFor('skirt', a) };
}

/** Volantes (líneas de cada capa) y cruce de la falda cruzada. */
function skirtDetails(b: Body, cut: SkirtCut, sk: ReturnType<typeof shell>, startY: number, hemY: number): GarmentPart[] {
  const parts: GarmentPart[] = [];
  if (cut.tiers) {
    for (let k = 1; k <= cut.tiers; k++) {
      const yTier = startY - ((startY - hemY) * k) / (cut.tiers + 1);
      const u = (yTier - hemY) / (b.y.waist - hemY);
      parts.push(hem(sk.edge(Math.max(0, Math.min(1, u)), 0.004), 0.004, true));
    }
  }
  if (cut.wrap) {
    // Borde del cruce: diagonal por delante
    const pts = steps(0.05, 0.98, 12).map((u) => {
      const ring = sk.edge(u, 0.003, 72);
      return ring[Math.round(lerp(4, 12, u)) % ring.length];
    });
    parts.push({ geometry: cord(pts, 0.0028, false, 6), tone: 'base' });
    parts.push(...stitches(pts.map((q) => q.clone().add(new THREE.Vector3(-0.006, 0, 0.0015)))));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Vestidos
// ---------------------------------------------------------------------------

interface DressCut {
  /** Altura de la costura de la cintura (null = sin costura). */
  seam: ((b: Body) => number) | null;
  /** Desde dónde cae la falda. */
  skirtFrom: (b: Body) => number;
  skirt: SkirtCut;
  drape: number;
  ease: number;
  neck?: NeckKind;
  sleeve?: string;
  length?: string;
  shirt?: boolean;
  wrap?: boolean;
  deepArmholes?: boolean;
}

const DRESS_CUTS: Record<string, DressCut> = {
  fit_and_flare: { seam: (b) => b.y.waist, skirtFrom: (b) => b.y.waist, skirt: { rate: 0.24, folds: 0.02, foldCount: 12 }, drape: 0, ease: 0.012 },
  a_line: { seam: null, skirtFrom: (b) => b.y.chest, skirt: { rate: 0.17, folds: 0.012, foldCount: 9 }, drape: 0.4, ease: 0.014 },
  bodycon: { seam: null, skirtFrom: (b) => b.y.hip, skirt: { rate: 0, folds: 0, foldCount: 9 }, drape: 0, ease: 0.005, length: 'mini' },
  sheath: { seam: null, skirtFrom: (b) => b.y.hip, skirt: { rate: 0, folds: 0.002, foldCount: 9 }, drape: 0, ease: 0.012 },
  shift: { seam: null, skirtFrom: (b) => b.y.hip, skirt: { rate: 0.02, folds: 0.005, foldCount: 8 }, drape: 1, ease: 0.02 },
  wrap: { seam: (b) => b.y.waist, skirtFrom: (b) => b.y.waist, skirt: { rate: 0.2, folds: 0.016, foldCount: 10 }, drape: 0, ease: 0.014, neck: 'v', wrap: true },
  shirt: { seam: (b) => b.y.waist, skirtFrom: (b) => b.y.hip, skirt: { rate: 0.06, folds: 0.008, foldCount: 9 }, drape: 0.8, ease: 0.02, neck: 'high', sleeve: 'short', shirt: true },
  tshirt: { seam: null, skirtFrom: (b) => b.y.hip, skirt: { rate: 0.03, folds: 0.005, foldCount: 8 }, drape: 1, ease: 0.022, neck: 'crew', sleeve: 'short' },
  slip: { seam: null, skirtFrom: (b) => b.y.hip, skirt: { rate: 0.08, folds: 0.01, foldCount: 7 }, drape: 0.3, ease: 0.012, neck: 'scoop', sleeve: 'sleeveless', deepArmholes: true },
  empire: { seam: (b) => b.y.chest - 0.07 * b.s, skirtFrom: (b) => b.y.chest - 0.07 * b.s, skirt: { rate: 0.2, folds: 0.016, foldCount: 11 }, drape: 0, ease: 0.014 },
  babydoll: { seam: (b) => b.y.chest - 0.07 * b.s, skirtFrom: (b) => b.y.chest - 0.07 * b.s, skirt: { rate: 0.38, folds: 0.024, foldCount: 12 }, drape: 0, ease: 0.014, length: 'mini' },
  mermaid: { seam: null, skirtFrom: (b) => b.y.hip, skirt: SKIRT_CUTS.mermaid, drape: 0, ease: 0.008, length: 'maxi' },
  tiered: { seam: (b) => b.y.waist, skirtFrom: (b) => b.y.waist, skirt: { rate: 0.26, folds: 0.016, foldCount: 12, tiers: 2 }, drape: 0, ease: 0.014 },
};

function dress(a: Attributes, b: Body, layer: number): GarmentBuild {
  const cut = DRESS_CUTS[attr(a, 'fit') ?? 'fit_and_flare'] ?? DRESS_CUTS.fit_and_flare;
  const hemY = pick(
    { mini: b.y.crotch - 0.07 * b.s, midi: b.y.knee - 0.1 * b.s, maxi: b.y.ankle + 0.05 * b.s },
    attr(a, 'length') ?? cut.length,
    b.y.knee - 0.1 * b.s,
  );
  const sleeve = attr(a, 'sleeve') ?? cut.sleeve ?? 'sleeveless';
  const neckAttr = attr(a, 'neckline');
  const neck: NeckKind = neckAttr
    ? pick<NeckKind>({ scoop: 'scoop', v_neck: 'v', square: 'square', crew: 'crew' }, neckAttr, 'scoop')
    : cut.neck ?? 'scoop';
  const ease = cut.ease + layer;
  const topFn = neckline(b, neck, sleeve === 'sleeveless', cut.deepArmholes);
  const startY = cut.skirtFrom(b);
  const hipRx = b.section(b.y.hip).rx;
  const startRx = b.section(startY).rx;
  const clear = legClearance(b);
  const sk = cut.skirt;
  const span = Math.max(0.01, startY - hemY);
  const sh = shell(b, {
    bottom: (th) => hemY + 0.012 * folds(th, sk.foldCount, 2.1),
    top: topFn,
    ease,
    drape: cut.drape,
    // Ceñido por arriba; desde `startY` la falda cae con el vuelo del corte
    flare: (y, sec) => {
      let f = 0;
      if (y < startY) {
        f = Math.max(0, Math.max(startRx, y < b.y.hip ? hipRx : 0) - sec.rx) * smoothstep(startY, b.y.hip, y) + (startY - y) * sk.rate;
        if (sk.shape) f += sk.shape(y, b, hemY);
        if (sk.tiers) f += Math.floor((startY - y) / (span / (sk.tiers + 1))) * 0.014;
      }
      return Math.max(f, clear(y, sec) - ease);
    },
    foldAmp: (u) => {
      const y = lerp(hemY, topFn(FRONT), u);
      return y < startY ? sk.folds * Math.pow((startY - y) / span, 1.3) : 0;
    },
    foldCount: sk.foldCount,
    rows: 64,
    cols: 120,
  });
  const dressSpan = Math.max(0.3, topFn(FRONT) - hemY);
  const parts: GarmentPart[] = [
    { geometry: sh.geometry, tone: 'base', lined: true },
    ...hemWithStitch(sh.edge(0), sh.edge(0.02 / dressSpan, 0.0012), 0.0032, true),
    hem(sh.edge(1, 0.001), 0.0032, true, 'base', 'trim'),
    ...stitches(sh.edge(1 - 0.01 / dressSpan, 0.0012), true),
    ...sleeves(b, sleeve, 0.014 + layer),
  ];
  if (cut.seam) {
    const y = cut.seam(b);
    const line = shell(b, { bottom: () => y, top: () => y + 0.001, ease: ease + 0.0012, drape: cut.drape, rows: 1 });
    parts.push(seamLine(line.edge(0), true));
  }
  // Cremallera invisible en la espalda
  parts.push(seamLine(clothPts(b, steps(b.y.waist - 0.12, topFn(-Math.PI / 2) - 0.01, 12).map((y): [number, number] => [y, -Math.PI / 2]), ease + 0.0012, cut.drape)));
  if (sk.tiers) {
    for (let k = 1; k <= sk.tiers; k++) {
      const yTier = startY - (span * k) / (sk.tiers + 1);
      const line = shell(b, { bottom: () => yTier, top: () => yTier + 0.001, ease: ease + (startY - yTier) * sk.rate + k * 0.014, drape: cut.drape, rows: 1 });
      parts.push(hem(line.edge(0), 0.004, true));
    }
  }
  if (cut.wrap) {
    // Cruce del cuerpo y lazada a la cintura
    const pts = steps(b.y.waist, topFn(FRONT + 0.4) - 0.01, 10).map((y): [number, number] => [y, FRONT - 0.35 + 0.75 * smoothstep(b.y.waist, b.y.chest + 0.08, y)]);
    parts.push({ geometry: cord(clothPts(b, pts, ease + 0.002), 0.0026, false, 6), tone: 'base' });
    const knot = onCloth(b, b.y.waist, FRONT - 0.5, ease + 0.008, 0);
    parts.push({ geometry: cord([knot, knot.clone().add(new THREE.Vector3(-0.01, -0.12, 0.02))], 0.006, false, 6), tone: 'base' });
    parts.push({ geometry: cord([knot, knot.clone().add(new THREE.Vector3(0.015, -0.1, 0.025))], 0.006, false, 6), tone: 'base' });
  }
  if (cut.shirt) parts.push(...collar(b, ease, { open: 0.32 }));
  if (has('buttonFront', !!cut.shirt)) {
    for (let i = 0; i < 6; i++) parts.push(...button(b, lerp(b.y.hip, b.y.shoulder - 0.01, i / 5), FRONT, ease, 0.007, 'light', cut.drape));
    for (const d of [0.032, -0.032]) parts.push(...stitches(clothPts(b, steps(b.y.hip - 0.05, b.y.shoulder, 16).map((y): [number, number] => [y, FRONT + d]), ease + 0.0012, cut.drape)));
  }
  if (has('belt', !!cut.shirt)) {
    parts.push(...belt(b, b.y.waist, ease + 0.002, cut.drape, { fabric: fabricFor('dress', a), role: 'body', tone: 'base', height: 0.03 * b.s }));
  }
  if (has('pockets', false)) {
    for (const sgn of [1, -1]) {
      const opening = clothPts(b, steps(0, 1, 8).map((k): [number, number] => [lerp(b.y.hip + 0.03, b.y.hip - 0.09, k), FRONT + sgn * 1.25]), ease + 0.002 + Math.max(0, (startY - b.y.hip) * sk.rate), cut.drape);
      parts.push({ geometry: cord(opening, 0.0016, false, 5), tone: 'base' }, seamLine(opening.map((q) => q.clone().add(new THREE.Vector3(0, 0, -0.003)))));
    }
  }
  return { parts, fabric: fabricFor('dress', a) };
}

// ---------------------------------------------------------------------------
// Calzado
// ---------------------------------------------------------------------------

/** Suela: contorno del pie extruido. */
function sole(foot: Foot, e: number, thickness: number, tone: Tone, role: Role = 'sole'): GarmentPart {
  const n = 40;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const v = i / n;
    pts.push([foot.width(v) + e, v * foot.length]);
  }
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (const [x, z] of pts) shape.lineTo(x, z);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(-pts[i][0], pts[i][1]);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelSegments: 5,
    curveSegments: 8,
  });
  // La forma está en el plano XY (Y = hacia la punta); la tumbamos en el suelo.
  g.rotateX(Math.PI / 2);
  g.translate(0, thickness + 0.004, 0);
  g.rotateY(foot.angle);
  g.translate(foot.origin.x, 0, foot.origin.z);
  // Normales suaves en los lados de la suela, aristas marcadas solo en los cantos.
  g.deleteAttribute('uv');
  const smooth = toCreasedNormals(mergeVertices(g, 1e-5), Math.PI / 5);
  g.dispose();
  return { geometry: smooth, tone, role, fabric: 'none' };
}

/** Pespunte del corte sobre la suela, a ambos lados del pie. */
function weltStitch(foot: Foot, e: number, floor: number): GarmentPart[] {
  return [0.06, Math.PI - 0.06].flatMap((a) =>
    stitches(steps(0.04, 0.96, 40).map((v) => footPoint(foot, v, a, e + 0.0007, floor)), false, { force: ctx.stitch === 'none' ? 'none' : 'single' }),
  );
}

/** Caña (de bota o de zapatilla alta) siguiendo la pierna hasta `top`. */
function shaft(b: Body, leg: Limb, top: number, extra: number, opts: { vTop?: boolean } = {}): GarmentPart[] {
  const legTop = leg.curve.getPointAt(0).y;
  const tAt = (y: number) => (legTop - y) / (legTop - b.y.ankle);
  const r = (t: number) => leg.radius(Math.min(1, t)) + extra;
  const t0 = tAt(top);
  const parts: GarmentPart[] = [{ geometry: tubeAlong(leg.curve, t0, 1.06, r, 18, 32), tone: 'base' }];
  if (!opts.vTop) {
    parts.push(hem(limbRing(leg, t0 + 0.004, r(t0) + 0.001), 0.004, true));
  } else {
    // Borde en "V" de las botas camperas
    const ring = limbRing(leg, t0 + 0.004, r(t0) + 0.001, 32).map((p, i) => {
      const a = (i / 32) * Math.PI * 2;
      return p.add(new THREE.Vector3(0, -0.05 * Math.pow(Math.abs(Math.cos(a)), 6), 0));
    });
    parts.push(hem(ring, 0.004, true));
  }
  return parts;
}

interface ShoeStyle {
  sole: number;
  soleTone: Tone;
  laces: boolean;
  collar: number;
  shaftTop?: (b: Body) => number;
  toeSeam?: boolean;
  elasticSides?: boolean;
}

const SNEAKER_STYLES: Record<string, ShoeStyle> = {
  casual: { sole: 0.026, soleTone: 'sole', laces: true, collar: 0.006, toeSeam: true },
  court: { sole: 0.022, soleTone: 'sole', laces: true, collar: 0.005 },
  running: { sole: 0.032, soleTone: 'light', laces: true, collar: 0.007 },
  high_top: { sole: 0.026, soleTone: 'sole', laces: true, collar: 0.006, toeSeam: true, shaftTop: (b) => b.y.ankle + 0.08 * b.s },
  slip_on: { sole: 0.022, soleTone: 'sole', laces: false, collar: 0.005, elasticSides: true },
  chunky: { sole: 0.05, soleTone: 'sole', laces: true, collar: 0.008 },
  skate: { sole: 0.028, soleTone: 'sole', laces: true, collar: 0.01, toeSeam: true },
  // Runner de punto y baloncesto de caña media (tienen modelo en la colección calzado).
  knit: { sole: 0.03, soleTone: 'light', laces: true, collar: 0.006 },
  mid_top: { sole: 0.026, soleTone: 'sole', laces: true, collar: 0.007, toeSeam: true, shaftTop: (b) => b.y.ankle + 0.04 * b.s },
};

function sneakers(a: Attributes, b: Body): GarmentBuild {
  const st = SNEAKER_STYLES[attr(a, 'style') ?? 'casual'] ?? SNEAKER_STYLES.casual;
  const parts: GarmentPart[] = [];
  const e = 0.007;
  b.feet.forEach((foot, i) => {
    parts.push(sole(foot, e + 0.003, st.sole, st.soleTone));
    parts.push({ geometry: footSurface(foot, e, { floor: st.sole, upperOnly: true }), tone: 'base' });
    if (st.shaftTop) parts.push(...shaft(b, b.legs[i], st.shaftTop(b), 0.014));
    else {
      // Cuello acolchado de la zapatilla (abertura del tobillo)
      const collarPts = Array.from({ length: 24 }, (_, k) => {
        const ang = (k / 24) * Math.PI * 2;
        const v = 0.2 + 0.11 * Math.sin(ang);
        return footPoint(foot, v, Math.PI / 2 + Math.cos(ang) * 1.2, e + 0.003, st.sole);
      });
      parts.push({ geometry: cord(collarPts, st.collar, true, 8), tone: 'dark', role: 'trim', fabric: 'none' });
    }
    // Pespunte que une el corte a la suela (a cada lado del pie)
    parts.push(...weltStitch(foot, e, st.sole));
    if (has('laces', st.laces)) {
      // Ojales metálicos y cordones cruzados con lazo
      for (let k = 0; k < 5; k++) {
        const v = 0.38 + k * 0.055;
        const l = footPoint(foot, v, Math.PI / 2 - 0.55, e + 0.004, st.sole);
        const r = footPoint(foot, v, Math.PI / 2 + 0.55, e + 0.004, st.sole);
        const m = footPoint(foot, v + 0.01, Math.PI / 2, e + 0.0075, st.sole);
        parts.push({ geometry: cord([l, m, r], 0.0019, false, 6), tone: 'light', role: 'lace', fabric: 'none' });
        for (const q of [l, r]) {
          const eyelet = new THREE.TorusGeometry(0.0028, 0.0009, 6, 12);
          eyelet.lookAt(q.clone().sub(foot.origin).setY(0).normalize());
          eyelet.translate(q.x, q.y, q.z);
          parts.push({ geometry: eyelet, tone: 'metal', role: 'hardware', fabric: 'none', metal: true });
        }
      }
      const knot = footPoint(foot, 0.36, Math.PI / 2, e + 0.009, st.sole);
      for (const d of [-1, 1]) {
        parts.push({ geometry: cord([knot, knot.clone().add(new THREE.Vector3(d * 0.012, 0.004, -0.008)), knot.clone().add(new THREE.Vector3(d * 0.018, -0.008, 0.004))], 0.0019, false, 6), tone: 'light', role: 'lace', fabric: 'none' });
      }
    }
    if (has('elasticSides', !!st.elasticSides)) {
      for (const side of [0.35, Math.PI - 0.35]) {
        const pts = steps(0.36, 0.5, 4).map((v) => footPoint(foot, v, side, e + 0.002, st.sole));
        parts.push({ geometry: cord(pts, 0.006, false, 6), tone: 'dark', role: 'trim', fabric: 'knit' });
      }
    }
    if (has('heelTab', true) && !st.shaftTop) {
      const p = footPoint(foot, 0.02, Math.PI / 2, e + 0.004, st.sole);
      const g = new THREE.BoxGeometry(0.022, 0.03, 0.004);
      g.translate(0, 0.012, 0);
      g.rotateY(foot.angle);
      g.translate(p.x, p.y + 0.02, p.z - 0.004);
      parts.push({ geometry: g, tone: 'dark', role: 'secondary', fabric: 'none' });
    }
    if (has('toeCap', false) || st.toeSeam) {
      const toe = Array.from({ length: 17 }, (_, k) => footPoint(foot, 0.8, (k / 16) * Math.PI, e + 0.0012, st.sole));
      if (has('toeCap', false)) {
        parts.push({
          geometry: footSurface(foot, e + 0.0012, { floor: st.sole, upperOnly: true, from: 0.8 }),
          tone: 'base',
          role: 'secondary',
        });
      }
      parts.push(...stitches(toe, false, { force: 'single' }));
    }
    if (has('sidePanel', true)) {
      // Panel lateral (franja) en color secundario
      for (const side of [0.3, Math.PI - 0.3]) {
        const pts = steps(0.3, 0.68, 10).map((v) => footPoint(foot, v, side + (side < 1 ? 1 : -1) * 0.25 * Math.sin(Math.PI * ((v - 0.3) / 0.38)), e + 0.0015, st.sole));
        parts.push({ geometry: ribbon(new THREE.CatmullRomCurve3(pts), 0.012, 0.0004, 24), tone: 'dark', role: 'secondary', fabric: 'leather' });
      }
    }
  });
  return { parts, fabric: fabricFor('sneakers', a), presentation: [0.25, -0.65, 0] };
}

const BOOT_STYLES: Record<string, { sole: number; shaft: string; laces?: boolean; elastic?: boolean; vTop?: boolean; heel: string }> = {
  chelsea: { sole: 0.02, shaft: 'ankle', elastic: true, heel: 'block' },
  combat: { sole: 0.032, shaft: 'mid', laces: true, heel: 'block' },
  cowboy: { sole: 0.018, shaft: 'mid', vTop: true, heel: 'high' },
  hiking: { sole: 0.036, shaft: 'ankle', laces: true, heel: 'flat' },
  dress: { sole: 0.016, shaft: 'ankle', heel: 'block' },
  riding: { sole: 0.018, shaft: 'knee', heel: 'flat' },
};

function boots(a: Attributes, b: Body): GarmentBuild {
  const st = BOOT_STYLES[attr(a, 'style') ?? 'chelsea'] ?? BOOT_STYLES.chelsea;
  const parts: GarmentPart[] = [];
  const e = 0.007;
  const shaftKey = attr(a, 'shaft') ?? st.shaft;
  const top = pick(
    { ankle: b.y.ankle + 0.1 * b.s, mid: b.y.ankle + 0.2 * b.s, knee: b.y.knee + 0.02, over_knee: b.y.knee + 0.13 * b.s },
    shaftKey,
    b.y.ankle + 0.1 * b.s,
  );
  const heelH = pick({ flat: 0.012, block: 0.03, high: 0.045 }, attr(a, 'heel') ?? st.heel, 0.03);
  b.feet.forEach((foot, i) => {
    parts.push(sole(foot, e + 0.003, st.sole, 'dark'));
    parts.push(...weltStitch(foot, e, st.sole));
    const heightScale = (v: number) => 1 + 0.25 * (1 - smoothstep(0.3, 0.7, v));
    parts.push({ geometry: footSurface(foot, e, { floor: st.sole, upperOnly: true, heightScale }), tone: 'base' });
    const leg = b.legs[i];
    parts.push(...shaft(b, leg, top, 0.017, { vTop: st.vTop }));
    // Tacón
    const heel = new THREE.BoxGeometry(0.058, heelH, 0.068);
    const hp = foot.toWorld(0, heelH / 2, 0.034);
    heel.rotateY(foot.angle);
    heel.translate(hp.x, hp.y, hp.z);
    parts.push({ geometry: heel, tone: 'dark', role: 'sole', fabric: 'none' });
    const legTop = leg.curve.getPointAt(0).y;
    const tAt = (y: number) => (legTop - y) / (legTop - b.y.ankle);
    if (has('pullTab', true)) {
      // Tirador trasero
      const c = curvePoint(leg.curve, tAt(top) + 0.01);
      const g = new THREE.TorusGeometry(0.011, 0.0028, 6, 16, Math.PI);
      g.rotateZ(Math.PI);
      g.translate(c.x, c.y + 0.004, c.z - leg.radius(tAt(top)) - 0.019);
      parts.push({ geometry: g, tone: 'dark', role: 'trim', fabric: 'none' });
    }
    if (has('buckle', false)) {
      const t = lerp(tAt(top), 1, 0.35);
      const len = leg.curve.getLength();
      const half = 0.011 / len;
      parts.push({
        geometry: tubeAlong(leg.curve, t - half, t + half, (tt) => leg.radius(Math.min(1, tt)) + 0.0205, 3, 48),
        tone: 'dark',
        role: 'trim',
        fabric: 'leather',
      });
      parts.push(...stitches(limbRing(leg, t - half * 0.7, leg.radius(Math.min(1, t)) + 0.0212, 64), true));
      parts.push(...stitches(limbRing(leg, t + half * 0.7, leg.radius(Math.min(1, t)) + 0.0212, 64), true));
      const c = curvePoint(leg.curve, t);
      const p = c.clone().add(new THREE.Vector3(leg.side * (leg.radius(Math.min(1, t)) + 0.025), 0, 0));
      const g = new THREE.TorusGeometry(0.008, 0.0016, 6, 4);
      g.rotateZ(Math.PI / 4);
      g.rotateY(Math.PI / 2);
      g.translate(p.x, p.y, p.z);
      parts.push({ geometry: g, tone: 'metal', role: 'hardware', fabric: 'none', metal: true });
    }
    if (has('elasticSides', !!st.elastic)) {
      // Elástico lateral de la chelsea
      for (const sgn of [1, -1]) {
        const pts = steps(tAt(top) + 0.01, 1.0, 6).map((t) => {
          const c = curvePoint(leg.curve, t);
          return c.add(new THREE.Vector3(sgn * (leg.radius(Math.min(1, t)) + 0.019), 0, 0));
        });
        parts.push({ geometry: cord(pts, 0.008, false, 6), tone: 'dark', role: 'trim', fabric: 'knit' });
      }
    }
    if (has('laces', !!st.laces)) {
      // Cordones cruzados por la caña
      const t0 = tAt(top) + 0.02;
      for (let k = 0; k < 7; k++) {
        const t = lerp(t0, 1.0, k / 6);
        const c = curvePoint(leg.curve, Math.min(1, t));
        const r = leg.radius(Math.min(1, t)) + 0.02;
        const l = c.clone().add(new THREE.Vector3(-0.015, 0, r));
        const rr = c.clone().add(new THREE.Vector3(0.015, -0.012, r));
        parts.push({ geometry: cord([l, rr], 0.0018, false, 5), tone: 'light', role: 'lace', fabric: 'none' });
        for (const q of [l, rr]) {
          const eyelet = new THREE.TorusGeometry(0.0026, 0.0009, 6, 12);
          eyelet.translate(q.x, q.y, q.z - 0.0008);
          parts.push({ geometry: eyelet, tone: 'metal', role: 'hardware', fabric: 'none', metal: true });
        }
      }
    }
  });
  return { parts, fabric: fabricFor('boots', a), presentation: [0.25, -0.65, 0] };
}

// ---------------------------------------------------------------------------
// Accesorios
// ---------------------------------------------------------------------------

const CAP_STYLES: Record<string, { u0: number; e: number; brimLen: number; brimCurve: number; panels: number; meshBack?: boolean; flat?: boolean }> = {
  baseball: { u0: 0.58, e: 0.012, brimLen: 0.082, brimCurve: 0.03, panels: 6 },
  dad: { u0: 0.62, e: 0.016, brimLen: 0.075, brimCurve: 0.035, panels: 6 },
  trucker: { u0: 0.55, e: 0.016, brimLen: 0.08, brimCurve: 0.028, panels: 5, meshBack: true },
  snapback: { u0: 0.54, e: 0.018, brimLen: 0.085, brimCurve: 0, panels: 6, flat: true },
  five_panel: { u0: 0.6, e: 0.013, brimLen: 0.068, brimCurve: 0.004, panels: 5, flat: true },
};

function cap(a: Attributes, b: Body): GarmentBuild {
  const st = CAP_STYLES[attr(a, 'style') ?? 'baseball'] ?? CAP_STYLES.baseball;
  const { e, u0 } = st;
  const crownPoint = (u: number, phi: number) => b.headPoint(u0 + u * (1 - u0), phi * Math.PI * 2, e);
  const parts: GarmentPart[] = [];
  if (st.meshBack) {
    // Trucker: frontal de tela y trasera de rejilla (más oscura)
    const half = (from: number, tone: Tone): GarmentPart => ({
      geometry: paramSurface({
        rows: 16,
        cols: 24,
        closed: false,
        point: (u, phi) => b.headPoint(u0 + u * (1 - u0), (from + phi * 0.5) * Math.PI * 2, e),
      }),
      tone,
      fabric: tone === 'dark' ? 'canvas' : undefined,
    });
    parts.push(half(0, 'base'), { ...half(0.5, 'dark'), role: 'secondary' });
  } else {
    parts.push({
      geometry: paramSurface({
        rows: 16,
        cols: 48,
        closed: true,
        uvScale: [0.6 * TEX_DENSITY, 0.15 * TEX_DENSITY],
        point: crownPoint,
      }),
      tone: 'base',
    });
  }
  // Banda inferior y costuras de los paneles (con pespunte doble a cada lado)
  parts.push(hem(Array.from({ length: 48 }, (_, i) => v3(b.headPoint(u0, (i / 48) * Math.PI * 2, e + 0.001))), 0.0032, true));
  parts.push(...stitches(Array.from({ length: 96 }, (_, i) => v3(b.headPoint(u0 + 0.025, (i / 96) * Math.PI * 2, e + 0.0012))), true));
  for (let k = 0; k < st.panels; k++) {
    const th = FRONT + (k * Math.PI * 2) / st.panels;
    const pts = steps(u0, 0.99, 14).map((u) => v3(b.headPoint(u, th, e + 0.0008)));
    parts.push(seamLine(pts));
    for (const d of [-0.05, 0.05]) parts.push(...stitches(steps(u0 + 0.01, 0.97, 14).map((u) => v3(b.headPoint(u, th + d / Math.max(0.3, 1 - u), e + 0.0011))), false, { force: ctx.stitch === 'none' ? 'none' : 'single' }));
    // Ojetes de ventilación en cada panel
    if (has('eyelets', true)) {
      const q = v3(b.headPoint(lerp(u0, 1, 0.62), th + Math.PI / st.panels, e + 0.0012));
      const n = q.clone().sub(new THREE.Vector3(0, b.y.chin + 0.06, 0.01)).normalize();
      const g = new THREE.TorusGeometry(0.0028, 0.0011, 6, 14);
      g.rotateX(Math.PI / 2);
      parts.push({ geometry: place(g, q, n), tone: 'metal', role: 'hardware', fabric: 'none', metal: true });
    }
  }
  // Botón superior
  if (has('topButton', true)) {
    const topP = v3(b.headPoint(1, 0, e));
    const knob = new THREE.SphereGeometry(0.0085, 14, 8);
    knob.scale(1, 0.55, 1);
    knob.translate(topP.x, topP.y + 0.002, topP.z);
    parts.push({ geometry: knob, tone: 'base', role: 'button' });
  }
  // Cierre trasero: abertura con tira y hebilla
  if (has('backStrap', true)) {
    const pts = steps(-0.32, 0.32, 10).map((k) => v3(b.headPoint(u0 + 0.01, -Math.PI / 2 + k, e + 0.0035)));
    parts.push({ geometry: ribbon(new THREE.CatmullRomCurve3(pts), 0.016, 0, 20), tone: 'dark', role: 'trim', fabric: 'none' });
    const q = v3(b.headPoint(u0 + 0.012, -Math.PI / 2 + 0.12, e + 0.006));
    const g = new THREE.TorusGeometry(0.008, 0.0015, 6, 4);
    g.rotateZ(Math.PI / 4);
    g.translate(q.x, q.y, q.z);
    parts.push({ geometry: g, tone: 'metal', role: 'hardware', fabric: 'none', metal: true });
  }
  // Visera: curva (béisbol) o plana (snapback)
  const spread = st.flat ? 0.8 : 0.95;
  const brimPoint = (v: number, phi: number): THREE.Vector3 => {
    const k = (phi - 0.5) * 2;
    const th = FRONT + k * spread;
    const root = v3(b.headPoint(u0, th, e));
    const center = new THREE.Vector3(0, root.y, 0.02);
    const dir = new THREE.Vector3(root.x - center.x, 0, root.z - center.z).normalize();
    if (st.flat) dir.lerp(new THREE.Vector3(0, 0, 1), 0.6).normalize();
    const len = st.brimLen * b.s * Math.pow(Math.cos(k * Math.PI * 0.5), st.flat ? 0.4 : 0.8);
    // Visera hacia delante, algo inclinada y curvada hacia abajo en los lados
    return root.addScaledVector(dir, len * v).add(new THREE.Vector3(0, -0.012 * v - st.brimCurve * v * k * k, 0));
  };
  parts.push({
    geometry: paramSurface({
      rows: 8,
      cols: 30,
      closed: false,
      point: (v, phi) => {
        const p = brimPoint(v, phi);
        return [p.x, p.y, p.z];
      },
    }),
    tone: 'base',
    role: 'secondary',
  });
  parts.push(hem(Array.from({ length: 31 }, (_, i) => brimPoint(1, i / 30)), 0.0028, false, 'base', 'secondary'));
  // Pespuntes concéntricos de la visera
  for (const v of [0.82, 0.66, 0.5]) parts.push(...stitches(Array.from({ length: 31 }, (_, i) => brimPoint(v, 0.03 + (i / 30) * 0.94).add(new THREE.Vector3(0, 0.0012, 0))), false, { force: ctx.stitch === 'none' ? 'none' : 'single' }));
  return { parts, fabric: fabricFor('cap', a), presentation: [0.3, -0.6, 0] };
}

/**
 * Bufanda: una vuelta alrededor del cuello (por encima de chaqueta) y dos
 * caídas sobre el pecho. Versión sencilla por código; la de la biblioteca
 * (casual/06_bufanda.glb) es la que se usa normalmente.
 */
function scarf(a: Attributes, b: Body): GarmentBuild {
  const chunky = attr(a, 'knit') !== 'fine';
  const r = (chunky ? 0.026 : 0.019) * b.s;
  const y0 = b.y.neck - 0.012 * b.s;
  const R = b.neckR + 0.05 * b.s;
  const ring = paramSurface({
    rows: 18,
    cols: 64,
    closed: true,
    point: (u, phi) => {
      const ang = phi * Math.PI * 2;
      const t = u * Math.PI * 2;
      const lump = 1 + 0.12 * Math.sin(ang * 3 + 1) + 0.06 * Math.sin(ang * 7);
      const rr = r * lump;
      const cx = (R + rr * Math.cos(t)) * Math.cos(ang);
      const cz = 0.01 + (R * 0.96 + rr * Math.cos(t)) * Math.sin(ang);
      const cy = y0 + 0.012 * Math.sin(ang) + rr * 1.25 * Math.sin(t);
      return [cx, cy, cz];
    },
  });
  const parts: GarmentPart[] = [{ geometry: ring, tone: 'base', role: 'body' }];
  // Caídas: siguen el pecho a la holgura de una chaqueta
  for (const [xc, len, tilt] of [[0.045, 0.40, 0.08], [-0.035, 0.32, -0.06]] as const) {
    const top = y0 - 0.02 * b.s;
    parts.push({
      geometry: paramSurface({
        rows: 24,
        cols: 10,
        closed: false,
        point: (u, v) => {
          const py = top - u * len * b.s;
          const sec = b.section(Math.max(py, b.y.waist));
          const x = (xc + tilt * u * len + (v - 0.5) * 0.15) * b.s;
          const theta = Math.PI / 2 - Math.asin(Math.max(-0.95, Math.min(0.95, x / (sec.rx + 0.06))));
          const [px, , pz] = b.surface(py, theta, 0.062 + 0.004 * Math.sin(v * 6 + u * 4), sec);
          return [px, py, pz];
        },
      }),
      tone: 'base',
      role: 'body',
    });
  }
  return { parts, fabric: fabricFor('scarf', a) };
}

/**
 * Gorro de punto con vuelta. En la web se usa el modelo de la colección street
 * (libraryCatalog); este es el de reserva, generado por código.
 */
function beanie(a: Attributes, b: Body): GarmentBuild {
  const u0 = 0.5;
  const cuffTop = 0.64;
  const e = 0.009;
  const parts: GarmentPart[] = [];
  // Copa algo holgada arriba (el punto cae un poco)
  const crown = (u: number, phi: number) => b.headPoint(u0 + u * (1 - u0), phi * Math.PI * 2, e + 0.006 * Math.sin(u * Math.PI * 0.9));
  parts.push({
    geometry: paramSurface({ rows: 18, cols: 64, closed: true, uvScale: [0.6 * TEX_DENSITY, 0.15 * TEX_DENSITY], point: crown }),
    tone: 'base',
  });
  // Vuelta doble de canalé
  const cuff = (u: number, phi: number) => b.headPoint(u0 + u * (cuffTop - u0), phi * Math.PI * 2, e + 0.0045);
  parts.push({ geometry: paramSurface({ rows: 6, cols: 64, closed: true, uvScale: [0.6 * TEX_DENSITY, 0.05 * TEX_DENSITY], point: cuff }), tone: 'base' });
  parts.push(hem(Array.from({ length: 64 }, (_, i) => v3(b.headPoint(cuffTop, (i / 64) * Math.PI * 2, e + 0.0035))), 0.003, true));
  parts.push(hem(Array.from({ length: 64 }, (_, i) => v3(b.headPoint(u0, (i / 64) * Math.PI * 2, e + 0.0022))), 0.0028, true));
  // Etiqueta tejida delante
  if (has('label', true)) {
    const q = v3(b.headPoint((u0 + cuffTop) / 2, FRONT, e + 0.0058));
    const n = q.clone().sub(new THREE.Vector3(0, q.y, 0.01)).normalize();
    const g = new THREE.BoxGeometry(0.034, 0.02, 0.0012);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), n, new THREE.Vector3(0, 1, 0));
    g.applyMatrix4(m);
    g.translate(q.x, q.y, q.z);
    parts.push({ geometry: g, tone: 'dark', role: 'trim', fabric: 'none' });
  }
  return { parts, fabric: fabricFor('beanie', a), presentation: [0.3, -0.6, 0] };
}

const BUILDERS: Record<string, (a: Attributes, b: Body, layer: number) => GarmentBuild> = {
  tshirt,
  shirt,
  sweater,
  jacket,
  coat,
  pants,
  shorts,
  underwear,
  skirt,
  dress,
  sneakers,
  boots,
  cap,
  scarf,
  beanie,
};

/**
 * Construye la prenda para un cuerpo concreto.
 * `layer` (0, 1, 2...) separa un poco prendas de la misma categoría para que
 * no se atraviesen al superponerlas. `options` trae la personalización que
 * cambia la forma: piezas que se ponen o quitan, tipo de botón y pespunte.
 */
export function buildGarment(
  modelKey: string,
  attributes: Attributes,
  body: Body = makeBody(),
  layer = 0,
  options: BuildOptions = {},
): GarmentBuild {
  const builder = BUILDERS[modelKey] ?? tshirt;
  const previous = ctx;
  ctx = { parts: options.parts ?? {}, buttonStyle: options.buttonStyle ?? null, stitch: options.stitchStyle ?? 'single' };
  let build: GarmentBuild;
  try {
    build = builder(attributes, body, layer * 0.012);
  } finally {
    ctx = previous;
  }
  // Oclusión ambiental y desgaste horneados por vértice (ver cloth.ts). Las
  // piezas diminutas (puntadas, hilo, metal) no la necesitan.
  const done = new Set<THREE.BufferGeometry>();
  for (const part of build.parts) {
    if (done.has(part.geometry)) continue;
    done.add(part.geometry);
    const tiny = part.metal || part.role === 'stitch' || part.role === 'thread' || part.role === 'seam';
    bakeShading(part.geometry, part.metal ? 'none' : (part.fabric ?? build.fabric), tiny);
  }
  return build;
}

/** Punto más bajo de la prenda (su bajo), para el perfil de movimiento. */
export function garmentMinY(build: GarmentBuild): number {
  let min = Infinity;
  for (const part of build.parts) {
    if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
    min = Math.min(min, part.geometry.boundingBox!.min.y);
  }
  return Number.isFinite(min) ? min : 0;
}

/** Colores derivados del color base para las piezas secundarias. */
export function toneColor(base: string, tone: Tone): THREE.Color {
  const color = new THREE.Color(base);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  switch (tone) {
    case 'base':
      return color;
    case 'dark':
      // En colores muy oscuros, "oscurecer" no se vería: aclaramos un poco.
      return color.clone().offsetHSL(0, -0.05, hsl.l < 0.18 ? 0.07 : -0.1);
    case 'light':
      return color.clone().offsetHSL(0, -0.05, hsl.l > 0.8 ? -0.12 : 0.14);
    case 'sole':
      return new THREE.Color('#E9E7E2');
    case 'metal':
      return new THREE.Color('#A7A6A2');
    case 'stitch':
      // Pespunte típico de los vaqueros
      return new THREE.Color('#C9A15A');
  }
}
