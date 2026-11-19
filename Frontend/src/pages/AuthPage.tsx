import { useId, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { oauthApi } from '../api/endpoints';
import type { GarmentLike, ProviderSlug } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon, type IconName } from '../components/Icon';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { Logo } from '../components/Logo';
import { banFromError, banMessage } from '../lib/ban';
import { useAsync } from '../lib/useAsync';
import { OutfitStage } from '../three/OutfitMannequin';
import { t } from '../i18n';

/** Outfit de muestra para la pantalla de acceso (no viene de la API). */
const SAMPLE: GarmentLike[] = [
  { color: '#5C5C62', attributes: { closure: 'open' }, garmentType: { modelKey: 'jacket', category: 'OUTERWEAR' } },
  { color: '#E2E0DB', attributes: { sleeve: 'short' }, garmentType: { modelKey: 'tshirt', category: 'TOP' } },
  { color: '#2B3445', attributes: { fit: 'slim' }, garmentType: { modelKey: 'pants', category: 'BOTTOM' } },
  { color: '#3B2F2A', attributes: { shaft: 'ankle' }, garmentType: { modelKey: 'boots', category: 'FOOTWEAR' } },
  { color: '#202022', attributes: {}, garmentType: { modelKey: 'cap', category: 'ACCESSORY' } },
];

/** Lo que hay dentro (funciones reales de la app), como pegatinas en la pared. */
const PERKS: { icon: IconName; text: string }[] = [
  { icon: 'tshirt', text: t('Tu ropa en 3D') },
  { icon: 'sparkles', text: t('Estilista propio') },
  { icon: 'trophy', text: t('Batallas de outfits') },
];

/** Cuenta del seed local (solo se ofrece en desarrollo). */
const DEMO = { email: 'demo@myout.dev', password: 'Demo1234!' };

/** Mismas reglas que el backend: 8+ caracteres, con letras y números. */
function passwordChecks(p: string) {
  return [
    { ok: p.length >= 8, label: t('8 caracteres o más') },
    { ok: /[A-Za-zÀ-ÿ]/.test(p) && /\d/.test(p), label: t('Letras y números') },
  ];
}

function strength(p: string): 0 | 1 | 2 | 3 {
  if (!p) return 0;
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Za-zÀ-ÿ]/.test(p) && /\d/.test(p)) s++;
  if (p.length >= 12 || /[^A-Za-z0-9]/.test(p)) s++;
  return Math.max(1, s) as 1 | 2 | 3;
}

const STRENGTH_LABEL = ['', t('Floja'), t('Aceptable'), t('Fuerte')] as const;

/** En móvil no se enfoca solo: abriría el teclado y taparía la pantalla. */
const FINE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches;

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register, banned, clearBanned } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const ids = useId();
  const providers = useAsync(() => oauthApi.providers(), []);
  const [leaving, setLeaving] = useState<ProviderSlug | null>(null);
  // Al entrar se vuelve a la página que se quería abrir (p. ej. un perfil
  // escaneado con su QR), no siempre al inicio.
  const location = useLocation();
  const back = returnPath(location.state);

  if (user) return <Navigate to={back} replace />;

  const social = (['google', 'apple'] as const).filter((p) => providers.data?.[p]);

  const isLogin = mode === 'login';
  // Suspendida: al entrar (403 "banned") o porque se cerró la sesión por eso.
  const suspended = banFromError(error) ?? banned;
  const checks = passwordChecks(password);
  const level = strength(password);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    clearBanned();
    try {
      if (isLogin) await login(email.trim(), password);
      else await register(email.trim(), password, displayName.trim());
      navigate(back, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function onPasswordKey(e: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(e.getModifierState?.('CapsLock') ?? false);
  }

  function fillDemo() {
    setEmail(DEMO.email);
    setPassword(DEMO.password);
    setError(null);
  }

  return (
    <div className="auth au">
      {/* La calle: pared, farola y el logo pintado con spray */}
      <div className="auth-street">
        <Logo className="auth-piece" />
        <div className="auth-grain" aria-hidden="true" />
        <span className="au-wash" aria-hidden="true" />
        <span className="au-tube au-tube-a" aria-hidden="true" />
        <span className="au-tube au-tube-b" aria-hidden="true" />
        <span className="au-floor" aria-hidden="true" />
      </div>

      <ul className="au-perks" aria-label={t('Qué hay dentro')}>
        {PERKS.map((p, i) => (
          <li key={p.text} style={{ '--i': i } as CSSProperties}>
            <Icon name={p.icon} size={14} /> {p.text}
          </li>
        ))}
      </ul>

      <div className="auth-stage" aria-hidden="true">
        <OutfitStage garments={SAMPLE} />
      </div>

      <main className="auth-panel">
        <div className="auth-card">
          <LanguageSwitch compact />
          <span className="wd-kicker au-kicker">
            <Icon name="hanger" size={12} /> {t('Members only')}
          </span>
          <p className="auth-lead">{t('Tu armario, prenda a prenda, en 3D.')}</p>

          <nav className="auth-tabs" aria-label={t('Acceso')}>
            <Link to="/login" state={location.state} className="auth-tab" aria-current={isLogin ? 'page' : undefined} replace>
              {t('Entrar')}
            </Link>
            <Link to="/register" state={location.state} className="auth-tab" aria-current={!isLogin ? 'page' : undefined} replace>
              {t('Crear cuenta')}
            </Link>
          </nav>

          <form className="stack auth-form" onSubmit={submit}>
            <h1 key={mode} className="auth-title au-title">
              {isLogin ? t('Vuelve a tu armario') : t('Empieza tu armario')}
            </h1>

            {social.length > 0 && (
              <>
                {/* Enlaces normales: el navegador va al backend y de ahí a Google/Apple. */}
                <div className="social-buttons">
                  {social.map((p) => (
                    <a
                      key={p}
                      href={oauthApi.loginUrl(p)}
                      className={`btn btn-block social-btn social-${p}`}
                      aria-busy={leaving === p}
                      onClick={() => setLeaving(p)}
                    >
                      {leaving === p && <span className="spinner" aria-hidden="true" />}
                      {t('Continuar con {v}', { v: p === 'google' ? t('Google') : t('Apple') })}
                    </a>
                  ))}
                </div>
                <p className="auth-divider">
                  <span>{t('o con tu email')}</span>
                </p>
              </>
            )}

            {!isLogin && (
              <label className="field">
                <span>{t('Nombre (opcional)')}</span>
                <span className="au-input">
                  <Icon name="users" size={16} />
                  <input maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
                </span>
              </label>
            )}

            <label className="field">
              <span>{t('Email')}</span>
              <span className="au-input">
                <Icon name="mail" size={16} />
                <input
                type="email"
                required
                autoFocus={FINE_POINTER}
                inputMode="email"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete={isLogin ? 'username' : 'email'}
              />
              </span>
            </label>

            <div className="field">
              <label htmlFor={`${ids}-pw`} className="field-label">
                {t('Contraseña')}
              </label>
              <div className="input-affix au-input">
                <Icon name="lock" size={16} />
                <input
                  id={`${ids}-pw`}
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={isLogin ? 1 : 8}
                  maxLength={128}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={onPasswordKey}
                  onKeyDown={onPasswordKey}
                  onBlur={() => setCapsLock(false)}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  aria-describedby={`${ids}-pw-help`}
                />
                <button
                  type="button"
                  className="affix-btn au-eye"
                  aria-pressed={showPassword}
                  aria-controls={`${ids}-pw`}
                  title={showPassword ? t('Ocultar') : t('Mostrar')}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={17} />
                  <span className="visually-hidden">{showPassword ? t('Ocultar contraseña') : t('Mostrar contraseña')}</span>
                </button>
              </div>
              <div id={`${ids}-pw-help`} className="pw-help" aria-live="polite">
                {capsLock && <small className="pw-caps">{t('Bloq Mayús está activado')}</small>}
                {!isLogin && (
                  <>
                    <div className={`pw-meter level-${level}`} aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </div>
                    <ul className="pw-checks">
                      {checks.map((c) => (
                        <li key={c.label} className={c.ok ? 'is-ok' : undefined}>
                          {c.label}
                        </li>
                      ))}
                      {level > 0 && <li className="pw-level">{STRENGTH_LABEL[level]}</li>}
                    </ul>
                  </>
                )}
              </div>
            </div>

            {suspended ? (
              <p className="note note-error note-banned" role="alert">
                {banMessage(suspended)}
              </p>
            ) : (
              <ErrorNote error={error} />
            )}

            <button type="submit" className="btn btn-primary btn-block au-cta" disabled={busy} aria-busy={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              <span>{busy ? t('Un momento…') : isLogin ? t('Entrar') : t('Crear cuenta')}</span>
              {!busy && <Icon name="forward" size={16} />}
            </button>

            {isLogin && import.meta.env.DEV && (
              <button type="button" className="btn btn-ghost btn-block" onClick={fillDemo}>
                {t('Usar la cuenta de prueba local')}
              </button>
            )}
          </form>

          <p className="auth-switch">
            {isLogin ? (
              <>
                {t('¿Aún no tienes cuenta?')}{' '}
                <Link to="/register" state={location.state} replace>
                  {t('Crea una gratis')}
                </Link>
              </>
            ) : (
              <>
                {t('¿Ya tienes cuenta?')}{' '}
                <Link to="/login" state={location.state} replace>
                  {t('Entra')}
                </Link>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}

/** Ruta a la que volver tras entrar (la guarda RequireAuth); solo rutas internas. */
function returnPath(state: unknown): string {
  const from = (state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const path = from?.pathname;
  if (!path || !path.startsWith('/') || path.startsWith('//') || path === '/login' || path === '/register') return '/';
  return path + (from?.search ?? '');
}
