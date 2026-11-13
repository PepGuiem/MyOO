import { colorName } from '../stylist/engine';

/**
 * SNEAKER COLLECTION: reglas puras (sin base de datos), fáciles de probar:
 * nombres de marca, detección de pares duplicados, usos y estadísticas.
 */
export type SneakerBrandKey =
  | 'NIKE'
  | 'JORDAN'
  | 'ADIDAS'
  | 'NEW_BALANCE'
  | 'ASICS'
  | 'PUMA'
  | 'SALOMON'
  | 'CONVERSE'
  | 'VANS'
  | 'OTHER';
export type SneakerConditionKey =
  'DEADSTOCK' | 'LIKE_NEW' | 'GOOD' | 'WORN' | 'BEAT';

export const SNEAKER_BRANDS: SneakerBrandKey[] = [
  'NIKE',
  'JORDAN',
  'ADIDAS',
  'NEW_BALANCE',
  'ASICS',
  'PUMA',
  'SALOMON',
  'CONVERSE',
  'VANS',
  'OTHER',
];

/** Nombre que se enseña (solo texto: no se dibujan logotipos). */
export const BRAND_LABEL: Record<SneakerBrandKey, string> = {
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

export function brandLabel(
  brand: SneakerBrandKey,
  brandName?: string | null,
): string {
  return brand === 'OTHER'
    ? brandName?.trim() || BRAND_LABEL.OTHER
    : BRAND_LABEL[brand];
}

/** «Air Max 1 '86» y «air max 1 86» son lo mismo: minúsculas, sin acentos ni signos. */
export function normalize(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface SneakerIdentity {
  brand: SneakerBrandKey;
  brandName?: string | null;
  model: string;
  colorway?: string | null;
  size?: string | null;
}

/** Mismo par: misma marca, modelo, colorway y talla (sin fijarse en mayúsculas, acentos o signos). */
export function sameSneaker(a: SneakerIdentity, b: SneakerIdentity): boolean {
  if (a.brand !== b.brand) return false;
  if (a.brand === 'OTHER' && normalize(a.brandName) !== normalize(b.brandName))
    return false;
  return (
    normalize(a.model) === normalize(b.model) &&
    normalize(a.colorway) === normalize(b.colorway) &&
    normalize(a.size).replace(/ /g, '') === normalize(b.size).replace(/ /g, '')
  );
}

export interface UsageInput {
  /** Outfits guardados con las prendas que llevan. */
  outfits: { id: string; itemIds: string[] }[];
  /** Días del calendario marcados como usados (fecha «YYYY-MM-DD»). */
  worn: { outfitId: string; date: string }[];
}

export interface Usage {
  /** Días distintos del calendario en los que se llevó (con un outfit marcado como usado). */
  calendar: number;
  /** Outfits guardados en los que sale. */
  outfits: number;
  /** Prendas distintas con las que se ha combinado en esos outfits. */
  partners: number;
}

/** Usos del calendario, outfits y compañeras de cada prenda pedida. */
export function usageOf(
  itemIds: string[],
  { outfits, worn }: UsageInput,
): Map<string, Usage> {
  const wanted = new Set(itemIds);
  const out = new Map<string, Usage>();
  const days = new Map<string, Set<string>>();
  const partners = new Map<string, Set<string>>();
  const outfitItems = new Map(outfits.map((o) => [o.id, o.itemIds]));
  for (const id of wanted) {
    out.set(id, { calendar: 0, outfits: 0, partners: 0 });
    days.set(id, new Set());
    partners.set(id, new Set());
  }
  for (const o of outfits) {
    const ids = new Set(o.itemIds);
    for (const id of ids) {
      if (!wanted.has(id)) continue;
      out.get(id)!.outfits++;
      for (const other of ids) if (other !== id) partners.get(id)!.add(other);
    }
  }
  for (const w of worn) {
    for (const id of new Set(outfitItems.get(w.outfitId) ?? []))
      if (wanted.has(id)) days.get(id)!.add(w.date);
  }
  for (const id of wanted) {
    const u = out.get(id)!;
    u.calendar = days.get(id)!.size;
    u.partners = partners.get(id)!.size;
  }
  return out;
}

export interface StatSneaker extends SneakerIdentity {
  id: string;
  name: string;
  color: string;
  condition: SneakerConditionKey;
  /** Usos apuntados a mano. */
  wearCount: number;
  /** En céntimos. */
  purchasePrice: number | null;
  currency: string | null;
  createdAt: Date;
}

const pct = (n: number, total: number) =>
  total ? Math.round((n / total) * 1000) / 10 : 0;

/** Dashboard de la colección. Todo sale de los datos del usuario; sin datos, null o listas vacías. */
export function sneakerStats(
  sneakers: StatSneaker[],
  usage: UsageInput,
  wish: { count: number; value: { currency: string; total: number }[] },
) {
  const total = sneakers.length;
  const use = usageOf(
    sneakers.map((s) => s.id),
    usage,
  );
  const usesOf = (s: StatSneaker) =>
    s.wearCount + (use.get(s.id)?.calendar ?? 0);

  // Marcas
  const brandCount = new Map<
    string,
    { brand: SneakerBrandKey; label: string; count: number }
  >();
  for (const s of sneakers) {
    const key =
      s.brand === 'OTHER' ? `OTHER:${normalize(s.brandName) || '-'}` : s.brand;
    const e = brandCount.get(key) ?? {
      brand: s.brand,
      label: brandLabel(s.brand, s.brandName),
      count: 0,
    };
    e.count++;
    brandCount.set(key, e);
  }
  const brands = [...brandCount.values()]
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
    .map((b) => ({ ...b, share: pct(b.count, total) }));
  // Reparto por las categorías de marca (las «Otras» juntas).
  const byBrand = SNEAKER_BRANDS.map((b) => {
    const count = sneakers.filter((s) => s.brand === b).length;
    return { brand: b, label: BRAND_LABEL[b], count, share: pct(count, total) };
  })
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count);

  // Colores (por nombre, con el tono más repetido de ese nombre)
  const colorCount = new Map<
    string,
    { name: string; count: number; hexes: Map<string, number> }
  >();
  for (const s of sneakers) {
    const name = colorName(s.color);
    const e = colorCount.get(name) ?? { name, count: 0, hexes: new Map() };
    e.count++;
    e.hexes.set(
      s.color.toUpperCase(),
      (e.hexes.get(s.color.toUpperCase()) ?? 0) + 1,
    );
    colorCount.set(name, e);
  }
  const colors = [...colorCount.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'))
    .map((c) => ({
      name: c.name,
      hex: [...c.hexes.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: c.count,
      share: pct(c.count, total),
    }));

  // Dinero (cada moneda por separado: no se convierte)
  const money = new Map<
    string,
    { currency: string; total: number; count: number }
  >();
  for (const s of sneakers) {
    if (s.purchasePrice === null) continue;
    const cur = s.currency ?? 'EUR';
    const e = money.get(cur) ?? { currency: cur, total: 0, count: 0 };
    e.total += s.purchasePrice;
    e.count++;
    money.set(cur, e);
  }
  const spent = [...money.values()]
    .sort((a, b) => b.count - a.count)
    .map((m) => ({ ...m, total: m.total / 100 }));

  // Modelo más utilizado (suma los usos de todos los pares de ese modelo)
  const models = new Map<
    string,
    {
      brand: SneakerBrandKey;
      label: string;
      model: string;
      uses: number;
      pairs: number;
    }
  >();
  for (const s of sneakers) {
    const key = `${s.brand}|${normalize(s.brandName)}|${normalize(s.model)}`;
    const e = models.get(key) ?? {
      brand: s.brand,
      label: brandLabel(s.brand, s.brandName),
      model: s.model,
      uses: 0,
      pairs: 0,
    };
    e.uses += usesOf(s);
    e.pairs++;
    models.set(key, e);
  }
  const topModel = [...models.values()].sort(
    (a, b) => b.uses - a.uses || b.pairs - a.pairs,
  )[0];

  const ranked = sneakers.map((s) => ({
    id: s.id,
    name: s.name,
    label: brandLabel(s.brand, s.brandName),
    model: s.model,
    colorway: s.colorway ?? null,
    color: s.color,
    uses: usesOf(s),
    manual: s.wearCount,
    calendar: use.get(s.id)?.calendar ?? 0,
    outfits: use.get(s.id)?.outfits ?? 0,
    partners: use.get(s.id)?.partners ?? 0,
    createdAt: s.createdAt,
  }));
  // Menos usada: la de menos usos (a igualdad, la que llevas más tiempo sin estrenar).
  const leastUsed = total
    ? [...ranked].sort(
        (a, b) =>
          a.uses - b.uses || a.createdAt.getTime() - b.createdAt.getTime(),
      )[0]
    : null;
  const mostUsed = total
    ? [...ranked].sort((a, b) => b.uses - a.uses || b.outfits - a.outfits)[0]
    : null;
  // Las que combinan con más outfits guardados (y con cuántas prendas distintas).
  const combos = ranked
    .filter((r) => r.outfits > 0)
    .sort(
      (a, b) =>
        b.outfits - a.outfits ||
        b.partners - a.partners ||
        a.name.localeCompare(b.name, 'es'),
    )
    .slice(0, 8);

  const conditions: SneakerConditionKey[] = [
    'DEADSTOCK',
    'LIKE_NEW',
    'GOOD',
    'WORN',
    'BEAT',
  ];
  const strip = (r: (typeof ranked)[number]) => {
    const { createdAt, ...rest } = r;
    void createdAt;
    return rest;
  };

  return {
    total,
    wishlist: wish,
    /** `tie`: cuántas marcas comparten el primer puesto (1 = no hay empate). */
    topBrand: brands[0]
      ? {
          ...brands[0],
          tie: brands.filter((b) => b.count === brands[0].count).length,
        }
      : null,
    brands,
    byBrand,
    topColor: colors[0]
      ? {
          ...colors[0],
          tie: colors.filter((c) => c.count === colors[0].count).length,
        }
      : null,
    colors,
    spent,
    unpriced: sneakers.filter((s) => s.purchasePrice === null).length,
    topModel: topModel && topModel.uses > 0 ? topModel : null,
    mostUsed: mostUsed && mostUsed.uses > 0 ? strip(mostUsed) : null,
    leastUsed: leastUsed ? strip(leastUsed) : null,
    totalUses: ranked.reduce((a, r) => a + r.uses, 0),
    byCondition: conditions.map((c) => ({
      condition: c,
      count: sneakers.filter((s) => s.condition === c).length,
    })),
    combos: combos.map(strip),
    neverCombined: ranked.filter((r) => r.outfits === 0).length,
  };
}
