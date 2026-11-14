import { GarmentCategory, Season, SneakerBrand } from '@prisma/client';
import { BRAND_LABEL } from '../sneakers/sneakers.rules';
import { colorName } from '../stylist/engine';

/**
 * Grupos de color para filtrar el armario. Cada prenda tiene un color exacto
 * (#RRGGBB); para filtrar se agrupa por el nombre más parecido (el mismo que
 * usa el estilista) y ese nombre cae en uno de estos grupos.
 */
export const COLOR_GROUPS = [
  'black',
  'white',
  'grey',
  'beige',
  'brown',
  'blue',
  'green',
  'red',
  'pink',
  'orange',
  'yellow',
  'purple',
] as const;
export type ColorGroup = (typeof COLOR_GROUPS)[number];

const GROUP_OF_NAME: Record<string, ColorGroup> = {
  negro: 'black',
  blanco: 'white',
  crudo: 'white',
  'gris claro': 'grey',
  gris: 'grey',
  'gris oscuro': 'grey',
  beige: 'beige',
  camel: 'brown',
  marrón: 'brown',
  'azul marino': 'blue',
  azul: 'blue',
  'azul vaquero': 'blue',
  celeste: 'blue',
  turquesa: 'blue',
  verde: 'green',
  'verde oliva': 'green',
  caqui: 'green',
  'verde botella': 'green',
  rojo: 'red',
  burdeos: 'red',
  rosa: 'pink',
  fucsia: 'pink',
  naranja: 'orange',
  mostaza: 'yellow',
  amarillo: 'yellow',
  morado: 'purple',
  lila: 'purple',
};

/** Grupo de color de un #RRGGBB (si el color no es válido, gris). */
export function colorGroup(hex: string): ColorGroup {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 'grey';
  return GROUP_OF_NAME[colorName(hex)] ?? 'grey';
}

/**
 * Marca de una prenda: la de sus atributos (la escribe el usuario) o, si es
 * una zapatilla fichada, la de su ficha. Sin marca: null.
 */
export function brandOf(item: {
  attributes: unknown;
  sneaker?: { brand: SneakerBrand; brandName: string | null } | null;
}): string | null {
  const attrs = item.attributes;
  const raw =
    attrs && typeof attrs === 'object' && !Array.isArray(attrs)
      ? (attrs as Record<string, unknown>).brand
      : undefined;
  const fromAttrs = typeof raw === 'string' ? raw.trim() : '';
  if (fromAttrs) return fromAttrs;
  const s = item.sneaker;
  if (!s) return null;
  // «Otras» sin nombre no es una marca: mejor sin marca.
  const name =
    s.brand === 'OTHER' ? (s.brandName ?? '').trim() : BRAND_LABEL[s.brand];
  return name || null;
}

/** Clave para comparar marcas sin distinguir mayúsculas ni espacios de más. */
export function brandKey(brand: string): string {
  return brand.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

export interface FacetRow {
  id: string;
  name: string;
  color: string;
  season: Season;
  attributes: unknown;
  isFavorite: boolean;
  createdAt: Date;
  garmentType: {
    id: string;
    code: string;
    name: string;
    category: GarmentCategory;
  };
  sneaker?: { brand: SneakerBrand; brandName: string | null } | null;
}

export interface WardrobeFacets {
  total: number;
  favorites: number;
  /** Categorías distintas con al menos una prenda. */
  categories: number;
  byCategory: Partial<Record<GarmentCategory, number>>;
  garmentTypes: {
    id: string;
    code: string;
    name: string;
    category: GarmentCategory;
    count: number;
  }[];
  /** Marcas (agrupadas sin distinguir mayúsculas; se muestra la escritura más usada). */
  brands: { value: string; count: number }[];
  colors: { value: ColorGroup; count: number }[];
  seasons: { value: Season; count: number }[];
  lastAdded: { id: string; name: string; createdAt: Date } | null;
}

/**
 * Resumen del armario para la barra de información y los filtros: solo con
 * los datos reales de las prendas (nada inventado).
 */
export function computeFacets(rows: FacetRow[]): WardrobeFacets {
  const byCategory: Partial<Record<GarmentCategory, number>> = {};
  const types = new Map<string, WardrobeFacets['garmentTypes'][number]>();
  const brands = new Map<
    string,
    { spellings: Map<string, number>; count: number }
  >();
  const colors = new Map<ColorGroup, number>();
  const seasons = new Map<Season, number>();
  let favorites = 0;
  let last: FacetRow | null = null;

  for (const r of rows) {
    if (r.isFavorite) favorites++;
    const cat = r.garmentType.category;
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    const ty = types.get(r.garmentType.id);
    if (ty) ty.count++;
    else types.set(r.garmentType.id, { ...r.garmentType, count: 1 });

    const brand = brandOf(r);
    if (brand) {
      const key = brandKey(brand);
      const entry = brands.get(key) ?? {
        spellings: new Map<string, number>(),
        count: 0,
      };
      entry.count++;
      entry.spellings.set(brand, (entry.spellings.get(brand) ?? 0) + 1);
      brands.set(key, entry);
    }

    const group = colorGroup(r.color);
    colors.set(group, (colors.get(group) ?? 0) + 1);
    seasons.set(r.season, (seasons.get(r.season) ?? 0) + 1);

    if (
      !last ||
      r.createdAt > last.createdAt ||
      (r.createdAt.getTime() === last.createdAt.getTime() && r.id < last.id)
    )
      last = r;
  }

  const byCount = <T extends { count: number }>(a: T, b: T) =>
    b.count - a.count;
  return {
    total: rows.length,
    favorites,
    categories: Object.keys(byCategory).length,
    byCategory,
    garmentTypes: [...types.values()].sort(
      (a, b) => byCount(a, b) || a.name.localeCompare(b.name, 'es'),
    ),
    brands: [...brands.values()]
      .map(({ spellings, count }) => ({
        value: [...spellings.entries()].sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'),
        )[0][0],
        count,
      }))
      .sort((a, b) => byCount(a, b) || a.value.localeCompare(b.value, 'es')),
    colors: COLOR_GROUPS.filter((g) => colors.has(g)).map((g) => ({
      value: g,
      count: colors.get(g)!,
    })),
    seasons: [...seasons.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort(byCount),
    lastAdded: last
      ? { id: last.id, name: last.name, createdAt: last.createdAt }
      : null,
  };
}
