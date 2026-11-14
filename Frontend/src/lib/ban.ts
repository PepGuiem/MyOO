import { ApiError, banInfo, type BanInfo } from '../api/client';
import { LOCALE_TAG, t } from '../i18n';

/** Si el error es "tu cuenta está suspendida", devuelve el motivo y la fecha. */
export function banFromError(err: unknown): BanInfo | null {
  return err instanceof ApiError && err.status === 403 ? banInfo(err.body) : null;
}

/** Texto para la pantalla de acceso. */
export function banMessage(ban: BanInfo): string {
  const until = ban.until ? new Date(ban.until) : null;
  const when = until
    ? t('hasta el {toLocaleDateString} a las {toLocaleTimeString}', { toLocaleDateString: until.toLocaleDateString(LOCALE_TAG, { day: 'numeric', month: 'long', year: 'numeric' }), toLocaleTimeString: until.toLocaleTimeString(LOCALE_TAG, { hour: '2-digit', minute: '2-digit' }) })
    : t('hasta nuevo aviso');
  return t('Tu cuenta está suspendida {when}.{v}', { when, v: ban.reason ? t(' Motivo: {reason}', { reason: ban.reason }) : '' });
}
