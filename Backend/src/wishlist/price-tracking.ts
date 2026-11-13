/**
 * Seguimiento de precios: preparado para conectar servicios externos más
 * adelante (APIs de tiendas, comparadores...). Hoy NO hay ninguno: no se
 * consulta ninguna web y no se inventan precios ni disponibilidad. Los
 * precios solo los apunta el usuario.
 *
 * Para añadir uno: implementa `PriceTracker`, regístralo en el array del
 * token `PRICE_TRACKERS` (wishlist.module.ts) y programa `refreshTracked`
 * (p. ej. con un cron). Cada precio que traiga se guarda con la fuente
 * TRACKER y, si baja del precio objetivo, avisa en la campanita igual que
 * uno apuntado a mano.
 */
export interface TrackedPrice {
  /** Importe con dos decimales como mucho. */
  price: number;
  /** ISO 4217 («EUR»). */
  currency: string;
  /** Solo si el servicio lo dice; si no, desconocido. */
  available?: boolean;
}

export interface PriceTracker {
  readonly id: string;
  /** ¿Sabe leer esta URL de producto? */
  supports(url: string): boolean;
  /** Precio actual o null si no lo sabe (nunca uno inventado). */
  fetchPrice(url: string): Promise<TrackedPrice | null>;
}

export const PRICE_TRACKERS = Symbol('PRICE_TRACKERS');
