import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { oauthApi } from '../api/endpoints';
import type { GarmentLike, ProviderSlug } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Logo } from '../components/Logo';
import { banFromError, banMessage } from '../lib/ban';
import { useAsync } from '../lib/useAsync';
import { OutfitStage } from '../three/OutfitMannequin';

/** Outfit de muestra para la pantalla de acceso (no viene de la API). */
const SAMPLE: GarmentLike[] = [
  { color: '#5C5C62', attributes: { closure: 'open' }, garmentType: { modelKey: 'jacket', category: 'OUTERWEAR' } },
  { color: '#E2E0DB', attributes: { sleeve: 'short' }, garmentType: { modelKey: 'tshirt', category: 'TOP' } },
  { color: '#2B3445', attributes: { fit: 'slim' }, garmentType: { modelKey: 'pants', category: 'BOTTOM' } },
  { color: '#3B2F2A', attributes: { shaft: 'ankle' }, garmentType: { modelKey: 'boots', category: 'FOOTWEAR' } },
  { color: '#202022', attributes: {}, garmentType: { modelKey: 'cap', category: 'ACCESSORY' } },
];

/** Cuenta del seed local (solo se ofrece en desarrollo). */
const DEMO = { email: 'demo@myout.dev', password: 'Demo1234!' };

/** Mismas reglas que el backend: 8+ caracteres, con letras y números. */
function passwordChecks(p: string) {
  return [
    { ok: p.length >= 8, label: '8 caracteres o más' },
    { ok: /[A-Za-zÀ-ÿ]/.test(p) && /\d/.test(p), label: 'Letras y números' },
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

const STRENGTH_LABEL = ['', 'Floja', 'Aceptable', 'Fuerte'] as const;

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

  if (user) return <Navigate to="/" replace />;

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
      navigate('/', { replace: true });
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
    <div className="auth">
      {/* La calle: pared, farola y el logo pintado con spray */}
      <div className="auth-street">
        <Logo className="auth-piece" />
        <div className="auth-grain" aria-hidden="true" />
      </div>

      <div className="auth-stage" aria-hidden="true">
        <OutfitStage garments={SAMPLE} />
      </div>

      <main className="auth-panel">
        <div className="auth-card">
          <p className="auth-lead">Tu armario, prenda a prenda, en 3D.</p>

          <nav className="auth-tabs" aria-label="Acceso">
            <Link to="/login" className="auth-tab" aria-current={isLogin ? 'page' : undefined} replace>
              Entrar
            </Link>
            <Link to="/register" className="auth-tab" aria-current={!isLogin ? 'page' : undefined} replace>
              Crear cuenta
            </Link>
          </nav>

          <form className="stack auth-form" onSubmit={submit}>
            <h1 className="auth-title spray-title">{isLogin ? 'Vuelve a tu armario' : 'Empieza tu armario'}</h1>

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
                      Continuar con {p === 'google' ? 'Google' : 'Apple'}
                    </a>
                  ))}
                </div>
                <p className="auth-divider">
                  <span>o con tu email</span>
                </p>
              </>
            )}

            {!isLogin && (
              <label className="field">
                <span>Nombre (opcional)</span>
                <input maxLength={60} value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="nickname" />
              </label>
            )}

            <label className="field">
              <span>Email</span>
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
            </label>

            <div className="field">
              <label htmlFor={`${ids}-pw`} className="field-label">
                Contraseña
              </label>
              <div className="input-affix">
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
                  className="affix-btn"
                  aria-pressed={showPassword}
                  aria-controls={`${ids}-pw`}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <div id={`${ids}-pw-help`} className="pw-help" aria-live="polite">
                {capsLock && <small className="pw-caps">Bloq Mayús está activado</small>}
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

            <button type="submit" className="btn btn-primary btn-block btn-spray" disabled={busy} aria-busy={busy}>
              {busy && <span className="spinner" aria-hidden="true" />}
              {busy ? 'Un momento…' : isLogin ? 'Entrar' : 'Crear cuenta'}
            </button>

            {isLogin && import.meta.env.DEV && (
              <button type="button" className="btn btn-ghost btn-block" onClick={fillDemo}>
                Usar la cuenta de prueba local
              </button>
            )}
          </form>

          <p className="auth-switch">
            {isLogin ? (
              <>
                ¿Aún no tienes cuenta?{' '}
                <Link to="/register" replace>
                  Crea una gratis
                </Link>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{' '}
                <Link to="/login" replace>
                  Entra
                </Link>
              </>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
