import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { plansApi, subscriptionsApi, usersApi } from '../api/endpoints';
import type { LimitedResource, Plan, ProviderSlug, UsageEntry, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { RESOURCE_LABEL, formatDate } from '../lib/labels';
import { isNative } from '../lib/native';
import { useAsync } from '../lib/useAsync';
import { useAssetUrl } from '../lib/assetUrl';
import { openProvider, pendingAction, PROVIDER_LABEL, setPendingAction, takeReauthProof } from '../lib/oauthFlow';

/** Plan que se marca como recomendado (si existe). */
const RECOMMENDED = 'PLUS';

/** Orden de los límites en las tarjetas. */
const RESOURCES: LimitedResource[] = ['WARDROBE_ITEMS', 'WARDROBES', 'OUTFITS', 'MANNEQUINS'];

/** Singular para «Hasta 1 …». */
const ONE: Record<LimitedResource, string> = { WARDROBE_ITEMS: 'prenda', WARDROBES: 'armario', OUTFITS: 'outfit', MANNEQUINS: 'maniquí con tus medidas' };

/** Lo que incluyen todos los planes (funciones de la app, sin límites). */
const INCLUDED = ['Visor 3D de cada prenda', 'Personalización de colores, piezas y detalles', 'Maniquíes genéricos de hombre y de mujer'];

function priceParts(plan: Plan): { amount: string; period: string | null } {
  if (plan.priceCents === 0) return { amount: '0 €', period: 'para siempre' };
  const amount = new Intl.NumberFormat('es-ES', { style: 'currency', currency: plan.currency }).format(plan.priceCents / 100);
  return { amount, period: 'al mes' };
}

function limitText(plan: Plan, resource: LimitedResource): string {
  const l = plan.limits.find((x) => x.resource === resource);
  const label = RESOURCE_LABEL[resource].toLowerCase();
  if (!l) return `${RESOURCE_LABEL[resource]}`;
  // «Prendas» es femenino: ilimitadas; armarios y outfits, ilimitados.
  const unlimited = resource === 'WARDROBE_ITEMS' ? 'ilimitadas' : 'ilimitados';
  if (l.isUnlimited) return `${RESOURCE_LABEL[resource]} ${unlimited}`;
  return l.maxCount === 1 ? `1 ${ONE[resource]}` : `Hasta ${l.maxCount} ${label}`;
}

export function AccountPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const mine = useAsync(() => plansApi.mine(), []);
  const plans = useAsync(() => plansApi.list(), []);
  const history = useAsync(() => subscriptionsApi.history(), []);

  const [error, setError] = useState<unknown>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [changedTo, setChangedTo] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Vuelta de confirmar con Google/Apple para borrar una cuenta sin contraseña.
  const [proof, setProof] = useState<string | null>(null);
  const avatar = useAssetUrl(user?.avatarAssetId);
  const back = (location.state ?? {}) as { oauth?: string };
  useEffect(() => {
    if (back.oauth === 'reauth' && pendingAction() === 'delete-account') {
      setPendingAction(null);
      const token = takeReauthProof();
      if (token) {
        setProof(token);
        setDeleting(true);
      }
    }
  }, [back.oauth]);

  async function changePlan(plan: Plan) {
    setChanging(plan.code);
    setChangedTo(null);
    setError(null);
    try {
      await subscriptionsApi.changePlan(plan.code);
      await Promise.all([mine.reload(), history.reload()]);
      setChangedTo(plan.name);
    } catch (err) {
      setError(err);
    } finally {
      setChanging(null);
    }
  }

  const current = mine.data?.plan;
  const name = user?.displayName?.trim() || user?.email?.split('@')[0] || '';
  const initial = (name || '?').charAt(0).toUpperCase();
  const currentPrice = current ? priceParts(current) : null;

  return (
    <section className="page account">
      <header className="account-hero">
        <span className={`avatar${avatar ? ' has-image' : ''}`} aria-hidden="true">
          {avatar ? <img src={avatar} alt="" /> : initial}
        </span>
        <div className="account-who">
          <h1>{name}</h1>
          <p className="muted">
            {user?.email}
            {user?.createdAt ? ` · Miembro desde ${formatDate(user.createdAt)}` : ''}
          </p>
        </div>
        <Link to="/perfil" className="btn">
          Ver tu perfil
        </Link>
        <button type="button" className="btn btn-ghost" onClick={logout}>
          Cerrar sesión
        </button>
      </header>

      <ErrorNote error={error ?? mine.error ?? plans.error} />

      <div className="account-grid">
        <section className="panel plan-now" aria-labelledby="plan-now-title">
          <div className="plan-now-head">
            <div>
              <p className="eyebrow">Tu plan</p>
              <h2 id="plan-now-title">{current?.name ?? '…'}</h2>
            </div>
            {currentPrice && (
              <p className="plan-now-price">
                {currentPrice.amount}
                {currentPrice.period && <span> {currentPrice.period}</span>}
              </p>
            )}
          </div>
          <div className="usage-list">
            {mine.data?.usage.map((u) => <UsageBar key={u.resource} entry={u} />)}
          </div>
          <p className="muted small">
            Si bajas de plan no se borra nada: podrás ver y eliminar lo que tengas, pero no crear más hasta quedar por debajo del límite.
          </p>
        </section>

        <section className="panel" aria-labelledby="profile-title">
          <div>
            <p className="eyebrow">Cuenta</p>
            <h2 id="profile-title">Tus datos</h2>
          </div>
          <dl className="account-facts">
            <div>
              <dt>Correo</dt>
              <dd>
                {user?.email}
                {user?.emailVerified && (
                  <span className="fact-ok">
                    <Icon name="check" size={12} /> verificado
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>@usuario</dt>
              <dd>{user?.username ? `@${user.username}` : '—'}</dd>
            </div>
            <div>
              <dt>Acceso</dt>
              <dd>
                {[
                  user?.hasPassword ? 'Contraseña' : null,
                  ...(user?.accounts ?? []).filter((a) => a.provider !== 'INSTAGRAM').map((a) => PROVIDER_LABEL[a.provider.toLowerCase() as ProviderSlug]),
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </dd>
            </div>
          </dl>
          <div className="actions">
            <Link to="/perfil" className="btn">
              Editar perfil, foto y cuentas
            </Link>
          </div>
        </section>
      </div>

      {/* En la app de Android/iOS no se cambia de plan: las tiendas obligan a cobrar con su
          propio sistema de pagos para las suscripciones digitales. */}
      {!isNative && (
      <section className="plans-section" aria-labelledby="plans-title">
        <div className="plans-intro">
          <h2 id="plans-title">Elige tu plan</h2>
          <p className="muted">Cambia cuando quieras. El cambio es simulado: no se realiza ningún cobro.</p>
          {changedTo && (
            <p className="note plans-note" role="status">
              <Icon name="check" size={14} /> Ahora estás en {changedTo}.
            </p>
          )}
        </div>

        <div className="plans">
          {plans.data?.map((plan) => {
            const isCurrent = plan.id === current?.id;
            const recommended = plan.code === RECOMMENDED;
            const upgrade = current ? plan.priceCents > current.priceCents : true;
            const { amount, period } = priceParts(plan);
            return (
              <article key={plan.id} className={`plan${isCurrent ? ' is-current' : ''}${recommended ? ' is-recommended' : ''}`}>
                {(recommended || isCurrent) && <span className="plan-badge">{isCurrent ? 'Tu plan' : 'Recomendado'}</span>}
                <h3>{plan.name}</h3>
                {plan.description && <p className="plan-desc">{plan.description}</p>}
                <p className="plan-price">
                  {amount}
                  {period && <span className="plan-period">{period}</span>}
                </p>
                <ul className="plan-limits">
                  {RESOURCES.map((r) => (
                    <li key={r}>
                      <Icon name="check" size={14} />
                      {limitText(plan, r)}
                    </li>
                  ))}
                </ul>
                <div className="plan-cta">
                  {isCurrent ? (
                    <button type="button" className="btn btn-block" disabled>
                      Plan actual
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`btn btn-block${upgrade && recommended ? ' btn-primary' : ''}`}
                      disabled={changing !== null || !current}
                      onClick={() => changePlan(plan)}
                    >
                      {changing === plan.code ? 'Cambiando…' : upgrade ? `Pasar a ${plan.name}` : `Bajar a ${plan.name}`}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {plans.loading && !plans.data && Array.from({ length: 4 }, (_, i) => <div key={i} className="plan is-skeleton" aria-hidden="true" />)}
        </div>

        <div className="plans-included">
          <span className="muted small">Todos los planes incluyen:</span>
          {INCLUDED.map((f) => (
            <span key={f} className="included-item">
              <Icon name="check" size={14} /> {f}
            </span>
          ))}
        </div>
      </section>
      )}

      <section className="panel history" aria-labelledby="history-title">
        <h2 id="history-title">Historial de suscripciones</h2>
        {history.data && history.data.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Plan</th>
                <th scope="col">Estado</th>
                <th scope="col">Desde</th>
                <th scope="col">Hasta</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((s) => (
                <tr key={s.id}>
                  <td>{s.plan.name}</td>
                  <td>
                    <span className={`status status-${s.status.toLowerCase()}`}>
                      {{ ACTIVE: 'Activa', CANCELED: 'Cancelada', EXPIRED: 'Caducada' }[s.status]}
                    </span>
                  </td>
                  <td>{formatDate(s.startedAt)}</td>
                  <td>{s.endsAt ? formatDate(s.endsAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Sin suscripciones: estás en el plan gratuito por defecto.</p>
        )}
      </section>

      <section className="panel danger-zone" aria-labelledby="delete-title">
        <div>
          <h2 id="delete-title">Eliminar la cuenta</h2>
          <p className="muted">
            Se borran para siempre tu cuenta, tus armarios, prendas, outfits e imágenes. No se puede deshacer.
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-danger-solid" onClick={() => setDeleting(true)}>
            Eliminar mi cuenta
          </button>
        </div>
      </section>

      {deleting && user && (
        <DeleteAccountDialog
          user={user}
          proof={proof}
          onClose={() => {
            setDeleting(false);
            setProof(null);
          }}
          onDeleted={logout}
        />
      )}
    </section>
  );
}

/**
 * Confirma el borrado de la cuenta: con la contraseña actual o, si la cuenta
 * no tiene contraseña, volviendo a entrar con Google/Apple.
 */
function DeleteAccountDialog({
  user,
  proof,
  onClose,
  onDeleted,
}: {
  user: User;
  proof: string | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const providers = user.accounts.filter((a) => a.provider !== 'INSTAGRAM').map((a) => a.provider.toLowerCase() as ProviderSlug);
  const withPassword = user.hasPassword;

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await usersApi.remove(withPassword ? { password } : { reauthToken: proof ?? undefined });
      onDeleted();
    } catch (err) {
      const status = (err as { status?: number }).status;
      setError(
        status === 403
          ? new Error(withPassword ? 'La contraseña no es correcta.' : 'La confirmación ha caducado. Vuelve a confirmar tu identidad.')
          : err,
      );
      setBusy(false);
    }
  }

  async function reauth(slug: ProviderSlug) {
    setError(null);
    try {
      await openProvider(slug, 'reauth', 'delete-account');
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Modal title="Eliminar la cuenta" onClose={busy ? () => undefined : onClose}>
      <form className="stack" onSubmit={confirm}>
        <p>
          Vas a borrar tu cuenta y <strong>todo</strong> lo que tienes en MyOut. Esta acción no se puede deshacer.
        </p>
        {withPassword ? (
          <label className="field">
            <span>Escribe tu contraseña para confirmar</span>
            <input
              type="password"
              required
              maxLength={128}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        ) : proof ? (
          <p className="note" role="status">
            <Icon name="check" size={14} /> Identidad confirmada. Tienes unos minutos para terminar.
          </p>
        ) : (
          <div className="stack">
            <p className="muted">Tu cuenta no tiene contraseña: confirma que eres tú volviendo a entrar.</p>
            <div className="actions">
              {providers.map((slug) => (
                <button key={slug} type="button" className="btn" onClick={() => reauth(slug)}>
                  Confirmar con {PROVIDER_LABEL[slug]}
                </button>
              ))}
            </div>
          </div>
        )}
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-danger-solid" disabled={busy || (withPassword ? !password : !proof)}>
            {busy ? 'Eliminando…' : 'Eliminar para siempre'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UsageBar({ entry }: { entry: UsageEntry }) {
  const ratio = entry.isUnlimited || !entry.max ? 0 : Math.min(1, entry.used / entry.max);
  const full = !entry.isUnlimited && entry.max !== null && entry.used >= entry.max;
  const near = !full && ratio >= 0.8;
  return (
    <div className={`usage${full ? ' is-full' : near ? ' is-near' : ''}${entry.isUnlimited ? ' is-unlimited' : ''}`}>
      <div className="usage-label">
        <span>{RESOURCE_LABEL[entry.resource]}</span>
        <span className="usage-count">
          {entry.used} <span className="muted">/ {entry.isUnlimited ? '∞' : entry.max}</span>
        </span>
      </div>
      <div className="usage-track" role="progressbar" aria-valuemin={0} aria-valuemax={entry.max ?? undefined} aria-valuenow={entry.used} aria-label={RESOURCE_LABEL[entry.resource]}>
        <div className="usage-fill" style={{ width: `${entry.isUnlimited ? 100 : ratio * 100}%` }} />
      </div>
    </div>
  );
}
