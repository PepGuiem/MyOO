import { useEffect, useState } from 'react';
import { accentTones, readCachedPreferences, usePreferenceVersion } from './preferences';

/**
 * El logo y el icono (public/brand/logo.svg y mark.svg) con el color neón de
 * «Personalizar». Los SVG llevan el borde y el halo en dos degradados naranja
 * → rojo; aquí se cambian esos 5 tonos por los de la paleta elegida y se
 * devuelve el SVG como data: URL (sigue siendo un <img>, así que el CSS y los
 * tamaños no cambian). Con el naranja de siempre se usa el archivo tal cual.
 */

/** Los tonos de acento que llevan los SVG (degradados «hot» y «hotv»). */
const ORIGINAL = ['#ff8a3d', '#ff4d00', '#ff1744', '#ff6a1a', '#d4002f'] as const;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mezcla dos colores (t = cuánto del segundo). */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/** Acento y segundo tono aplicados ahora (variables de <html>; si no, la caché). */
function currentTones(): [string, string] {
  if (typeof document !== 'undefined') {
    const cs = getComputedStyle(document.documentElement);
    const a = cs.getPropertyValue('--neon').trim().toLowerCase();
    const b = cs.getPropertyValue('--neon-2').trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(a) && /^#[0-9a-f]{6}$/.test(b)) return [a, b];
  }
  const t = accentTones(readCachedPreferences());
  return [t[0], t[1]];
}

/** Tonos del logo para la paleta actual (null = los originales). */
export function brandTones(): string[] | null {
  const [neon, hot] = currentTones();
  if (neon === '#ff4d00') return null;
  // Mismo reparto que el original: un tono más claro arriba, el acento en
  // medio, el segundo tono abajo y uno más oscuro para el sombreado.
  return [mix(neon, '#ffffff', 0.28), neon, hot, mix(neon, '#ffffff', 0.12), mix(hot, '#000000', 0.17)];
}

const texts = new Map<string, Promise<string>>();
const urls = new Map<string, string>();

function svgText(url: string): Promise<string> {
  let p = texts.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    });
    p.catch(() => texts.delete(url));
    texts.set(url, p);
  }
  return p;
}

function recolor(text: string, tones: string[]): string {
  let out = text;
  ORIGINAL.forEach((hex, i) => {
    out = out.replace(new RegExp(hex, 'gi'), tones[i]);
  });
  return out;
}

/** data: URL del SVG con el color actual (o la URL original con el naranja). */
export async function brandSvgUrl(url: string): Promise<string> {
  const tones = brandTones();
  if (!tones) return url;
  const key = `${url}|${tones.join(',')}`;
  const hit = urls.get(key);
  if (hit) return hit;
  const svg = recolor(await svgText(url), tones);
  const data = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  urls.set(key, data);
  return data;
}

/** Igual, al momento si ya estaba preparado (para no parpadear). */
function brandSvgUrlSync(url: string): string | null {
  const tones = brandTones();
  if (!tones) return url;
  return urls.get(`${url}|${tones.join(',')}`) ?? null;
}

/** Hook: la URL del SVG de marca con el color neón actual. */
export function useBrandSvg(url: string): string {
  const version = usePreferenceVersion();
  const [src, setSrc] = useState(() => brandSvgUrlSync(url) ?? url);
  useEffect(() => {
    let alive = true;
    const now = brandSvgUrlSync(url);
    if (now) setSrc(now);
    else
      brandSvgUrl(url)
        .then((u) => alive && setSrc(u))
        .catch(() => alive && setSrc(url));
    return () => {
      alive = false;
    };
  }, [url, version]);
  return src;
}
