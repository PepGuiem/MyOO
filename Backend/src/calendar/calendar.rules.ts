/**
 * Reglas de OUTFIT CALENDAR (funciones puras, fáciles de probar): fechas sin
 * zona horaria, repeticiones, recomendaciones y estadísticas.
 *
 * Las fechas viajan como texto «YYYY-MM-DD» y en la base de datos son DATE:
 * un día del calendario, sin hora. Así el 14 de noviembre es el 14 en
 * Madrid y en cualquier sitio.
 */
export type SeasonKey =
  'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER' | 'ALL_SEASON';

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

/** «2026-11-14» → Date a medianoche UTC (o null si no es una fecha real). */
export function parseDay(s: string): Date | null {
  const m = DAY_RE.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] &&
    d.getUTCMonth() === +m[2] - 1 &&
    d.getUTCDate() === +m[3]
    ? d
    : null;
}

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(key: string, n: number): string {
  return dayKey(new Date(parseDay(key)!.getTime() + n * DAY_MS));
}

/** Días de `a` a `b` (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseDay(b)!.getTime() - parseDay(a)!.getTime()) / DAY_MS);
}

/** Estación de un día (hemisferio norte, por meses). */
export function seasonOfDay(key: string): Exclude<SeasonKey, 'ALL_SEASON'> {
  const month = parseDay(key)!.getUTCMonth() + 1;
  if (month === 12 || month <= 2) return 'WINTER';
  if (month <= 5) return 'SPRING';
  if (month <= 8) return 'SUMMER';
  return 'AUTUMN';
}

const SEASON_LABEL: Record<SeasonKey, string> = {
  SPRING: 'la primavera',
  SUMMER: 'el verano',
  AUTUMN: 'el otoño',
  WINTER: 'el invierno',
  ALL_SEASON: 'todo el año',
};

const opposite = (a: SeasonKey, b: SeasonKey) =>
  (a === 'SUMMER' && b === 'WINTER') || (a === 'WINTER' && b === 'SUMMER');

// ---------------------------------------------------------------- repeticiones
export interface Use {
  id: string;
  outfitId: string;
  date: string;
}

export interface RepeatFlag {
  /** Días desde el uso anterior del mismo outfit (null si es el primero). */
  gapDays: number | null;
  /** Usos del outfit en los 30 días que rodean a este (±15). */
  uses30: number;
  level: 'warn' | 'high';
  text: string;
}

/** A partir de cuántos días entre usos se avisa. */
export const REPEAT_GAP_DAYS = 6;
/** A partir de cuántos usos en 30 días se avisa. */
export const REPEAT_MAX_30 = 4;

/**
 * Marca los días en los que un outfit se repite demasiado: menos de una
 * semana desde la vez anterior, o 4 veces o más en 30 días.
 */
export function findRepeats(uses: Use[]): Map<string, RepeatFlag> {
  const byOutfit = new Map<string, Use[]>();
  for (const u of uses) {
    const l = byOutfit.get(u.outfitId) ?? [];
    l.push(u);
    byOutfit.set(u.outfitId, l);
  }
  const out = new Map<string, RepeatFlag>();
  for (const list of byOutfit.values()) {
    list.sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    list.forEach((u, i) => {
      const prev = list[i - 1];
      const gap = prev ? diffDays(prev.date, u.date) : null;
      const uses30 = list.filter(
        (x) => Math.abs(diffDays(u.date, x.date)) <= 15,
      ).length;
      const close = gap !== null && gap <= REPEAT_GAP_DAYS;
      const many = uses30 >= REPEAT_MAX_30;
      if (!close && !many) return;
      const high = (gap !== null && gap <= 2) || uses30 >= REPEAT_MAX_30 + 1;
      const text = many
        ? `${uses30} veces en 30 días`
        : gap === 0
          ? 'Repetido el mismo día'
          : `Repetido a los ${gap} ${gap === 1 ? 'día' : 'días'}`;
      out.set(u.id, {
        gapDays: gap,
        uses30,
        level: high ? 'high' : 'warn',
        text,
      });
    });
  }
  return out;
}

// ---------------------------------------------------------------- recomendaciones
export interface Candidate {
  id: string;
  season: SeasonKey | null;
  ratingScore: number | null;
  isFavorite: boolean;
  /** Último día que se marcó como usado. */
  lastWorn: string | null;
  /** Días en los que ya está planificado (cerca de la fecha). */
  planned: string[];
}

export interface Suggestion {
  id: string;
  score: number;
  reasons: string[];
}

/**
 * Outfits para un día: primero los que no has usado nunca (o hace mucho),
 * luego los de mejor nota y los que van con la estación. Fuera los que ya
 * tienes planificados en los 3 días de alrededor.
 */
export function suggestOutfits(
  candidates: Candidate[],
  date: string,
  limit = 6,
): Suggestion[] {
  const season = seasonOfDay(date);
  const out: Suggestion[] = [];
  for (const c of candidates) {
    if (c.planned.some((d) => Math.abs(diffDays(d, date)) <= 3)) continue;
    const reasons: string[] = [];
    let score = 0;
    if (!c.lastWorn) {
      score += 30;
      reasons.push('Sin estrenar');
    } else {
      const days = diffDays(c.lastWorn, date);
      score += Math.max(0, Math.min(30, days / 2));
      if (days >= 21) reasons.push(`No lo usas desde hace ${days} días`);
    }
    if (c.ratingScore !== null) {
      score += c.ratingScore / 5;
      if (c.ratingScore >= 80) reasons.push(`Nota ${c.ratingScore}`);
    } else score += 10;
    if (c.season && c.season !== 'ALL_SEASON') {
      if (c.season === season) {
        score += 10;
        reasons.push(`Va con ${SEASON_LABEL[season]}`);
      } else if (opposite(c.season, season)) score -= 15;
    }
    score -=
      8 * c.planned.filter((d) => Math.abs(diffDays(d, date)) <= 14).length;
    if (c.isFavorite) {
      score += 4;
      reasons.push('Favorito');
    }
    out.push({
      id: c.id,
      score: Math.round(score * 10) / 10,
      reasons: reasons.slice(0, 3),
    });
  }
  return out
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

// ---------------------------------------------------------------- estadísticas
export interface StatEntry {
  outfitId: string;
  date: string;
  worn: boolean;
  style: string | null;
}

export interface CalendarStats {
  /** Días marcados como usados (todo el historial). */
  wornTotal: number;
  /** Usados en los últimos 30 días (hoy incluido). */
  worn30: number;
  /** Días planificados de los últimos 30 que se marcaron como usados (0-1, null sin datos). */
  wearRate30: number | null;
  /** Días seguidos hasta hoy (o ayer) con un outfit usado. */
  streak: number;
  /** Planificados de hoy en adelante (30 días). */
  upcoming30: number;
  /** Outfits guardados que nunca se han marcado como usados. */
  neverWorn: number;
  totalOutfits: number;
  /** Usos por día de la semana (0 lunes … 6 domingo). */
  byWeekday: number[];
  /** Usos por estilo en los últimos 90 días. */
  byStyle: { style: string | null; count: number }[];
  /** Outfits más usados. */
  topWorn: { outfitId: string; count: number }[];
}

export function computeStats(
  entries: StatEntry[],
  outfitIds: string[],
  today: string,
): CalendarStats {
  const worn = entries.filter((e) => e.worn);
  const inLast = (e: StatEntry, n: number) => {
    const d = diffDays(e.date, today);
    return d >= 0 && d < n;
  };
  const past30 = entries.filter((e) => inLast(e, 30));
  const wornDays = new Set(worn.map((e) => e.date));
  let streak = 0;
  // La racha cuenta desde hoy; si hoy aún no hay nada, desde ayer.
  let cursor = wornDays.has(today) ? today : addDays(today, -1);
  while (wornDays.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const e of worn) byWeekday[(parseDay(e.date)!.getUTCDay() + 6) % 7]++;
  const styleCount = new Map<string | null, number>();
  for (const e of worn.filter((x) => inLast(x, 90)))
    styleCount.set(e.style, (styleCount.get(e.style) ?? 0) + 1);
  const outfitCount = new Map<string, number>();
  for (const e of worn)
    outfitCount.set(e.outfitId, (outfitCount.get(e.outfitId) ?? 0) + 1);
  const wornOutfits = new Set(worn.map((e) => e.outfitId));
  return {
    wornTotal: worn.length,
    worn30: worn.filter((e) => inLast(e, 30)).length,
    wearRate30: past30.length
      ? Math.round(
          (past30.filter((e) => e.worn).length / past30.length) * 100,
        ) / 100
      : null,
    streak,
    upcoming30: entries.filter((e) => {
      const d = diffDays(today, e.date);
      return d >= 0 && d < 30;
    }).length,
    neverWorn: outfitIds.filter((id) => !wornOutfits.has(id)).length,
    totalOutfits: outfitIds.length,
    byWeekday,
    byStyle: [...styleCount.entries()]
      .map(([style, count]) => ({ style, count }))
      .sort((a, b) => b.count - a.count),
    topWorn: [...outfitCount.entries()]
      .map(([outfitId, count]) => ({ outfitId, count }))
      .sort((a, b) => b.count - a.count || a.outfitId.localeCompare(b.outfitId))
      .slice(0, 5),
  };
}
