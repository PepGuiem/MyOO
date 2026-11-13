/**
 * Días del calendario como texto «YYYY-MM-DD» en la hora local de quien
 * mira (sin zonas horarias por medio: el 14 es el 14).
 */
export type DayKey = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(k: DayKey): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d, 12); // mediodía: a salvo de cambios de hora
}

export function todayKey(): DayKey {
  return toKey(new Date());
}

export function addDays(k: DayKey, n: number): DayKey {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function addMonths(k: DayKey, n: number): DayKey {
  const d = fromKey(k);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toKey(d);
}

/** Días de `a` a `b`. */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000);
}

/** Lunes de la semana del día. */
export function startOfWeek(k: DayKey): DayKey {
  const d = fromKey(k);
  return addDays(k, -((d.getDay() + 6) % 7));
}

/** 42 días (6 semanas, de lunes a domingo) que pintan el mes de `k`. */
export function monthGrid(k: DayKey): DayKey[] {
  const d = fromKey(k);
  const first = toKey(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function sameMonth(a: DayKey, b: DayKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function weekdayIndex(k: DayKey): number {
  return (fromKey(k).getDay() + 6) % 7;
}

export function monthLabel(k: DayKey): string {
  const d = fromKey(k);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** «vie 14 nov» */
export function shortDay(k: DayKey): string {
  const d = fromKey(k);
  return `${WEEKDAYS_SHORT[weekdayIndex(k)].toLowerCase()} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** «viernes, 14 de noviembre» */
export function longDay(k: DayKey): string {
  return fromKey(k).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** «hoy», «mañana», «en 5 días», «hace 3 días» */
export function relativeDay(k: DayKey, today = todayKey()): string {
  const n = diffDays(today, k);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}
