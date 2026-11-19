import { oauthApi } from '../api/endpoints';
import type { ProviderSlug } from '../api/types';
import { t } from '../i18n';

/**
 * Acciones que esperan a que vuelvas de Google/Apple (crear contraseña o borrar
 * la cuenta cuando la cuenta no tiene contraseña). Se guardan en
 * sessionStorage: solo en esta pestaña y se borran al cerrarla.
 */
export type PendingAction = 'set-password' | 'delete-account';

const PENDING_KEY = 'myout.pendingAction';
const PROOF_KEY = 'myout.reauthProof';

function store(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function setPendingAction(action: PendingAction | null): void {
  const s = store();
  try {
    if (action) s?.setItem(PENDING_KEY, action);
    else s?.removeItem(PENDING_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export function pendingAction(): PendingAction | null {
  try {
    const v = store()?.getItem(PENDING_KEY);
    return v === 'set-password' || v === 'delete-account' ? v : null;
  } catch {
    return null;
  }
}

/** La prueba de identidad dura 5 minutos y solo sirve una vez. */
export function saveReauthProof(token: string): void {
  try {
    store()?.setItem(PROOF_KEY, JSON.stringify({ token, at: Date.now() }));
  } catch {
    /* almacenamiento no disponible */
  }
}

export function takeReauthProof(): string | null {
  try {
    const s = store();
    const raw = s?.getItem(PROOF_KEY);
    s?.removeItem(PROOF_KEY);
    if (!raw) return null;
    const { token, at } = JSON.parse(raw) as { token?: string; at?: number };
    return token && at && Date.now() - at < 4.5 * 60 * 1000 ? token : null;
  } catch {
    return null;
  }
}

/** Con sesión: abre Google/Apple/Instagram para conectar la cuenta o confirmar tu identidad. */
export async function openProvider(provider: ProviderSlug, intent: 'link' | 'reauth', action?: PendingAction): Promise<void> {
  const { url } = await oauthApi.prepare(provider, intent);
  if (action) setPendingAction(action);
  window.location.assign(url);
}

export const PROVIDER_LABEL: Record<ProviderSlug, string> = {
  google: t('Google'),
  apple: t('Apple'),
  instagram: t('Instagram'),
};

/** Mensajes de los errores que llegan en #error=... al volver. */
export const OAUTH_ERRORS: Record<string, string> = {
  cancelled: t('Has cancelado el acceso. No se ha cambiado nada.'),
  expired: t('El enlace ha caducado. Vuelve a intentarlo.'),
  browser_mismatch: t('Hay que terminar el acceso en el mismo navegador en el que se empezó. Vuelve a intentarlo.'),
  invalid_state: t('La respuesta no es válida. Vuelve a intentarlo.'),
  provider_error: t('El proveedor no ha respondido bien. Vuelve a intentarlo en un momento.'),
  not_configured: t('Este proveedor no está configurado en el servidor.'),
  email_unverified: t('Tu proveedor no ha verificado tu email. Entra con tu contraseña y conéctalo desde tu perfil.'),
  email_missing: t('El proveedor no ha compartido tu email.'),
  provider_already_linked: t('Tu cuenta ya tiene otra cuenta de ese proveedor conectada. Desconéctala primero.'),
  linked_to_other_user: t('Esa cuenta ya está conectada a otro perfil de MyOO.'),
};
