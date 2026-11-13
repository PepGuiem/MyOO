import { ApiError, banInfo, type BanInfo } from '../api/client';

/** Si el error es "tu cuenta está suspendida", devuelve el motivo y la fecha. */
export function banFromError(err: unknown): BanInfo | null {
  return err instanceof ApiError && err.status === 403 ? banInfo(err.body) : null;
}

/** Texto para la pantalla de acceso. */
export function banMessage(ban: BanInfo): string {
  const until = ban.until ? new Date(ban.until) : null;
  const when = until
    ? `hasta el ${until.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })} a las ${until.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
    : 'hasta nuevo aviso';
  return `Tu cuenta está suspendida ${when}.${ban.reason ? ` Motivo: ${ban.reason}` : ''}`;
}
