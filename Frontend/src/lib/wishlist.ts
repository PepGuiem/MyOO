import type { IconName } from '../components/Icon';
import type { WishlistCategory, WishlistItem, WishlistSort, WishlistStatus } from '../api/types';

/**
 * WISHLIST: textos, iconos y colores de estados y categorías, y formato de
 * precios. El color nunca va solo: cada estado lleva su icono y su nombre.
 */
export const WISH_STATUSES: WishlistStatus[] = ['WANT', 'SAVING', 'PENDING', 'PURCHASED'];

export const WISH_STATUS: Record<WishlistStatus, { label: string; short: string; icon: IconName; color: string; hint: string }> = {
  WANT: { label: 'Lo quiero', short: 'Lo quiero', icon: 'heart', color: '#ff4f8b', hint: 'Te gusta y lo tienes fichado.' },
  SAVING: { label: 'Ahorrando', short: 'Ahorrando', icon: 'wallet', color: '#ffb020', hint: 'Estás juntando el dinero.' },
  PENDING: { label: 'Pendiente de comprar', short: 'Pendiente', icon: 'bag', color: '#3987e5', hint: 'Decidido: solo falta comprarlo.' },
  PURCHASED: { label: 'Comprado', short: 'Comprado', icon: 'check', color: '#c6ff2e', hint: 'Ya es tuyo: pásalo al armario.' },
};

export const WISH_CATEGORIES: WishlistCategory[] = ['SNEAKERS', 'HOODIES', 'TSHIRTS', 'PANTS', 'JACKETS', 'ACCESSORIES', 'OTHER'];

export const WISH_CATEGORY: Record<WishlistCategory, { label: string; icon: IconName; garment: string | null }> = {
  SNEAKERS: { label: 'Sneakers', icon: 'shoe', garment: 'SNEAKERS' },
  HOODIES: { label: 'Sudaderas', icon: 'hoodie', garment: 'SWEATER' },
  TSHIRTS: { label: 'Camisetas', icon: 'tshirt', garment: 'T_SHIRT' },
  PANTS: { label: 'Pantalones', icon: 'pants', garment: 'PANTS' },
  JACKETS: { label: 'Chaquetas', icon: 'jacket', garment: 'JACKET' },
  ACCESSORIES: { label: 'Accesorios', icon: 'cap', garment: 'CAP' },
  OTHER: { label: 'Otros', icon: 'tag', garment: null },
};

export const WISH_SORTS: { id: WishlistSort; label: string }[] = [
  { id: 'new', label: 'Recientes' },
  { id: 'price_asc', label: 'Precio ↑' },
  { id: 'price_desc', label: 'Precio ↓' },
  { id: 'name', label: 'Nombre' },
];

/** Monedas habituales en el selector (se acepta cualquier código ISO de 3 letras). */
export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'MXN'];

export function money(value: number | string | null | undefined, currency: string | null | undefined, opts: { compact?: boolean } = {}): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return '—';
  const cur = currency || 'EUR';
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: opts.compact && Number.isInteger(n) ? 0 : 2,
      minimumFractionDigits: opts.compact && Number.isInteger(n) ? 0 : 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
}

export const num = (v: string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

/** Marca guardada en los atributos de la prenda. */
export function brandOf(item: Pick<WishlistItem, 'attributes'>): string | null {
  const b = (item.attributes as Record<string, unknown> | undefined)?.brand;
  return typeof b === 'string' && b.trim() ? b : null;
}

/** ¿Está el precio actual en el objetivo o por debajo? */
export function atTarget(item: Pick<WishlistItem, 'currentPrice' | 'targetPrice'>): boolean {
  const c = num(item.currentPrice);
  const t = num(item.targetPrice);
  return c !== null && t !== null && c <= t;
}

/** Texto «YYYY-MM-DD» de hoy en la zona del navegador. */
export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Solo el dominio del enlace (para enseñarlo sin la URL entera). */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
