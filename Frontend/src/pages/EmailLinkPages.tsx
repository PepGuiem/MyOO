import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { authApi, mailApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon, type IconName } from '../components/Icon';
import { Logo } from '../components/Logo';
import { Spinner } from '../components/Spinner';
import { explain } from '../lib/apiErrors';
import { useAsync } from '../lib/useAsync';
import { t } from '../i18n';

/**
 * Páginas a las que llevan los enlaces de los correos (públicas, también sin
 * sesión): contraseña olvidada, contraseña nueva, confirmar el email y dejar
 * de recibir avisos. Mismo marco sencillo que las páginas legales.
 */

/** Errores de los enlaces del correo, explicados. */
const LINK_ERRORS: Record<string, string> = {
  token_expired: t('El enlace ha caducado. Pide uno nuevo.'),
  token_used: t('Este enlace ya se ha usado. Si lo necesitas, pide uno nuevo.'),
  token_invalid: t('El enlace no es válido. Comprueba que lo has copiado entero o pide uno nuevo.'),
  mail_disabled: t('El correo no está disponible ahora mismo.'),
};

/**
 * Lee `?token=` y lo quita de la barra de direcciones (así no queda en el
 * historial ni se envía a otras páginas como «referer»).
 */
function useLinkToken(): string {
  const location = useLocation();
  const [token] = useState(() => new URLSearchParams(location.search).get('token') ?? '');
  useEffect(() => {
    if (window.location.search.includes('token=')) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, []);
  return token;
}

function MailFrame({ icon, kicker, title, children }: { icon: IconName; kicker: string; title: string; children: ReactNode }) {
  return (
    <div className="legal-page ux">
      <main className="legal-card mail-card" aria-labelledby="mail-title">
        <Link to="/" className="legal-brand" aria-label={t('MyOO, inicio')}>
          <Logo className="legal-logo" decorative />
        </Link>
        <span className="wd-kicker">
          <Icon name={icon} size={12} /> {kicker}
        </span>
        <h1 id="mail-title" className="wd-title mail-title" data-text={title}>
          {title}
        </h1>
        {children}
      </main>
    </div>
  );
}

function Done({ children }: { children: ReactNode }) {
  return (
    <p className="note mail-done" role="status">
      <Icon name="check" size={14} /> <span>{children}</span>
    </p>
  );
}

/** /forgot-password: pide el enlace para cambiar la contraseña. */
export function ForgotPasswordPage() {
  const location = useLocation();
  const config = useAsync(() => mailApi.config(), []);
  const [email, setEmail] = useState(() => (location.state as { email?: string } | null)?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await authApi.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(explain(err, LINK_ERRORS));
    } finally {
      setBusy(false);
    }
  }

  return (
    <MailFrame icon="lock" kicker={t('Acceso')} title={t('¿Olvidaste tu contraseña?')}>
      {config.loading ? (
        <Spinner size={20} label={t('Cargando…')} />
      ) : config.data && !config.data.enabled ? (
        <p className="muted">
          {t('La recuperación por correo no está disponible ahora mismo. Si entras con Google o Apple, usa ese botón en la pantalla de acceso.')}
        </p>
      ) : sent ? (
        <Done>{t('Si hay una cuenta con ese email, te hemos enviado un enlace para elegir una contraseña nueva. Vale 1 hora. Mira también en la carpeta de spam.')}</Done>
      ) : (
        <form className="stack mail-form" onSubmit={submit}>
          <p className="muted">{t('Escribe el email de tu cuenta y te mandamos un enlace para elegir una contraseña nueva.')}</p>
          <label className="field">
            <span>{t('Email')}</span>
            <input
              type="email"
              required
              maxLength={254}
              inputMode="email"
              spellCheck={false}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <ErrorNote error={error ?? config.error} />
          <button type="submit" className="btn btn-primary btn-block mail-cta" disabled={busy} aria-busy={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            <span>{busy ? t('Un momento…') : t('Enviar enlace')}</span>
          </button>
        </form>
      )}
      <Link to="/login" className="btn wd-btn-line mail-back">
        <Icon name="back" size={14} /> <span>{t('Volver a entrar')}</span>
      </Link>
    </MailFrame>
  );
}

/** /reset-password?token=…: elige la contraseña nueva. */
export function ResetPasswordPage() {
  const token = useLinkToken();
  const { user, logout } = useAuth();
  const ids = useId();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const okLength = password.length >= 8;
  const okMix = /[A-Za-zÀ-ÿ]/.test(password) && /\d/.test(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== repeat) {
      setError(new Error(t('Las contraseñas no coinciden.')));
      return;
    }
    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      // El servidor ha cerrado todas las sesiones: también la de este navegador.
      if (user) logout();
    } catch (err) {
      setError(explain(err, LINK_ERRORS));
    } finally {
      setBusy(false);
    }
  }

  return (
    <MailFrame icon="lock" kicker={t('Acceso')} title={t('Contraseña nueva')}>
      {!token ? (
        <p className="note note-error" role="alert">{LINK_ERRORS.token_invalid}</p>
      ) : done ? (
        <>
          <Done>{t('Contraseña cambiada. Hemos cerrado la sesión en todos tus dispositivos: entra con la nueva.')}</Done>
          <Link to="/login" className="btn btn-primary mail-cta">
            <span>{t('Entrar')}</span> <Icon name="forward" size={16} />
          </Link>
        </>
      ) : (
        <form className="stack mail-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor={`${ids}-pw`} className="field-label">
              {t('Contraseña nueva')}
            </label>
            <input
              id={`${ids}-pw`}
              type={show ? 'text' : 'password'}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <ul className="pw-checks">
              <li className={okLength ? 'is-ok' : undefined}>{t('8 caracteres o más')}</li>
              <li className={okMix ? 'is-ok' : undefined}>{t('Letras y números')}</li>
            </ul>
          </div>
          <label className="field">
            <span>{t('Repite la contraseña')}</span>
            <input
              type={show ? 'text' : 'password'}
              required
              maxLength={128}
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
            />
          </label>
          <label className="check mail-check">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> {t('Mostrar contraseña')}
          </label>
          <ErrorNote error={error} />
          <button type="submit" className="btn btn-primary btn-block mail-cta" disabled={busy || !okLength || !okMix} aria-busy={busy}>
            {busy && <span className="spinner" aria-hidden="true" />}
            <span>{busy ? t('Un momento…') : t('Guardar contraseña')}</span>
          </button>
        </form>
      )}
      {!done && (
        <Link to="/forgot-password" className="btn wd-btn-line mail-back">
          <Icon name="mail" size={14} /> <span>{t('Pedir otro enlace')}</span>
        </Link>
      )}
    </MailFrame>
  );
}

/** /verify-email?token=…: confirma el email al abrir el enlace. */
export function VerifyEmailPage() {
  const token = useLinkToken();
  const { user, loading, refreshUser } = useAuth();
  const [state, setState] = useState<'busy' | 'ok' | 'error'>(token ? 'busy' : 'error');
  const [error, setError] = useState<unknown>(token ? null : new Error(LINK_ERRORS.token_invalid));
  const started = useRef(false);

  useEffect(() => {
    // Una sola vez (en desarrollo React monta dos veces los efectos).
    if (!token || started.current) return;
    started.current = true;
    authApi
      .verifyEmail(token)
      .then(() => setState('ok'))
      .catch((err: unknown) => {
        setError(explain(err, LINK_ERRORS));
        setState('error');
      });
  }, [token]);

  // Con sesión, la cuenta se actualiza para que desaparezca el aviso.
  useEffect(() => {
    if (state === 'ok' && user && !user.emailVerified) refreshUser().catch(() => null);
  }, [state, user, refreshUser]);

  return (
    <MailFrame icon="mail" kicker={t('Cuenta')} title={t('Confirmar email')}>
      {state === 'busy' && <Spinner size={20} label={t('Confirmando…')} />}
      {state === 'ok' && <Done>{t('Email confirmado. ¡Gracias!')}</Done>}
      {state === 'error' && (
        <>
          <ErrorNote error={error} />
          {user && <p className="muted">{t('Puedes pedir otro enlace desde tu cuenta.')}</p>}
        </>
      )}
      {!loading && (
        <Link to={user ? '/account' : '/login'} className="btn wd-btn-line mail-back">
          <Icon name="forward" size={14} /> <span>{user ? t('Ir a tu cuenta') : t('Entrar')}</span>
        </Link>
      )}
    </MailFrame>
  );
}

/** /email-preferences?token=…: dejar de recibir un tipo de aviso desde el correo. */
export function EmailPreferencesPage() {
  const token = useLinkToken();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'payments' | 'chat' | null>(null);
  const [error, setError] = useState<unknown>(token ? null : new Error(LINK_ERRORS.token_invalid));

  async function unsubscribe() {
    setBusy(true);
    setError(null);
    try {
      const r = await mailApi.unsubscribe(token);
      setDone(r.kind);
    } catch (err) {
      setError(explain(err, LINK_ERRORS));
    } finally {
      setBusy(false);
    }
  }

  return (
    <MailFrame icon="mail" kicker={t('Avisos por correo')} title={t('Dejar de recibir avisos')}>
      {done ? (
        <Done>
          {done === 'payments'
            ? t('Listo: ya no te mandaremos avisos de pagos por correo.')
            : t('Listo: ya no te mandaremos avisos de mensajes por correo.')}
        </Done>
      ) : (
        <>
          <p className="muted">{t('Deja de recibir por correo este tipo de aviso. Puedes volver a activarlo cuando quieras desde tu cuenta.')}</p>
          <ErrorNote error={error} />
          {token && (
            <button type="button" className="btn btn-primary mail-cta" disabled={busy} aria-busy={busy} onClick={() => void unsubscribe()}>
              {busy && <span className="spinner" aria-hidden="true" />}
              <span>{busy ? t('Un momento…') : t('Dejar de recibirlos')}</span>
            </button>
          )}
        </>
      )}
      <Link to={user ? '/account' : '/login'} className="btn wd-btn-line mail-back">
        <Icon name="forward" size={14} /> <span>{user ? t('Ir a tu cuenta') : t('Entrar')}</span>
      </Link>
    </MailFrame>
  );
}
