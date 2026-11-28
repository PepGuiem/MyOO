import type { Attributes, GarmentCategory, GarmentLike, LimitedResource, UsageEntry } from '../api/types';
import { t } from '../i18n';

/**
 * MODO DEMO (/demo): armario de ejemplo que vive SOLO en el navegador.
 *
 * Son prendas de la biblioteca de modelos 3D (ver three/libraryCatalog.ts)
 * con un color de partida; quien prueba la web sin cuenta elige prendas,
 * cambia colores y las ve en el maniquí sin tocar el backend. Al pulsar
 * «Guardar este outfit» la selección se deja en `sessionStorage` y, ya con
 * sesión, components/demo/DemoImportOffer.tsx ofrece crearla en la cuenta con
 * la API normal (prendas en un armario + outfit), que aplica los límites del plan.
 *
 * Sin three.js: este archivo también lo usa el menú (Layout) y no debe
 * arrastrar el motor 3D.
 */

export interface DemoGarment {
  /** Identificador estable dentro de la demo (también en sessionStorage). */
  id: string;
  name: string;
  modelKey: string;
  category: GarmentCategory;
  /** Atributos válidos según el catálogo del backend (prisma/garment-catalog.ts). */
  attributes: Attributes;
  /** Color con el que aparece la prenda. */
  color: string;
}

/**
 * Prendas del armario de ejemplo, agrupadas por hueco al pintarlas. Cada una
 * tiene modelo en la biblioteca 3D con estos atributos (ver `libraryModel`):
 * si se añade otra, comprobar que no cae en el modelo generado por código.
 */
export const DEMO_GARMENTS: DemoGarment[] = [
  // Cabeza
  { id: 'cap', name: t('Gorra de béisbol'), modelKey: 'cap', category: 'ACCESSORY', attributes: { style: 'baseball' }, color: '#202022' },
  { id: 'beanie', name: t('Gorro de punto'), modelKey: 'beanie', category: 'ACCESSORY', attributes: { knit: 'fine' }, color: '#4A4A50' },
  { id: 'bucket', name: t('Gorro de pescador'), modelKey: 'cap', category: 'ACCESSORY', attributes: { style: 'bucket' }, color: '#E8E0D0' },
  // Arriba
  { id: 'tee', name: t('Camiseta clásica'), modelKey: 'tshirt', category: 'TOP', attributes: { fit: 'regular', sleeve: 'short', neckline: 'crew' }, color: '#F2F2F2' },
  { id: 'tee-oversized', name: t('Camiseta oversize'), modelKey: 'tshirt', category: 'TOP', attributes: { fit: 'oversized', sleeve: 'short', neckline: 'crew' }, color: '#151517' },
  { id: 'tee-long', name: t('Camiseta de manga larga'), modelKey: 'tshirt', category: 'TOP', attributes: { fit: 'regular', sleeve: 'long', neckline: 'crew' }, color: '#8C8C8C' },
  { id: 'hoodie', name: t('Sudadera con capucha'), modelKey: 'sweater', category: 'TOP', attributes: { fit: 'regular', neckline: 'hoodie', material: 'Algodón' }, color: '#2E2E33' },
  { id: 'oxford', name: t('Camisa oxford'), modelKey: 'shirt', category: 'TOP', attributes: { fit: 'regular', sleeve: 'long', collar: 'button_down' }, color: '#8FA6C1' },
  { id: 'turtleneck', name: t('Jersey de cuello alto'), modelKey: 'sweater', category: 'TOP', attributes: { fit: 'regular', neckline: 'turtleneck', knit: 'fine' }, color: '#3B2F2A' },
  // Capa
  { id: 'bomber', name: t('Bomber'), modelKey: 'jacket', category: 'OUTERWEAR', attributes: { style: 'bomber', fit: 'regular' }, color: '#5F6B52' },
  { id: 'denim-jacket', name: t('Cazadora vaquera'), modelKey: 'jacket', category: 'OUTERWEAR', attributes: { style: 'denim', fit: 'regular' }, color: '#2B3445' },
  { id: 'puffer', name: t('Plumífero corto'), modelKey: 'jacket', category: 'OUTERWEAR', attributes: { style: 'puffer', fit: 'regular' }, color: '#151517' },
  { id: 'trench', name: t('Gabardina'), modelKey: 'coat', category: 'OUTERWEAR', attributes: { style: 'trench', fit: 'regular' }, color: '#C9A15A' },
  // Abajo
  { id: 'jeans', name: t('Vaquero recto'), modelKey: 'pants', category: 'BOTTOM', attributes: { fit: 'straight', material: 'Denim' }, color: '#2B3445' },
  { id: 'jeans-baggy', name: t('Vaquero baggy'), modelKey: 'pants', category: 'BOTTOM', attributes: { fit: 'baggy', material: 'Denim' }, color: '#4A4A50' },
  { id: 'chino', name: t('Chino slim'), modelKey: 'pants', category: 'BOTTOM', attributes: { fit: 'slim', material: 'Algodón' }, color: '#E8E0D0' },
  // Pies
  { id: 'court', name: t('Zapatillas de pista'), modelKey: 'sneakers', category: 'FOOTWEAR', attributes: { style: 'court' }, color: '#F2F2F2' },
  { id: 'high-top', name: t('Zapatillas de caña alta'), modelKey: 'sneakers', category: 'FOOTWEAR', attributes: { style: 'high_top' }, color: '#151517' },
  { id: 'chunky', name: t('Zapatillas chunky'), modelKey: 'sneakers', category: 'FOOTWEAR', attributes: { style: 'chunky' }, color: '#8C8C8C' },
  { id: 'chelsea', name: t('Botas chelsea'), modelKey: 'boots', category: 'FOOTWEAR', attributes: { style: 'chelsea', shaft: 'ankle' }, color: '#3B2F2A' },
  // Extras
  { id: 'scarf', name: t('Bufanda'), modelKey: 'scarf', category: 'ACCESSORY', attributes: { knit: 'chunky' }, color: '#8C3B3B' },
];

export const DEMO_BY_ID = new Map(DEMO_GARMENTS.map((g) => [g.id, g]));

/** Prenda elegida en la demo: cuál y de qué color. */
export interface DemoPick {
  id: string;
  color: string;
}

/** Outfit de partida: el maniquí no aparece desnudo. */
export const DEMO_START: DemoPick[] = [
  { id: 'tee', color: '#F2F2F2' },
  { id: 'jeans', color: '#2B3445' },
  { id: 'court', color: '#F2F2F2' },
];

/** Máximo de prendas a la vez en la demo (el vestidor real admite 20). */
export const DEMO_MAX_ITEMS = 8;

/** Como lo pinta el maniquí (OutfitStage). */
export function demoGarmentLike(pick: DemoPick): GarmentLike | null {
  const g = DEMO_BY_ID.get(pick.id);
  if (!g) return null;
  return { color: pick.color, attributes: g.attributes, garmentType: { modelKey: g.modelKey, category: g.category } };
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Limpia lo leído de sessionStorage (lo puede tocar cualquiera desde la
 * consola): solo prendas de la demo, sin repetir, con color válido y como
 * mucho DEMO_MAX_ITEMS. De todos modos el backend vuelve a validarlo todo.
 */
export function sanitizePicks(value: unknown): DemoPick[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: DemoPick[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const { id, color } = raw as { id?: unknown; color?: unknown };
    if (typeof id !== 'string' || !DEMO_BY_ID.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, color: typeof color === 'string' && HEX.test(color) ? color.toUpperCase() : DEMO_BY_ID.get(id)!.color });
    if (out.length >= DEMO_MAX_ITEMS) break;
  }
  return out;
}

// --- sessionStorage (envuelto en try/catch: en modo privado puede fallar) ---

/** Lo que se está montando en /demo (para no perderlo al ir y volver del registro). */
const DRAFT_KEY = 'myout.demo.draft';
/** Lo que se pidió guardar: se ofrece crearlo en la cuenta al entrar. */
const PENDING_KEY = 'myout.demo.pending';

function read(key: string): DemoPick[] | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return sanitizePicks(JSON.parse(raw));
  } catch {
    return null;
  }
}

function write(key: string, picks: DemoPick[] | null): void {
  try {
    if (picks && picks.length) sessionStorage.setItem(key, JSON.stringify(picks));
    else sessionStorage.removeItem(key);
  } catch {
    // Sin almacenamiento: la demo sigue funcionando en memoria.
  }
}

export const demoDraft = {
  read: (): DemoPick[] | null => read(DRAFT_KEY),
  write: (picks: DemoPick[]): void => write(DRAFT_KEY, picks),
};

export const demoPending = {
  read: (): DemoPick[] | null => {
    const picks = read(PENDING_KEY);
    return picks && picks.length ? picks : null;
  },
  write: (picks: DemoPick[]): void => write(PENDING_KEY, picks),
  /** «Ahora no»: no se vuelve a ofrecer, pero el borrador sigue en /demo. */
  dismiss: (): void => write(PENDING_KEY, null),
  /** Ya creado en la cuenta: se borra también el borrador de la demo. */
  clear: (): void => {
    write(PENDING_KEY, null);
    write(DRAFT_KEY, null);
  },
};

/** Lo que falta en el plan para crear el outfit de la demo (o null si cabe). */
export function demoPlanShortage(usage: UsageEntry[], needed: { items: number; wardrobes: number }): string | null {
  const free = (resource: LimitedResource): number => {
    const u = usage.find((x) => x.resource === resource);
    // Sin dato: decide el backend (que comprueba el límite igualmente).
    if (!u || u.isUnlimited || u.max === null) return Infinity;
    return Math.max(0, u.max - u.used);
  };
  if (needed.wardrobes > 0 && free('WARDROBES') < needed.wardrobes) return t('Has llegado al máximo de armarios de tu plan.');
  const items = free('WARDROBE_ITEMS');
  if (items < needed.items) return t('Tu plan solo deja añadir {n} prendas más y este outfit lleva {needed}.', { n: items, needed: needed.items });
  if (free('OUTFITS') < 1) return t('Has llegado al máximo de outfits de tu plan.');
  return null;
}
