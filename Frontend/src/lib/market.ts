import type { ListingCondition, ListingKind, ListingStatus, MarketSort } from '../api/types';
import type { IconName } from '../components/Icon';

/** STREET MARKET: textos de tipos, estados y estado de la prenda. */
export const LISTING_KIND: Record<ListingKind, { label: string; short: string; icon: IconName }> = {
  SELL: { label: 'Venta', short: 'Vendo', icon: 'tag' },
  SWAP: { label: 'Intercambio', short: 'Cambio', icon: 'swap' },
};

export const LISTING_STATUS: Record<ListingStatus, { label: string; hint: string }> = {
  ACTIVE: { label: 'Disponible', hint: 'Se ve en el market y te pueden escribir.' },
  RESERVED: { label: 'Reservado', hint: 'Apalabrado con alguien: sigue visible pero marcado.' },
  SOLD: { label: 'Vendido', hint: 'Ya no sale en el market ni te pueden escribir por él.' },
};

export const LISTING_CONDITIONS: ListingCondition[] = ['NEW_WITH_TAGS', 'LIKE_NEW', 'GOOD', 'FAIR'];

export const LISTING_CONDITION: Record<ListingCondition, { label: string; dots: number }> = {
  NEW_WITH_TAGS: { label: 'Nuevo con etiqueta', dots: 4 },
  LIKE_NEW: { label: 'Como nuevo', dots: 3 },
  GOOD: { label: 'Buen estado', dots: 2 },
  FAIR: { label: 'Con uso', dots: 1 },
};

export const MARKET_SORTS: { id: MarketSort; label: string }[] = [
  { id: 'new', label: 'Recientes' },
  { id: 'price_asc', label: 'Precio ↑' },
  { id: 'price_desc', label: 'Precio ↓' },
];

/** Texto de un error de la API del market (por su `code`). */
export const MARKET_ERRORS: Record<string, string> = {
  price_required: 'Para vender hace falta un precio.',
  too_many_photos: 'Como mucho 6 fotos por anuncio.',
  duplicate_photos: 'Hay una foto repetida.',
  too_many_listings: 'Has llegado al límite de anuncios abiertos. Marca alguno como vendido o bórralo.',
  wishlist_item: 'No puedes vender algo de tu wishlist.',
  wait_reply: 'Ya le escribiste: espera a que te conteste en Mensajes.',
  cannot_message: 'Esta persona no acepta mensajes ahora mismo.',
  sold: 'Este anuncio ya está vendido.',
  own_listing: 'Es tu propio anuncio.',
};
