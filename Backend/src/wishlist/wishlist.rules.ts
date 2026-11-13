/**
 * WISHLIST: cuentas del presupuesto y de los precios (funciones puras). El
 * dinero se suma en céntimos enteros para no arrastrar errores de coma flotante.
 * Solo se suman importes de la moneda del presupuesto; los de otras monedas se
 * devuelven aparte (no se convierten: no inventamos tipos de cambio).
 */
export type WishStatus = 'WANT' | 'SAVING' | 'PENDING' | 'PURCHASED';
export type WishCategory =
  | 'SNEAKERS'
  | 'HOODIES'
  | 'TSHIRTS'
  | 'PANTS'
  | 'JACKETS'
  | 'ACCESSORIES'
  | 'OTHER';

export const WISH_STATUSES: WishStatus[] = [
  'WANT',
  'SAVING',
  'PENDING',
  'PURCHASED',
];
export const WISH_CATEGORIES: WishCategory[] = [
  'SNEAKERS',
  'HOODIES',
  'TSHIRTS',
  'PANTS',
  'JACKETS',
  'ACCESSORIES',
  'OTHER',
];

/** Tipo de prenda (código del catálogo) con el que se dibuja en 3D si no eliges otro. */
export const CATEGORY_GARMENT: Record<WishCategory, string | null> = {
  SNEAKERS: 'SNEAKERS',
  HOODIES: 'SWEATER',
  TSHIRTS: 'T_SHIRT',
  PANTS: 'PANTS',
  JACKETS: 'JACKET',
  ACCESSORIES: 'CAP',
  OTHER: null,
};

/** Importe (Decimal de Prisma, texto o número) a céntimos. */
export function toCents(
  v: { toString(): string } | number | string | null | undefined,
): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(typeof v === 'number' ? v : v.toString());
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const fromCents = (c: number) => Math.round(c) / 100;

export interface BudgetItem {
  status: WishStatus;
  category: WishCategory | null;
  currentPrice: number | null; // céntimos
  purchasePrice: number | null; // céntimos
  currency: string | null;
}

export interface MovedItem {
  purchasePrice: number | null; // céntimos
  currency: string | null;
}

export interface BudgetSettings {
  budget: number | null; // céntimos
  saved: number; // céntimos
  currency: string;
}

export function computeBudget(
  items: BudgetItem[],
  moved: MovedItem[],
  settings: BudgetSettings,
) {
  const cur = settings.currency;
  const pending = items.filter((i) => i.status !== 'PURCHASED');
  const purchasedHere = items.filter((i) => i.status === 'PURCHASED');
  const same = (c: string | null) => (c ?? cur) === cur;

  const totalValue = pending
    .filter((i) => i.currentPrice !== null && same(i.currency))
    .reduce((a, i) => a + i.currentPrice!, 0);
  const spent =
    purchasedHere
      .filter((i) => same(i.currency))
      .reduce((a, i) => a + (i.purchasePrice ?? i.currentPrice ?? 0), 0) +
    moved
      .filter((m) => m.purchasePrice !== null && same(m.currency))
      .reduce((a, m) => a + m.purchasePrice!, 0);

  const others = new Map<string, { total: number; count: number }>();
  for (const i of pending) {
    if (i.currentPrice === null || same(i.currency)) continue;
    const e = others.get(i.currency!) ?? { total: 0, count: 0 };
    e.total += i.currentPrice;
    e.count++;
    others.set(i.currency!, e);
  }

  const byStatus = Object.fromEntries(
    WISH_STATUSES.map((s) => [s, items.filter((i) => i.status === s).length]),
  ) as Record<WishStatus, number>;
  const byCategory = Object.fromEntries(
    WISH_CATEGORIES.map((c) => [
      c,
      items.filter((i) => (i.category ?? 'OTHER') === c).length,
    ]),
  ) as Record<WishCategory, number>;
  const remaining =
    settings.budget === null
      ? null
      : Math.max(0, settings.budget - settings.saved);

  return {
    currency: cur,
    counts: {
      total: items.length,
      pending: pending.length,
      purchased: purchasedHere.length + moved.length,
      purchasedInList: purchasedHere.length,
      movedToWardrobe: moved.length,
      unpriced: pending.filter((i) => i.currentPrice === null).length,
      byStatus,
      byCategory,
    },
    money: {
      /** Valor de lo pendiente (con precio) en la moneda del presupuesto. */
      totalValue: fromCents(totalValue),
      /** Lo que ya has gastado en artículos de la wishlist. */
      spent: fromCents(spent),
      budget: settings.budget === null ? null : fromCents(settings.budget),
      saved: fromCents(settings.saved),
      /** Lo que te falta para llegar al presupuesto objetivo. */
      remaining: remaining === null ? null : fromCents(remaining),
      /** Lo que te falta (sobre lo ahorrado) para comprar todo lo pendiente. */
      shortfall: fromCents(Math.max(0, totalValue - settings.saved)),
      /** % del presupuesto objetivo que ya tienes ahorrado. */
      progress: settings.budget
        ? Math.min(
            100,
            Math.round((settings.saved / settings.budget) * 1000) / 10,
          )
        : null,
      /** % de lo pendiente que podrías pagar ya con lo ahorrado. */
      coverage: totalValue
        ? Math.min(100, Math.round((settings.saved / totalValue) * 1000) / 10)
        : null,
      otherCurrencies: [...others.entries()].map(([currency, e]) => ({
        currency,
        total: fromCents(e.total),
        count: e.count,
      })),
    },
  };
}

export interface PricePoint {
  price: number; // céntimos
  recordedAt: Date;
}

/** Cómo ha cambiado el precio: el último frente al anterior, y el más bajo visto. */
export function priceTrend(points: PricePoint[]) {
  if (!points.length) return null;
  const sorted = [...points].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const lowest = Math.min(...sorted.map((p) => p.price));
  const highest = Math.max(...sorted.map((p) => p.price));
  const diff = prev ? last.price - prev.price : 0;
  return {
    direction:
      !prev || diff === 0
        ? ('same' as const)
        : diff < 0
          ? ('down' as const)
          : ('up' as const),
    diff: fromCents(diff),
    pct: prev && prev.price ? Math.round((diff / prev.price) * 1000) / 10 : 0,
    lowest: fromCents(lowest),
    highest: fromCents(highest),
    isLowest: last.price === lowest && sorted.length > 1,
    points: sorted.length,
  };
}

/** ¿Este precio cruza hacia abajo el precio objetivo? (para avisar una sola vez). */
export function crossesTarget(
  previous: number | null,
  next: number,
  target: number | null,
): boolean {
  if (target === null) return false;
  return next <= target && (previous === null || previous > target);
}
