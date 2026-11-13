import type { GarmentCategory, LimitedResource, Season } from '../api/types';

export const CATEGORY_LABEL: Record<GarmentCategory, string> = {
  TOP: 'Parte de arriba',
  BOTTOM: 'Parte de abajo',
  FULL_BODY: 'Vestido',
  OUTERWEAR: 'Abrigo',
  FOOTWEAR: 'Calzado',
  ACCESSORY: 'Accesorio',
};

/** Etiquetas en plural para los filtros. */
export const CATEGORY_FILTERS: { value: GarmentCategory | null; label: string }[] = [
  { value: null, label: 'Todo' },
  { value: 'TOP', label: 'Arriba' },
  { value: 'BOTTOM', label: 'Abajo' },
  { value: 'FULL_BODY', label: 'Vestidos' },
  { value: 'OUTERWEAR', label: 'Abrigos' },
  { value: 'FOOTWEAR', label: 'Calzado' },
  { value: 'ACCESSORY', label: 'Accesorios' },
];

export const SEASON_LABEL: Record<Season, string> = {
  SPRING: 'Primavera',
  SUMMER: 'Verano',
  AUTUMN: 'Otoño',
  WINTER: 'Invierno',
  ALL_SEASON: 'Todo el año',
};

export const SEASONS = Object.keys(SEASON_LABEL) as Season[];

export const RESOURCE_LABEL: Record<LimitedResource, string> = {
  WARDROBES: 'Armarios',
  WARDROBE_ITEMS: 'Prendas',
  OUTFITS: 'Outfits',
  MANNEQUINS: 'Maniquíes',
};

export function formatPrice(cents: number, currency: string): string {
  if (cents === 0) return 'Gratis';
  return `${new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100)} / mes`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(new Date(iso));
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
