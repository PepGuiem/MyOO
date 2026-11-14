import type { GarmentCategory, LimitedResource, Season } from '../api/types';
import { LOCALE_TAG, t } from '../i18n';

export const CATEGORY_LABEL: Record<GarmentCategory, string> = {
  TOP: t('Parte de arriba'),
  BOTTOM: t('Parte de abajo'),
  FULL_BODY: t('Vestido'),
  OUTERWEAR: t('Abrigo'),
  FOOTWEAR: t('Calzado'),
  ACCESSORY: t('Accesorio'),
};

/** Etiquetas en plural para los filtros. */
export const CATEGORY_FILTERS: { value: GarmentCategory | null; label: string }[] = [
  { value: null, label: t('Todo') },
  { value: 'TOP', label: t('Arriba') },
  { value: 'BOTTOM', label: t('Abajo') },
  { value: 'FULL_BODY', label: t('Vestidos') },
  { value: 'OUTERWEAR', label: t('Abrigos') },
  { value: 'FOOTWEAR', label: t('Calzado') },
  { value: 'ACCESSORY', label: t('Accesorios') },
];

export const SEASON_LABEL: Record<Season, string> = {
  SPRING: t('Primavera'),
  SUMMER: t('Verano'),
  AUTUMN: t('Otoño'),
  WINTER: t('Invierno'),
  ALL_SEASON: t('Todo el año'),
};

export const SEASONS = Object.keys(SEASON_LABEL) as Season[];

export const RESOURCE_LABEL: Record<LimitedResource, string> = {
  WARDROBES: t('Armarios'),
  WARDROBE_ITEMS: t('Prendas'),
  OUTFITS: t('Outfits'),
  MANNEQUINS: t('Maniquíes'),
};

export function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return t('Gratis');
  return `${new Intl.NumberFormat(LOCALE_TAG, { style: 'currency', currency }).format(cents / 100)} / mes`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE_TAG, { dateStyle: 'medium' }).format(new Date(iso));
}

/** «3 prendas» / «3 garments»: las palabras se traducen (van en el diccionario). */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${t(n === 1 ? one : many)}`;
}
