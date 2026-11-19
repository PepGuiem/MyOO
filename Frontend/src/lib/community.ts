import type { IdeaCategory, IdeaStatus, NotificationType, ReleaseTag, ReportReason, ReportStatus, ReportTarget } from '../api/types';
import type { IconName } from '../components/Icon';
import { LOCALE_TAG, t } from '../i18n';

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  NEW: t('Nueva'),
  UNDER_REVIEW: t('En revisión'),
  PLANNED: t('Planificada'),
  IN_PROGRESS: t('En marcha'),
  DONE: t('Hecha'),
  DECLINED: t('Descartada'),
};
export const IDEA_STATUSES = Object.keys(IDEA_STATUS_LABEL) as IdeaStatus[];

export const IDEA_CATEGORY_LABEL: Record<IdeaCategory, string> = {
  FEATURE: t('Función nueva'),
  IMPROVEMENT: t('Mejora'),
  BUG: t('Algo falla'),
  OTHER: t('Otra cosa'),
};
export const IDEA_CATEGORIES = Object.keys(IDEA_CATEGORY_LABEL) as IdeaCategory[];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  SPAM: t('Spam o publicidad'),
  HARASSMENT: t('Acoso o insultos'),
  INAPPROPRIATE: t('Contenido inapropiado'),
  IMPERSONATION: t('Se hace pasar por otra persona'),
  OTHER: t('Otro motivo'),
};
export const REPORT_REASONS = Object.keys(REPORT_REASON_LABEL) as ReportReason[];

export const REPORT_TARGET_LABEL: Record<ReportTarget, string> = {
  USER: t('Perfil'),
  MESSAGE: t('Mensaje'),
  OUTFIT: t('Outfit'),
  IDEA: t('Idea'),
  LISTING: t('Anuncio'),
};

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  OPEN: t('Abierta'),
  RESOLVED: t('Resuelta'),
  DISMISSED: t('Descartada'),
};

export const RELEASE_TAG_LABEL: Record<ReleaseTag, string> = {
  NEW: t('Nuevo'),
  IMPROVED: t('Mejorado'),
  FIXED: t('Arreglado'),
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
  BATTLE_CHALLENGE: 'bolt',
  BATTLE_ACCEPTED: 'bolt',
  BATTLE_RESULT: 'trophy',
};

/** «hace 5 min», «ayer», «12 nov»… */
export function timeAgo(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return t('ahora');
  const m = Math.round(s / 60);
  if (m < 60) return t('hace {m} min', { m });
  const h = Math.round(m / 60);
  if (h < 24) return t('hace {h} h', { h });
  const days = Math.round(h / 24);
  if (days === 1) return t('ayer');
  if (days < 7) return t('hace {days} días', { days });
  return d.toLocaleDateString(LOCALE_TAG, { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: 'numeric' } : {}) });
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE_TAG, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Mensajes de error del backend que la gente puede ver en estas pantallas. */
export function friendlyError(err: unknown): unknown {
  const body = (err as { body?: Record<string, unknown> | null })?.body;
  if (body?.code === 'too_many_ideas') return new Error(t('Has propuesto 5 ideas en las últimas 24 horas. Vuelve mañana.'));
  return err;
}
