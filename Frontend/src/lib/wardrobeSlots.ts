import type { GarmentCategory } from '../api/types';
import type { IconName } from '../components/Icon';
import { t } from '../i18n';

/** Huecos del vestidor: cómo se agrupan las prendas para elegirlas. */
export type SlotId = 'top' | 'outer' | 'bottom' | 'full' | 'shoes' | 'head' | 'acc';

export interface Slot {
  id: SlotId;
  label: string;
  short: string;
  icon: IconName;
}

export const SLOTS: Slot[] = [
  { id: 'head', label: t('Gorras y gorros'), short: t('Cabeza'), icon: 'cap' },
  { id: 'top', label: t('Camisetas y sudaderas'), short: t('Arriba'), icon: 'tshirt' },
  { id: 'outer', label: t('Chaquetas y abrigos'), short: t('Capa'), icon: 'jacket' },
  { id: 'full', label: t('Vestidos y monos'), short: t('Vestido'), icon: 'dress' },
  { id: 'bottom', label: t('Pantalones y shorts'), short: t('Abajo'), icon: 'pants' },
  { id: 'shoes', label: t('Zapatillas y calzado'), short: t('Pies'), icon: 'shoe' },
  { id: 'acc', label: t('Bolsos y complementos'), short: t('Extras'), icon: 'bag' },
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
