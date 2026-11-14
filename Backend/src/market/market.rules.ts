/**
 * STREET MARKET: reglas puras (sin base de datos), probadas en
 * market.rules.spec.ts.
 */
export type ListingCategory =
  | 'SNEAKERS'
  | 'HOODIES'
  | 'TSHIRTS'
  | 'PANTS'
  | 'JACKETS'
  | 'ACCESSORIES'
  | 'OTHER';
export type Kind = 'SELL' | 'SWAP';

/** Anuncios activos o reservados que puede tener una persona a la vez. */
export const MAX_OPEN_LISTINGS = 50;
/** Fotos por anuncio. */
export const MAX_PHOTOS = 6;

/**
 * Categoría del market a partir del tipo de prenda del armario. Las
 * zapatillas solo cuentan como «Sneakers» si el tipo es SNEAKERS (unas botas
 * van a «Otros»).
 */
export function categoryForGarment(
  code: string | null | undefined,
  category: string | null | undefined,
): ListingCategory {
  switch (code) {
    case 'SNEAKERS':
      return 'SNEAKERS';
    case 'SWEATER':
      return 'HOODIES';
    case 'T_SHIRT':
    case 'SHIRT':
      return 'TSHIRTS';
    case 'PANTS':
    case 'SHORTS':
      return 'PANTS';
    case 'JACKET':
    case 'COAT':
      return 'JACKETS';
  }
  if (category === 'OUTERWEAR') return 'JACKETS';
  if (category === 'ACCESSORY') return 'ACCESSORIES';
  return 'OTHER';
}

export type ListingProblem =
  'price_required' | 'too_many_photos' | 'duplicate_photos' | null;

/** Comprueba lo que no se puede expresar con validaciones de un solo campo. */
export function listingProblem(l: {
  kind: Kind;
  price: number | null;
  photoIds?: string[];
}): ListingProblem {
  if (l.kind === 'SELL' && l.price === null) return 'price_required';
  if (l.photoIds) {
    if (l.photoIds.length > MAX_PHOTOS) return 'too_many_photos';
    if (new Set(l.photoIds).size !== l.photoIds.length)
      return 'duplicate_photos';
  }
  return null;
}

/**
 * Primer mensaje al contactar desde un anuncio: deja claro de qué anuncio se
 * habla (con su enlace interno) y añade lo que escriba quien compra.
 */
export function contactMessage(
  listing: { id: string; title: string; kind: Kind },
  text?: string | null,
): string {
  const what = listing.kind === 'SWAP' ? 'tu intercambio' : 'tu anuncio';
  const head = `Street Market · Me interesa ${what} «${listing.title}» (/market/${listing.id})`;
  const body = text?.trim();
  return body ? `${head}\n\n${body}` : `${head}\n\n¿Sigue disponible?`;
}
