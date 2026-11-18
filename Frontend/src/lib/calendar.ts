import type { CalendarEventKind } from '../api/types';
import { t } from '../i18n';

/** Tipos de evento especial: etiqueta y color de la cinta. */
export const EVENT_KINDS: Record<CalendarEventKind, { label: string; color: string }> = {
  BIRTHDAY: { label: t('Cumpleaños'), color: '#ffb020' },
  PARTY: { label: t('Fiesta'), color: '#ff4f8b' },
  WEDDING: { label: t('Boda'), color: '#f2efe8' },
  DATE: { label: t('Cita'), color: '#ff2d4a' },
  INTERVIEW: { label: t('Entrevista'), color: '#7fb2ff' },
  TRIP: { label: t('Viaje'), color: '#2bb3b1' },
  CONCERT: { label: t('Concierto'), color: '#9b5cff' },
  OTHER: { label: t('Otro'), color: '#c6ff2e' },
};

export const EVENT_KIND_KEYS = Object.keys(EVENT_KINDS) as CalendarEventKind[];

/** Outfits como máximo en un día (igual que el backend). */
export const MAX_PER_DAY = 4;
