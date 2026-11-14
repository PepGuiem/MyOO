import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, tokenStore } from '../api/client';
import { banFromError, banMessage } from '../lib/ban';
import { oauthApi, usersApi } from '../api/endpoints';
import type { ProviderSlug } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { Logo } from '../components/Logo';
import { Spinner } from '../components/Spinner';
import { OAUTH_ERRORS, PROVIDER_LABEL, pendingAction, saveReauthProof, setPendingAction } from '../lib/oauthFlow';
import { locale, t, toAccountLocale } from '../i18n';

/**
 * Vuelta de Google, Apple o Instagram. El backend ya ha comprobado todo con
 * el proveedor y deja en el fragmento de la URL (#result=...) un código de un
 * solo uso, que aquí se canjea por la sesión o para conectar la cuenta.
 */
export function AuthCallbackPage() {
  const { user, loading, completeAuth, refreshUser } = useAuth();
  const navigate = useNavigate();
  // El fragmento se lee una vez y se borra de la barra de direcciones.
  const [params] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const provider = (params.get('provider') ?? '') as ProviderSlug;
  const name = PROVIDER_LABEL[provider] ?? t('el proveedor');

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (loading || started.current) return;
    started.current = true;
    const failed = params.get('error');
    const result = params.get('result');
    const intent = params.get('intent');
    if (failed || !result) {
      setPendingAction(null);
      setError(OAUTH_ERRORS[failed ?? ''] ?? t('No se ha podido completar el acceso.'));
      return;
    }

    void (async () => {
      try {
        if (intent === 'login') {
          let res = await oauthApi.exchange(result);
          // Cuenta recién creada con Google/Apple: se queda con el idioma de esta página.
          if (res.created && res.user.locale !== toAccountLocale(locale)) {
            tokenStore.set(res.accessToken);
            res = { ...res, user: await usersApi.update({ locale: toAccountLocale(locale) }) };
          }
          completeAuth(res);
          navigate(res.created ? '/perfil' : '/', {
            replace: true,
            state: { welcome: res.created, passwordRemoved: res.passwordRemoved },
          });
          return;
        }
        if (!user) {
          setError(t('Tu sesión ha caducado. Entra de nuevo y vuelve a intentarlo.'));
          return;
        }
        const r = await oauthApi.exchangeForUser(result);
        if (r.intent === 'reauth') saveReauthProof(r.reauthToken);
        await refreshUser().catch(() => null);
        const action = pendingAction();
        navigate(action === 'delete-account' ? '/account' : '/perfil', {
          replace: true,
          state: { oauth: r.intent, provider: r.provider },
        });
      } catch (err) {
        setPendingAction(null);
        const ban = banFromError(err);
        if (ban) {
          setError(banMessage(ban));
          return;
        }
        const code = err instanceof ApiError && typeof err.body?.code === 'string' ? err.body.code : '';
        setError(OAUTH_ERRORS[code] ?? (err instanceof Error ? err.message : t('No se ha podido completar el acceso.')));
      }
    })();
  }, [loading, params, user, completeAuth, refreshUser, navigate]);

  return (
    <div className="callback-page">
      <div className="callback-card">
        <Logo className="callback-logo" decorative />
        {error ? (
          <>
            <h1 className="spray-title">{t('No ha podido ser')}</h1>
            <p className="note note-error" role="alert">
              {error}
            </p>
            <Link className="btn btn-primary" to={user ? '/perfil' : '/login'} replace>
              {user ? t('Volver a tu perfil') : t('Volver a entrar')}
            </Link>
          </>
        ) : (
          <Spinner size={26} label={t('Conectando con {name}…', { name })} />
        )}
      </div>
    </div>
  );
}
