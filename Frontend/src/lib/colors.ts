import type { ColorGroup } from '../api/types';
import { t } from '../i18n';

/**
 * Nombres de color: los mismos que usa el estilista del backend
 * (`stylist/engine.ts`), para que el nombre que ves coincida con el grupo
 * por el que filtras.
 */
const NAMED: [string, string][] = [
  ['negro', '#111111'], ['blanco', '#F5F5F2'], ['gris claro', '#C8C8C8'], ['gris', '#8A8A8A'], ['gris oscuro', '#444444'],
  ['crudo', '#EDE6D6'], ['beige', '#D8C3A0'], ['camel', '#B58450'], ['marrón', '#6B4423'], ['azul marino', '#1D2A44'],
  ['azul', '#2F5DA8'], ['azul vaquero', '#4A6A98'], ['celeste', '#9EC3E6'], ['verde', '#3E8E41'], ['verde oliva', '#6B6B3A'],
  ['caqui', '#A39A6B'], ['verde botella', '#1F4A33'], ['rojo', '#C0282D'], ['burdeos', '#6D1F2A'], ['rosa', '#E8A3B8'],
  ['fucsia', '#D0307A'], ['naranja', '#E2762B'], ['mostaza', '#C9A227'], ['amarillo', '#F0D44A'], ['morado', '#6B3FA0'],
  ['lila', '#B79CD6'], ['turquesa', '#2BB3B1'],
];

const NAME_LABEL: Record<string, string> = {
  negro: t('negro'),
  blanco: t('blanco'),
  'gris claro': t('gris claro'),
  gris: t('gris'),
  'gris oscuro': t('gris oscuro'),
  crudo: t('crudo'),
  beige: t('beige'),
  camel: t('camel'),
  marrón: t('marrón'),
  'azul marino': t('azul marino'),
  azul: t('azul'),
  'azul vaquero': t('azul vaquero'),
  celeste: t('celeste'),
  verde: t('verde'),
  'verde oliva': t('verde oliva'),
  caqui: t('caqui'),
  'verde botella': t('verde botella'),
  rojo: t('rojo'),
  burdeos: t('burdeos'),
  rosa: t('rosa'),
  fucsia: t('fucsia'),
  naranja: t('naranja'),
  mostaza: t('mostaza'),
  amarillo: t('amarillo'),
  morado: t('morado'),
  lila: t('lila'),
  turquesa: t('turquesa'),
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Nombre del color más parecido («azul marino», «camel»…), ya traducido. */
export function colorName(hex: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return '';
  const a = rgb(hex);
  let best = NAMED[0][0];
  let bd = Infinity;
  for (const [name, h] of NAMED) {
    const b = rgb(h);
    const rm = (a[0] + b[0]) / 2;
    const d = (2 + rm / 256) * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + (2 + (255 - rm) / 256) * (a[2] - b[2]) ** 2;
    if (d < bd) {
      bd = d;
      best = name;
    }
  }
  return NAME_LABEL[best] ?? best;
}

/** Grupos de color del filtro: nombre y muestra. */
export const COLOR_GROUP: Record<ColorGroup, { label: string; swatch: string }> = {
  black: { label: t('Negro'), swatch: '#111111' },
  white: { label: t('Blanco'), swatch: '#F3F1EC' },
  grey: { label: t('Gris'), swatch: '#8A8A8A' },
  beige: { label: t('Beige'), swatch: '#D8C3A0' },
  brown: { label: t('Marrón'), swatch: '#7A4E2A' },
  blue: { label: t('Azul'), swatch: '#2F5DA8' },
  green: { label: t('Verde'), swatch: '#3E8E41' },
  red: { label: t('Rojo'), swatch: '#C0282D' },
  pink: { label: t('Rosa'), swatch: '#E8A3B8' },
  orange: { label: t('Naranja'), swatch: '#E2762B' },
  yellow: { label: t('Amarillo'), swatch: '#F0D44A' },
  purple: { label: t('Morado'), swatch: '#6B3FA0' },
};

export const COLOR_GROUPS = Object.keys(COLOR_GROUP) as ColorGroup[];
