import type { IdeaCategory, IdeaStatus, NotificationType, ReleaseTag, ReportReason, ReportStatus, ReportTarget } from '../api/types';
import type { IconName } from '../components/Icon';

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  NEW: 'Nueva',
  UNDER_REVIEW: 'En revisión',
  PLANNED: 'Planificada',
  IN_PROGRESS: 'En marcha',
  DONE: 'Hecha',
  DECLINED: 'Descartada',
};
export const IDEA_STATUSES = Object.keys(IDEA_STATUS_LABEL) as IdeaStatus[];

export const IDEA_CATEGORY_LABEL: Record<IdeaCategory, string> = {
  FEATURE: 'Función nueva',
  IMPROVEMENT: 'Mejora',
  BUG: 'Algo falla',
  OTHER: 'Otra cosa',
};
export const IDEA_CATEGORIES = Object.keys(IDEA_CATEGORY_LABEL) as IdeaCategory[];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  SPAM: 'Spam o publicidad',
  HARASSMENT: 'Acoso o insultos',
  INAPPROPRIATE: 'Contenido inapropiado',
  IMPERSONATION: 'Se hace pasar por otra persona',
  OTHER: 'Otro motivo',
};
export const REPORT_REASONS = Object.keys(REPORT_REASON_LABEL) as ReportReason[];

export const REPORT_TARGET_LABEL: Record<ReportTarget, string> = {
  USER: 'Perfil',
  MESSAGE: 'Mensaje',
  OUTFIT: 'Outfit',
  IDEA: 'Idea',
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  OPEN: 'Abierta',
  RESOLVED: 'Resuelta',
  DISMISSED: 'Descartada',
};

export const RELEASE_TAG_LABEL: Record<ReleaseTag, string> = {
  NEW: 'Nuevo',
  IMPROVED: 'Mejorado',
  FIXED: 'Arreglado',
};
export const RELEASE_TAGS = Object.keys(RELEASE_TAG_LABEL) as ReleaseTag[];

export const NOTIFICATION_ICON: Record<NotificationType, IconName> = {
  RELEASE: 'megaphone',
  IDEA_STATUS: 'bulb',
  IDEA_REPLY: 'bulb',
  FOLLOW_REQUEST: 'users',
  NEW_FOLLOWER: 'users',
  FOLLOW_ACCEPTED: 'users',
  REPORT_UPDATE: 'flag',
  PRICE_DROP: 'tag',
};

/** «hace 5 min», «ayer», «12 nov»… */
export function timeAgo(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return 'ahora';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Mensajes de error del backend que la gente puede ver en estas pantallas. */
export function friendlyError(err: unknown): unknown {
  const body = (err as { body?: Record<string, unknown> | null })?.body;
  if (body?.code === 'too_many_ideas') return new Error('Has propuesto 5 ideas en las últimas 24 horas. Vuelve mañana.');
  return err;
}
