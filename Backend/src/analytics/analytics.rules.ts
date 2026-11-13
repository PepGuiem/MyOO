/**
 * STYLE ANALYTICS: cifras, gráficos e «insights» a partir de las prendas, los
 * outfits y los días usados del calendario de UNA persona. Funciones puras:
 * el servicio carga los datos (siempre filtrados por usuario) y aquí solo se
 * cuenta. No hay datos inventados: si algo no se puede calcular, sale null.
 */
import { colorFamily, colorName, ColorFamily } from '../stylist/engine';
import { addDays, diffDays, parseDay } from '../calendar/calendar.rules';
import { detectStyle, STYLE_PROFILES } from '../outfits/rating/rules-engine';
import { OutfitStyleKey, RatingItem } from '../outfits/rating/rating.types';

export const STYLE_KEYS = Object.keys(STYLE_PROFILES) as OutfitStyleKey[];

export type Category = RatingItem['category'];

export interface AItem extends RatingItem {
  createdAt: Date;
  brand: string | null;
}

export interface AOutfit {
  id: string;
  name: string;
  style: OutfitStyleKey | null;
  createdAt: Date;
  ratingScore: number | null;
  isFavorite: boolean;
  itemIds: string[];
}

export interface AWorn {
  outfitId: string;
  /** Día «YYYY-MM-DD». */
  date: string;
}

export interface Insight {
  code: string;
  tone: 'warn' | 'tip' | 'praise' | 'info';
  title: string;
  text: string;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/** Día local «YYYY-MM-DD» de un instante en una zona horaria. */
export function localDay(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Lunes de la semana de un día. */
function weekStart(day: string): string {
  return addDays(day, -((parseDay(day)!.getUTCDay() + 6) % 7));
}

const MONTHS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];
const STYLE_LABEL = (s: OutfitStyleKey) => STYLE_PROFILES[s].label;

const CATEGORY_PLURAL: Record<Category, string> = {
  TOP: 'prendas de arriba',
  BOTTOM: 'pantalones y faldas',
  FULL_BODY: 'vestidos y monos',
  OUTERWEAR: 'chaquetas y abrigos',
  FOOTWEAR: 'zapatos',
  ACCESSORY: 'accesorios',
};

export interface AnalyticsInput {
  items: AItem[];
  outfits: AOutfit[];
  worn: AWorn[];
  now: Date;
  tz: string;
}

export function analyze({ items, outfits, worn, now, tz }: AnalyticsInput) {
  const today = localDay(now, tz);
  const itemById = new Map(items.map((i) => [i.id, i]));

  // ---------------------------------------------------------------- estilo de cada outfit
  // El marcado por ti; si no lo tiene, el que deduce el motor de OUTFIT RATING.
  const styleOf = new Map<
    string,
    { style: OutfitStyleKey; inferred: boolean }
  >();
  for (const o of outfits) {
    if (o.style) styleOf.set(o.id, { style: o.style, inferred: false });
    else {
      const its = o.itemIds
        .map((id) => itemById.get(id))
        .filter((i): i is AItem => !!i);
      if (its.length)
        styleOf.set(o.id, { style: detectStyle(its), inferred: true });
    }
  }
  const styles = STYLE_KEYS.map((style) => {
    const list = [...styleOf.values()].filter((s) => s.style === style);
    const declared = list.filter((s) => !s.inferred).length;
    return {
      style,
      count: list.length,
      declared,
      inferred: list.length - declared,
      share: pct(list.length, styleOf.size),
    };
  }).sort(
    (a, b) =>
      b.count - a.count ||
      STYLE_KEYS.indexOf(a.style) - STYLE_KEYS.indexOf(b.style),
  );
  const topStyle = styles[0]?.count ? styles[0] : null;

  // ---------------------------------------------------------------- uso de cada prenda
  const uses = new Map<string, number>();
  for (const o of outfits)
    for (const id of new Set(o.itemIds)) uses.set(id, (uses.get(id) ?? 0) + 1);
  const usedItems = items.filter((i) => (uses.get(i.id) ?? 0) > 0);
  const unused = items
    .filter((i) => !uses.get(i.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const mostCombinedItem = [...items].sort(
    (a, b) =>
      (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) ||
      a.name.localeCompare(b.name),
  )[0];
  const mostCombined =
    mostCombinedItem && uses.get(mostCombinedItem.id)
      ? {
          itemId: mostCombinedItem.id,
          name: mostCombinedItem.name,
          color: mostCombinedItem.color,
          category: mostCombinedItem.category,
          count: uses.get(mostCombinedItem.id)!,
          share: pct(uses.get(mostCombinedItem.id)!, outfits.length),
        }
      : null;

  // ---------------------------------------------------------------- colores
  // Cada prenda cuenta una vez por outfit en el que sale; se agrupa por nombre de color.
  const colorUse = new Map<
    string,
    {
      name: string;
      hexes: Map<string, number>;
      uses: number;
      items: Set<string>;
    }
  >();
  const colorEntry = (hex: string) => {
    const name = colorName(hex);
    let e = colorUse.get(name);
    if (!e) {
      e = { name, hexes: new Map(), uses: 0, items: new Set() };
      colorUse.set(name, e);
    }
    return e;
  };
  for (const i of items) {
    const e = colorEntry(i.color);
    e.items.add(i.id);
    e.hexes.set(
      i.color.toUpperCase(),
      (e.hexes.get(i.color.toUpperCase()) ?? 0) + (uses.get(i.id) ?? 0) + 0.001,
    );
  }
  for (const o of outfits)
    for (const id of new Set(o.itemIds)) {
      const it = itemById.get(id);
      if (it) colorEntry(it.color).uses++;
    }
  const totalColorUses = [...colorUse.values()].reduce((a, c) => a + c.uses, 0);
  const colorRows = [...colorUse.values()].map((c) => ({
    name: c.name,
    hex: [...c.hexes.entries()].sort((a, b) => b[1] - a[1])[0][0],
    uses: c.uses,
    items: c.items.size,
    share: pct(c.uses, totalColorUses),
    family: colorFamily([...c.hexes.keys()][0]) as ColorFamily,
  }));
  const colorRanking = colorRows
    .filter((c) => c.uses > 0)
    .sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));
  // Menos usados: colores que tienes en el armario y casi no salen (los de 0 usos primero).
  const leastColors = [...colorRows]
    .sort(
      (a, b) =>
        a.uses - b.uses || b.items - a.items || a.name.localeCompare(b.name),
    )
    .slice(0, 5);
  const families = { neutral: 0, earth: 0, color: 0 };
  for (const c of colorRows) families[c.family] += c.uses;

  // Combinaciones: pares de colores distintos que salen juntos en un outfit.
  const pairCount = new Map<string, number>();
  for (const o of outfits) {
    const names = [
      ...new Set(
        o.itemIds
          .map((id) => itemById.get(id))
          .filter((i): i is AItem => !!i && i.category !== 'ACCESSORY')
          .map((i) => colorName(i.color)),
      ),
    ].sort();
    for (let a = 0; a < names.length; a++)
      for (let b = a + 1; b < names.length; b++) {
        const k = `${names[a]}|${names[b]}`;
        pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
      }
  }
  const hexOf = (name: string) =>
    colorRows.find((c) => c.name === name)?.hex ?? '#808080';
  const colorPairs = [...pairCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([k, count]) => {
      const [a, b] = k.split('|');
      return {
        a: { name: a, hex: hexOf(a) },
        b: { name: b, hex: hexOf(b) },
        count,
        share: pct(count, outfits.length),
      };
    });

  // ---------------------------------------------------------------- marcas
  const brandCount = new Map<
    string,
    { names: Map<string, number>; count: number }
  >();
  for (const i of items) {
    const b = i.brand?.trim();
    if (!b) continue;
    const k = b.toLowerCase();
    const e = brandCount.get(k) ?? { names: new Map(), count: 0 };
    e.count++;
    e.names.set(b, (e.names.get(b) ?? 0) + 1);
    brandCount.set(k, e);
  }
  const brands = [...brandCount.values()]
    .map((e) => ({
      name: [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: e.count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const withBrand = items.filter((i) => i.brand?.trim()).length;

  // ---------------------------------------------------------------- categorías
  const CATS: Category[] = [
    'TOP',
    'BOTTOM',
    'FULL_BODY',
    'OUTERWEAR',
    'FOOTWEAR',
    'ACCESSORY',
  ];
  const categories = CATS.map((category) => {
    const its = items.filter((i) => i.category === category);
    const used = its.filter((i) => uses.get(i.id)).length;
    return {
      category,
      items: its.length,
      used,
      usedShare: pct(used, its.length),
    };
  }).filter((c) => c.items > 0);

  // ---------------------------------------------------------------- evolución
  const month = today.slice(0, 7);
  const monthKey = (d: Date) => localDay(d, tz).slice(0, 7);
  const prevMonth = (m: string, n: number) => {
    const [y, mm] = m.split('-').map(Number);
    const t = y * 12 + (mm - 1) - n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
  };
  const months = Array.from({ length: 12 }, (_, i) => prevMonth(month, 11 - i));
  const monthly = months.map((m) => {
    const created = outfits.filter((o) => monthKey(o.createdAt) === m);
    const mix = Object.fromEntries(STYLE_KEYS.map((s) => [s, 0])) as Record<
      OutfitStyleKey,
      number
    >;
    for (const o of created) {
      const s = styleOf.get(o.id);
      if (s) mix[s.style]++;
    }
    const [y, mm] = m.split('-').map(Number);
    return {
      key: m,
      label: `${MONTHS[mm - 1]}${mm === 1 || m === months[0] ? ` ${String(y).slice(2)}` : ''}`,
      outfits: created.length,
      items: items.filter((i) => monthKey(i.createdAt) === m).length,
      worn: worn.filter((w) => w.date.slice(0, 7) === m).length,
      styles: mix,
    };
  });
  const thisWeek = weekStart(today);
  const weeks = Array.from({ length: 12 }, (_, i) =>
    addDays(thisWeek, -7 * (11 - i)),
  );
  const inWeek = (day: string, start: string) => {
    const d = diffDays(start, day);
    return d >= 0 && d < 7;
  };
  const weekly = weeks.map((start) => {
    const [, mm, dd] = start.split('-').map(Number);
    return {
      key: start,
      label: `${dd} ${MONTHS[mm - 1]}`,
      outfits: outfits.filter((o) => inWeek(localDay(o.createdAt, tz), start))
        .length,
      items: items.filter((i) => inWeek(localDay(i.createdAt, tz), start))
        .length,
      worn: worn.filter((w) => inWeek(w.date, start)).length,
    };
  });

  // ---------------------------------------------------------------- totales
  const rated = outfits.filter((o) => o.ratingScore !== null);
  const totals = {
    items: items.length,
    outfits: outfits.length,
    outfitsThisMonth: outfits.filter((o) => monthKey(o.createdAt) === month)
      .length,
    outfitsLastMonth: outfits.filter(
      (o) => monthKey(o.createdAt) === prevMonth(month, 1),
    ).length,
    itemsThisMonth: items.filter((i) => monthKey(i.createdAt) === month).length,
    worn30: worn.filter((w) => {
      const d = diffDays(w.date, today);
      return d >= 0 && d < 30;
    }).length,
    favorites: outfits.filter((o) => o.isFavorite).length,
    avgRating: rated.length
      ? Math.round(
          rated.reduce((a, o) => a + (o.ratingScore ?? 0), 0) / rated.length,
        )
      : null,
    usedItemsShare: pct(usedItems.length, items.length),
  };

  // ---------------------------------------------------------------- STYLE INSIGHTS
  const insights: Insight[] = [];
  const top = colorRanking[0];
  if (top && totalColorUses >= 6 && top.share >= 40) {
    insights.push({
      code: 'color.dominant',
      tone: 'warn',
      title: `Utilizas demasiado el ${top.name}`,
      text: `El ${top.name} está en el ${top.share}% de lo que combinas. Prueba a cambiar una prenda por otro tono.`,
    });
  }
  if (totalColorUses >= 6 && pct(families.neutral, totalColorUses) >= 80) {
    insights.push({
      code: 'color.neutral',
      tone: 'tip',
      title: 'Podrías experimentar con otros colores',
      text: `El ${pct(families.neutral, totalColorUses)}% de tus combinaciones son neutros (negro, gris, blanco, crudo). Un solo punto de color cambia el look.`,
    });
  }
  const forgotten = leastColors.filter((c) => c.uses === 0 && c.items > 0);
  if (forgotten.length && colorRanking.length) {
    insights.push({
      code: 'color.forgotten',
      tone: 'tip',
      title: `Tienes ${forgotten
        .map((c) => c.name)
        .slice(0, 3)
        .join(', ')} sin estrenar`,
      text: `Hay prendas de ${forgotten.length === 1 ? 'ese color' : 'esos colores'} en tu armario que no sale${forgotten.length === 1 ? '' : 'n'} en ningún outfit.`,
    });
  }
  if (topStyle && styleOf.size >= 4 && topStyle.share >= 55) {
    insights.push({
      code: 'style.dominant',
      tone: 'info',
      title: `Tus outfits son principalmente ${STYLE_LABEL(topStyle.style)}`,
      text: `${topStyle.share}% de tus outfits${topStyle.inferred ? ' (contando los que deduce el motor)' : ''}. ${styles[1]?.count ? `El siguiente es ${STYLE_LABEL(styles[1].style)} (${styles[1].share}%).` : 'Prueba otro estilo para variar.'}`,
    });
  }
  const undeclared = [...styleOf.values()].filter((s) => s.inferred).length;
  if (undeclared >= 3 && pct(undeclared, styleOf.size) >= 50) {
    insights.push({
      code: 'style.undeclared',
      tone: 'tip',
      title: 'Marca el estilo de tus outfits',
      text: `${undeclared} de ${styleOf.size} no tienen estilo y se deduce por las prendas. Marcándolo, estas cifras serán más exactas.`,
    });
  }
  for (const c of categories) {
    if (
      c.items >= 2 &&
      c.usedShare < 34 &&
      c.category !== 'TOP' &&
      c.category !== 'BOTTOM'
    ) {
      insights.push({
        code: `category.${c.category.toLowerCase()}`,
        tone: 'warn',
        title: `Apenas utilizas tus ${CATEGORY_PLURAL[c.category]}`,
        text: `Solo ${c.used} de ${c.items} han salido en algún outfit.`,
      });
    }
  }
  if (unused.length && items.length) {
    insights.push({
      code: 'items.unused',
      tone: unused.length > items.length / 3 ? 'warn' : 'tip',
      title: `Tienes ${unused.length} ${unused.length === 1 ? 'prenda que todavía no has' : 'prendas que todavía no has'} combinado`,
      text: `Por ejemplo: ${unused
        .slice(0, 3)
        .map((i) => `«${i.name}»`)
        .join(', ')}.`,
    });
  }
  if (mostCombined && outfits.length >= 4 && mostCombined.share >= 50) {
    insights.push({
      code: 'items.favorite',
      tone: 'info',
      title: `«${mostCombined.name}» sale en casi todo`,
      text: `Está en el ${mostCombined.share}% de tus outfits. Es tu comodín; busca otra prenda que haga ese papel.`,
    });
  }
  // Tendencia: estilo de este mes frente a los 3 anteriores.
  const recent = monthly.slice(-1)[0];
  const before = monthly.slice(-4, -1);
  if (recent.outfits >= 2) {
    const prevTotal = before.reduce((a, m) => a + m.outfits, 0);
    for (const s of STYLE_KEYS) {
      const cur = pct(recent.styles[s], recent.outfits);
      const prev = pct(
        before.reduce((a, m) => a + m.styles[s], 0),
        prevTotal,
      );
      if (prevTotal >= 2 && cur - prev >= 25) {
        insights.push({
          code: 'trend.up',
          tone: 'info',
          title: `Este mes te estás pasando al ${STYLE_LABEL(s)}`,
          text: `${Math.round(cur)}% de lo que has creado este mes, frente al ${Math.round(prev)}% de los tres anteriores.`,
        });
        break;
      }
    }
  }
  // Qué estilo te sale mejor (nota media de OUTFIT RATING, con al menos 2 outfits).
  const byStyleRating = STYLE_KEYS.map((s) => {
    const os = outfits.filter(
      (o) => o.ratingScore !== null && styleOf.get(o.id)?.style === s,
    );
    return {
      s,
      n: os.length,
      avg: os.length
        ? os.reduce((a, o) => a + (o.ratingScore ?? 0), 0) / os.length
        : 0,
    };
  }).filter((x) => x.n >= 2);
  if (byStyleRating.length >= 2) {
    const best = byStyleRating.sort((a, b) => b.avg - a.avg)[0];
    insights.push({
      code: 'rating.best_style',
      tone: 'praise',
      title: `Donde mejor te sale: ${STYLE_LABEL(best.s)}`,
      text: `Tus outfits ${STYLE_LABEL(best.s)} sacan ${Math.round(best.avg)} de media en OUTFIT RATING.`,
    });
  }
  if (
    outfits.length &&
    totals.outfitsThisMonth === 0 &&
    totals.outfitsLastMonth === 0
  ) {
    insights.push({
      code: 'activity.idle',
      tone: 'tip',
      title: 'Hace tiempo que no creas outfits',
      text: 'Ni este mes ni el anterior. Prueba «Sorpréndeme» en el vestidor.',
    });
  }
  if (items.length && withBrand / items.length < 0.3) {
    insights.push({
      code: 'brand.missing',
      tone: 'info',
      title: 'Añade la marca a tus prendas',
      text: `Solo ${withBrand} de ${items.length} la tienen. Con ella sabrás qué marcas te pones más.`,
    });
  }

  return {
    today,
    tz,
    totals,
    highlights: {
      topStyle: topStyle
        ? {
            style: topStyle.style,
            share: topStyle.share,
            inferred: topStyle.inferred > topStyle.declared,
          }
        : null,
      topColor: colorRanking[0]
        ? {
            name: colorRanking[0].name,
            hex: colorRanking[0].hex,
            share: colorRanking[0].share,
          }
        : null,
      topBrand: brands[0] ?? null,
      brandCoverage: pct(withBrand, items.length),
      mostCombined,
    },
    styles,
    colors: {
      ranking: colorRanking.slice(0, 10),
      least: leastColors,
      pairs: colorPairs,
      families: {
        neutral: pct(families.neutral, totalColorUses),
        earth: pct(families.earth, totalColorUses),
        color: pct(families.color, totalColorUses),
      },
    },
    brands: brands.slice(0, 5),
    categories,
    unused: {
      count: unused.length,
      sample: unused
        .slice(0, 6)
        .map((i) => ({
          id: i.id,
          name: i.name,
          color: i.color,
          category: i.category,
        })),
    },
    evolution: { weekly, monthly },
    insights,
  };
}

export type StyleAnalytics = ReturnType<typeof analyze>;
