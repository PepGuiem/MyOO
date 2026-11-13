/**
 * Vocabulario del estilista (mismas claves que Backend/src/stylist/vocabulary.ts).
 */
export const STYLE_TAGS: { value: string; label: string }[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'streetwear', label: 'Streetwear' },
  { value: 'minimalist', label: 'Minimalista' },
  { value: 'old_money', label: 'Old money' },
  { value: 'formal', label: 'Formal' },
  { value: 'sporty', label: 'Deportivo' },
  { value: 'vintage', label: 'Vintage' },
  { value: 'elegant', label: 'Elegante' },
  { value: 'y2k', label: 'Y2K' },
  { value: 'smart_casual', label: 'Smart casual' },
];
export const MAX_STYLES_PER_ITEM = 4;

export const OCCASIONS: { value: string; label: string }[] = [
  { value: 'everyday', label: 'Día a día' },
  { value: 'work', label: 'Trabajo' },
  { value: 'university', label: 'Universidad' },
  { value: 'date', label: 'Cita' },
  { value: 'party', label: 'Fiesta' },
  { value: 'vacation', label: 'Vacaciones' },
  { value: 'sport', label: 'Deporte' },
  { value: 'formal_event', label: 'Evento formal' },
];

export const WEATHER: { value: string; label: string; short: string }[] = [
  { value: 'cold', label: 'Frío (menos de 10 °C)', short: 'Frío' },
  { value: 'cool', label: 'Fresco (10–17 °C)', short: 'Fresco' },
  { value: 'mild', label: 'Templado (17–24 °C)', short: 'Templado' },
  { value: 'hot', label: 'Calor (más de 24 °C)', short: 'Calor' },
];

export const PURCHASE_PLATFORMS: { value: string; label: string }[] = [
  { value: 'store', label: 'Tienda física' },
  { value: 'online', label: 'Tienda online' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'second_hand', label: 'Segunda mano' },
  { value: 'gift', label: 'Regalo' },
  { value: 'other', label: 'Otro' },
];

export const labelOf = (list: { value: string; label: string }[], value: string | null | undefined) =>
  list.find((x) => x.value === value)?.label ?? value ?? '';

/** Solo enlaces http(s): nunca se pinta un javascript: o similar aunque llegara de la API. */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export function formatMoney(amount: string | number | null, currency: string | null): string | null {
  if (amount === null || amount === '') return null;
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: currency || 'EUR' }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency ?? ''}`.trim();
  }
}

/** Dominio de un enlace, para mostrarlo sin la URL entera ("nike.com"). */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
