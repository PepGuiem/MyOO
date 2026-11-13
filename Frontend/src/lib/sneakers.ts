import type { Sneaker, SneakerBrand, SneakerCondition } from '../api/types';
import type { IconName } from '../components/Icon';

/**
 * SNEAKER COLLECTION: marcas y estados. Las marcas son solo etiquetas de
 * texto (no se dibujan logotipos). El estado lleva siempre su nombre, no
 * solo un color.
 */
export const SNEAKER_BRANDS: SneakerBrand[] = ['NIKE', 'JORDAN', 'ADIDAS', 'NEW_BALANCE', 'ASICS', 'PUMA', 'SALOMON', 'CONVERSE', 'VANS', 'OTHER'];

export const BRAND_LABEL: Record<SneakerBrand, string> = {
  NIKE: 'Nike',
  JORDAN: 'Jordan',
  ADIDAS: 'Adidas',
  NEW_BALANCE: 'New Balance',
  ASICS: 'ASICS',
  PUMA: 'Puma',
  SALOMON: 'Salomon',
  CONVERSE: 'Converse',
  VANS: 'Vans',
  OTHER: 'Otras',
};

export const SNEAKER_CONDITIONS: SneakerCondition[] = ['DEADSTOCK', 'LIKE_NEW', 'GOOD', 'WORN', 'BEAT'];

export const CONDITION: Record<SneakerCondition, { label: string; short: string; hint: string; level: number }> = {
  DEADSTOCK: { label: 'Sin estrenar (DS)', short: 'DS', hint: 'Nuevas, sin usar.', level: 5 },
  LIKE_NEW: { label: 'Como nuevas', short: 'Como nuevas', hint: 'Usadas muy poco, sin marcas.', level: 4 },
  GOOD: { label: 'Buen estado', short: 'Buen estado', hint: 'Uso normal, bien cuidadas.', level: 3 },
  WORN: { label: 'Usadas', short: 'Usadas', hint: 'Se nota el uso: arrugas, suela gastada.', level: 2 },
  BEAT: { label: 'Muy gastadas', short: 'Gastadas', hint: 'Para el día a día o la lluvia.', level: 1 },
};

export type SneakerSort = 'new' | 'brand' | 'model' | 'most' | 'least';
export const SNEAKER_SORTS: { id: SneakerSort; label: string }[] = [
  { id: 'new', label: 'Recientes' },
  { id: 'brand', label: 'Marca' },
  { id: 'model', label: 'Modelo' },
  { id: 'most', label: 'Más usadas' },
  { id: 'least', label: 'Menos usadas' },
];

export function sortSneakers(list: Sneaker[], sort: SneakerSort): Sneaker[] {
  const c = [...list];
  const by = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });
  if (sort === 'brand') return c.sort((a, b) => by(a.sneaker.brandLabel, b.sneaker.brandLabel) || by(a.sneaker.model, b.sneaker.model));
  if (sort === 'model') return c.sort((a, b) => by(a.sneaker.model, b.sneaker.model));
  if (sort === 'most') return c.sort((a, b) => b.uses.total - a.uses.total || by(a.sneaker.model, b.sneaker.model));
  if (sort === 'least') return c.sort((a, b) => a.uses.total - b.uses.total || a.createdAt.localeCompare(b.createdAt));
  return c.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const CONDITION_ICON: IconName = 'gem';

/** Tallas en orden natural («38,5» antes de «40», «M» al final). */
export function sortSizes(sizes: string[]): string[] {
  const n = (s: string) => Number(s.replace(',', '.').replace(/[^0-9.]/g, ''));
  return [...new Set(sizes)].sort((a, b) => {
    const na = n(a);
    const nb = n(b);
    if (Number.isFinite(na) && Number.isFinite(nb) && na && nb) return na - nb;
    return a.localeCompare(b, 'es');
  });
}

/** «Nike», o el nombre escrito si la marca es «Otras». */
export function brandOf(card: { brand: SneakerBrand; brandName: string | null }): string {
  return card.brand === 'OTHER' ? card.brandName || BRAND_LABEL.OTHER : BRAND_LABEL[card.brand];
}
