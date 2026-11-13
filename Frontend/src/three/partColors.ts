/**
 * Color y aspecto de cada pieza según su papel (role) y la personalización.
 *
 * Sin personalización, cada pieza toma un tono derivado del color principal
 * (como hasta ahora). Con ella, botones, pespuntes, cremallera, ribetes,
 * forro, suela, cordones, etc. usan el color elegido.
 */
import * as THREE from 'three';
import type { Customization, MetalFinish, PatternSpec } from '../api/types';
import { legacyPattern, normalizePattern } from '../lib/patterns';
import type { FabricKind } from './fabric';
import type { PatternLook } from './cloth';
import { toneColor, type GarmentPart, type Role } from './garments';
import { patternTexture } from './patternTexture';

/** Acabados de metal: color base y rugosidad (para MeshPhysicalMaterial). */
export const METAL_LOOK: Record<MetalFinish, { color: string; roughness: number }> = {
  silver: { color: '#CFCFD1', roughness: 0.26 },
  gold: { color: '#D8B260', roughness: 0.28 },
  gunmetal: { color: '#5B5E63', roughness: 0.34 },
  brass: { color: '#BFA463', roughness: 0.34 },
  copper: { color: '#C27B52', roughness: 0.3 },
  black: { color: '#232326', roughness: 0.42 },
};

export interface PartLook {
  color: THREE.Color;
  metal: boolean;
  /** Rugosidad para piezas metálicas. */
  roughness?: number;
  /** Clave para compartir material entre piezas iguales. */
  key: string;
}

/** Pespunte por defecto: dorado en vaquero; en el resto, a tono con la tela. */
function defaultStitch(base: string, fabric: FabricKind): THREE.Color {
  if (fabric === 'denim') return new THREE.Color('#C9A15A');
  const c = new THREE.Color(base);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  return c.offsetHSL(0, -0.04, hsl.l > 0.5 ? -0.07 : 0.06);
}

/** Aspecto de una pieza. `fabric` es el tejido principal de la prenda. */
export function partLook(base: string, part: GarmentPart, fabric: FabricKind, custom: Customization | undefined): PartLook {
  const colors = custom?.colors ?? {};
  const finish = METAL_LOOK[custom?.options?.metal ?? 'silver'];
  const role: Role = part.role ?? (part.tone === 'metal' ? 'hardware' : part.tone === 'stitch' ? 'stitch' : part.tone === 'sole' ? 'sole' : 'body');
  const derived = () => toneColor(base, part.tone);
  const metal = !!part.metal || part.tone === 'metal';

  const pick = (slot: string | undefined, fallback: () => THREE.Color) => (slot ? new THREE.Color(slot) : fallback());

  let color: THREE.Color;
  switch (role) {
    case 'trim':
      color = pick(colors.trim, derived);
      break;
    case 'secondary':
      color = pick(colors.secondary, derived);
      break;
    case 'lining':
      color = pick(colors.lining, () => toneColor(base, 'dark'));
      break;
    case 'stitch':
      color = pick(colors.stitching, () => defaultStitch(base, fabric));
      break;
    case 'thread':
      // El hilo del botón: el del pespunte si se eligió; si no, a tono con el botón
      color = pick(colors.stitching, () => pick(colors.buttons, () => toneColor(base, 'light')).offsetHSL(0, 0, -0.12));
      break;
    case 'button':
      color = pick(colors.buttons, () => (metal ? new THREE.Color(finish.color) : derived()));
      break;
    case 'zipper':
      color = metal ? pick(colors.zipper, () => new THREE.Color(finish.color)) : derived();
      break;
    case 'hardware':
      color = pick(colors.hardware, () => new THREE.Color(finish.color));
      break;
    case 'sole':
      color = pick(colors.sole, derived);
      break;
    case 'lace':
      color = pick(colors.laces, derived);
      break;
    default:
      color = derived();
  }
  const roughness = metal ? finish.roughness : undefined;
  return { color, metal, roughness, key: `${role}:${part.tone}:${metal ? 'm' : ''}` };
}

/** Color del forro (cara interior de prendas forradas). */
export function liningColor(base: string, custom: Customization | undefined): THREE.Color {
  return custom?.colors?.lining ? new THREE.Color(custom.colors.lining) : toneColor(base, 'dark');
}

/**
 * Estampado de la prenda (null = liso). Usa `customization.pattern`; en
 * prendas antiguas, su equivalente a partir de `options.pattern` y
 * `patternSize` (con los colores `pattern` / `pattern2` o unos automáticos).
 */
export function patternSpecOf(base: string, custom: Customization | undefined): PatternSpec | null {
  if (custom?.pattern && custom.pattern.colors?.length) return normalizePattern(custom.pattern);
  const legacy = custom?.options?.pattern;
  if (!legacy || legacy === 'solid') return null;
  const c = new THREE.Color(base);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // Sin color elegido: uno que contraste con el fondo.
  const color1 = custom?.colors?.pattern ?? (hsl.l > 0.5 ? '#2B3445' : '#E8E4DA');
  const color2 = custom?.colors?.pattern2 ?? `#${toneColor(base, hsl.l > 0.5 ? 'dark' : 'light').getHexString()}`;
  return legacyPattern(legacy, custom?.options?.patternSize, color1, color2);
}

/** Estampado listo para el material (textura y colores). */
export function patternLook(base: string, custom: Customization | undefined): (PatternLook & { spec: PatternSpec }) | null {
  const spec = patternSpecOf(base, custom);
  if (!spec) return null;
  return {
    spec,
    texture: patternTexture(spec),
    angle: spec.angle,
    size: spec.size,
    opacity: spec.opacity,
    offset: [spec.offsetX, spec.offsetY],
    colors: spec.colors.map((h) => new THREE.Color(h)),
  };
}

/** ¿Lleva estampado esta pieza? Según la zona elegida (tela principal, paneles o todo). */
export function partHasPattern(part: GarmentPart, target: PatternSpec['target']): boolean {
  if (part.metal || part.fabric === 'none') return false;
  const role = part.role ?? 'body';
  const main = role === 'body' && part.tone === 'base';
  if (target === 'main') return main;
  if (target === 'secondary') return role === 'secondary';
  return main || role === 'secondary' || role === 'trim' || (role === 'body' && part.tone !== 'metal' && part.tone !== 'stitch' && part.tone !== 'sole');
}
