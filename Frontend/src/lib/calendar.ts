import type { CalendarEventKind } from '../api/types';

/** Tipos de evento especial: etiqueta y color de la cinta. */
export const EVENT_KINDS: Record<CalendarEventKind, { label: string; color: string }> = {
  BIRTHDAY: { label: 'Cumpleaños', color: '#ffb020' },
  PARTY: { label: 'Fiesta', color: '#ff4f8b' },
  WEDDING: { label: 'Boda', color: '#f2efe8' },
  DATE: { label: 'Cita', color: '#ff2d4a' },
  INTERVIEW: { label: 'Entrevista', color: '#7fb2ff' },
  TRIP: { label: 'Viaje', color: '#2bb3b1' },
  CONCERT: { label: 'Concierto', color: '#9b5cff' },
  OTHER: { label: 'Otro', color: '#c6ff2e' },
};

export const EVENT_KIND_KEYS = Object.keys(EVENT_KINDS) as CalendarEventKind[];

/** Outfits como máximo en un día (igual que el backend). */
export const MAX_PER_DAY = 4;
