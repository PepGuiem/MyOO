import type { GarmentCategory } from '../api/types';
import type { IconName } from '../components/Icon';

/** Huecos del vestidor: cómo se agrupan las prendas para elegirlas. */
export type SlotId = 'top' | 'outer' | 'bottom' | 'full' | 'shoes' | 'head' | 'acc';

export interface Slot {
  id: SlotId;
  label: string;
  short: string;
  icon: IconName;
}

export const SLOTS: Slot[] = [
  { id: 'head', label: 'Gorras y gorros', short: 'Cabeza', icon: 'cap' },
  { id: 'top', label: 'Camisetas y sudaderas', short: 'Arriba', icon: 'tshirt' },
  { id: 'outer', label: 'Chaquetas y abrigos', short: 'Capa', icon: 'jacket' },
  { id: 'full', label: 'Vestidos y monos', short: 'Vestido', icon: 'dress' },
  { id: 'bottom', label: 'Pantalones y shorts', short: 'Abajo', icon: 'pants' },
  { id: 'shoes', label: 'Zapatillas y calzado', short: 'Pies', icon: 'shoe' },
  { id: 'acc', label: 'Bolsos y complementos', short: 'Extras', icon: 'bag' },
];

const HEAD_KEYS = new Set(['cap', 'beanie', 'hat', 'bucket']);

const BY_CATEGORY: Record<GarmentCategory, SlotId> = {
  TOP: 'top',
  OUTERWEAR: 'outer',
  BOTTOM: 'bottom',
  FULL_BODY: 'full',
  FOOTWEAR: 'shoes',
  ACCESSORY: 'acc',
};

export function slotOf(item: { garmentType: { category: GarmentCategory; modelKey?: string | null } }): SlotId {
  const { category, modelKey } = item.garmentType;
  if (category === 'ACCESSORY' && modelKey && HEAD_KEYS.has(modelKey)) return 'head';
  return BY_CATEGORY[category] ?? 'acc';
}

export const SLOT_BY_ID = Object.fromEntries(SLOTS.map((s) => [s.id, s])) as Record<SlotId, Slot>;
