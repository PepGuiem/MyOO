import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { plansApi, subscriptionsApi, usersApi } from '../api/endpoints';
import type { LimitedResource, Plan, ProviderSlug, UsageEntry, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon, type IconName } from '../components/Icon';
import { SectionHead } from '../components/street/SectionHead';
import { CountUp } from '../components/street/Street';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { Modal } from '../components/Modal';
import { RESOURCE_LABEL, formatDate } from '../lib/labels';
import { isNative } from '../lib/native';
import { useAsync } from '../lib/useAsync';
import { useAssetUrl } from '../lib/assetUrl';
import { openProvider, pendingAction, PROVIDER_LABEL, setPendingAction, takeReauthProof } from '../lib/oauthFlow';
import { LOCALE_TAG, t } from '../i18n';

/** Plan que se marca como recomendado (si existe). */
const RECOMMENDED = 'PLUS';

/** Orden de los límites en las tarjetas. */
const RESOURCES: LimitedResource[] = ['WARDROBE_ITEMS', 'WARDROBES', 'OUTFITS', 'MANNEQUINS'];

/** Singular para «Hasta 1 …». */
const ONE: Record<LimitedResource, string> = { WARDROBE_ITEMS: t('prenda'), WARDROBES: t('armario'), OUTFITS: t('outfit'), MANNEQUINS: t('maniquí con tus medidas') };

/** Lo que incluyen todos los planes (funciones de la app, sin límites). */
const INCLUDED = [t('Visor 3D de cada prenda'), t('Personalización de colores, piezas y detalles'), t('Maniquíes genéricos de hombre y de mujer')];

function priceParts(plan: Plan): { amount: string; period: string | null } {
  if (plan.priceCents === 0) return { amount: '0 €', period: t('para siempre') };
  const amount = new Intl.NumberFormat(LOCALE_TAG, { style: 'currency', currency: plan.currency }).format(plan.priceCents / 100);
  return { amount, period: t('al mes') };
}

function limitText(plan: Plan, resource: LimitedResource): string {
  const l = plan.limits.find((x) => x.resource === resource);
  const label = RESOURCE_LABEL[resource].toLowerCase();
  if (!l) return `${RESOURCE_LABEL[resource]}`;
  // «Prendas» es femenino: ilimitadas; armarios y outfits, ilimitados.
  if (l.isUnlimited)
    return resource === 'WARDROBE_ITEMS'
      ? t('{label} ilimitadas', { label: RESOURCE_LABEL[resource], lower: label })
      : t('{label} ilimitados', { label: RESOURCE_LABEL[resource], lower: label });
  return l.maxCount === 1 ? `1 ${ONE[resource]}` : t('Hasta {maxCount} {label}', { maxCount: l.maxCount, label });
}

const USAGE_ICON: Record<LimitedResource, IconName> = {
  WARDROBES: 'wardrobe',
  WARDROBE_ITEMS: 'tshirt',
  OUTFITS: 'layers',
  MANNEQUINS: 'userCheck',
};

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
    <section className="page account ux ac">
      <header className="account-hero ux-head">
        <span className={`avatar${avatar ? ' has-image' : ''}`} aria-hidden="true">
          {avatar ? <img src={avatar} alt="" /> : initial}
        </span>
        <div className="account-who">
          <span className="wd-kicker">
            <Icon name="key" size={12} /> {t('Your account')}
          </span>
          <h1 className="wd-title ux-title" data-text={name}>
            {name}
          </h1>
          <p className="ux-lede">
            {user?.email}
            {user?.createdAt ? t(' · Miembro desde {formatDate}', { formatDate: formatDate(user.createdAt) }) : ''}
          </p>
        </div>
        <div className="wd-head-actions">
          <Link to="/perfil" className="btn wd-btn-line">
            <Icon name="eye" size={14} /> <span>{t('Ver tu perfil')}</span>
          </Link>
          <button type="button" className="btn wd-btn-line" onClick={logout}>
            <Icon name="back" size={14} /> <span>{t('Cerrar sesión')}</span>
          </button>
        </div>
      </header>

      {mine.data && (
        <ul className="wd-stats ux-stats" aria-label={t('Resumen')}>
          {mine.data.usage.map((u, i) => (
            <li key={u.resource} style={{ '--i': i } as CSSProperties}>
              <Icon name={USAGE_ICON[u.resource]} size={16} />
              <strong>
                <CountUp value={u.used} delay={i * 120} />
                <small>/{u.isUnlimited ? '∞' : u.max}</small>
              </strong>
              <span>{RESOURCE_LABEL[u.resource]}</span>
            </li>
          ))}
        </ul>
      )}

      <ErrorNote error={error ?? mine.error ?? plans.error} />

      <SectionHead n={1} title={t('Tu cuenta')} />
      <div className="account-grid">
        <section className="panel plan-now" aria-labelledby="plan-now-title">
          <div className="plan-now-head">
            <div>
              <p className="eyebrow">{t('Tu plan')}</p>
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
            {t('Si bajas de plan no se borra nada: podrás ver y eliminar lo que tengas, pero no crear más hasta quedar por debajo del límite.')}
          </p>
        </section>

        <section className="panel" aria-labelledby="profile-title">
          <div>
            <p className="eyebrow">{t('Cuenta')}</p>
            <h2 id="profile-title">{t('Tus datos')}</h2>
          </div>
          <dl className="account-facts">
            <div>
              <dt>{t('Correo')}</dt>
              <dd>
                {user?.email}
                {user?.emailVerified && (
                  <span className="fact-ok">
                    <Icon name="check" size={12} /> {t('verificado')}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>{t('@usuario')}</dt>
              <dd>{user?.username ? `@${user.username}` : '—'}</dd>
            </div>
            <div>
              <dt>{t('Acceso')}</dt>
              <dd>
                {[
                  user?.hasPassword ? t('Contraseña') : null,
                  ...(user?.accounts ?? []).filter((a) => a.provider !== 'INSTAGRAM').map((a) => PROVIDER_LABEL[a.provider.toLowerCase() as ProviderSlug]),
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </dd>
            </div>
            <div>
              <dt>{t('Idioma')}</dt>
              <dd>
                <LanguageSwitch />
              </dd>
            </div>
          </dl>
          <div className="actions">
            <Link to="/perfil" className="btn wd-btn-line">
              <Icon name="edit" size={14} /> <span>{t('Editar perfil, foto y cuentas')}</span>
            </Link>
          </div>
        </section>
      </div>

      {/* En la app de Android/iOS no se cambia de plan: las tiendas obligan a cobrar con su
          propio sistema de pagos para las suscripciones digitales. */}
      {!isNative && (
      <section className="plans-section" aria-labelledby="plans-title">
        <div className="plans-intro">
          <SectionHead n={2} id="plans-title" title={t('Elige tu plan')} />
          <p className="muted">{t('Cambia cuando quieras. El cambio es simulado: no se realiza ningún cobro.')}</p>
          {changedTo && (
            <p className="note plans-note" role="status">
              <Icon name="check" size={14} /> {t('Ahora estás en {changedTo}.', { changedTo })}
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
                {(recommended || isCurrent) && <span className="plan-badge">{isCurrent ? t('Tu plan') : t('Recomendado')}</span>}
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
                    <button type="button" className="btn btn-block wd-btn-line" disabled>
                      {t('Plan actual')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`btn btn-block${upgrade && recommended ? ' wd-add' : ' wd-btn-line'}`}
                      disabled={changing !== null || !current}
                      onClick={() => changePlan(plan)}
                    >
                      {changing === plan.code ? t('Cambiando…') : upgrade ? t('Pasar a {name}', { name: plan.name }) : t('Bajar a {name}', { name: plan.name })}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
          {plans.loading && !plans.data && Array.from({ length: 4 }, (_, i) => <div key={i} className="plan is-skeleton" aria-hidden="true" />)}
        </div>

        <div className="plans-included">
          <span className="muted small">{t('Todos los planes incluyen:')}</span>
          {INCLUDED.map((f) => (
            <span key={f} className="included-item">
              <Icon name="check" size={14} /> {f}
            </span>
          ))}
        </div>
      </section>
      )}

      <section className="panel history" aria-labelledby="history-title">
        <SectionHead n={isNative ? 2 : 3} id="history-title" title={t('Historial de suscripciones')} />
        {history.data && history.data.length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th scope="col">{t('Plan')}</th>
                <th scope="col">{t('Estado')}</th>
                <th scope="col">{t('Desde')}</th>
                <th scope="col">{t('Hasta')}</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((s) => (
                <tr key={s.id}>
                  <td>{s.plan.name}</td>
                  <td>
                    <span className={`status status-${s.status.toLowerCase()}`}>
                      {{ ACTIVE: t('Activa'), CANCELED: t('Cancelada'), EXPIRED: t('Caducada') }[s.status]}
                    </span>
                  </td>
                  <td>{formatDate(s.startedAt)}</td>
                  <td>{s.endsAt ? formatDate(s.endsAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">{t('Sin suscripciones: estás en el plan gratuito por defecto.')}</p>
        )}
      </section>

      <section className="panel danger-zone" aria-labelledby="delete-title">
        <div>
          <SectionHead n={isNative ? 3 : 4} id="delete-title" title={t('Eliminar la cuenta')} />
          <p className="muted">
            {t('Se borran para siempre tu cuenta, tus armarios, prendas, outfits e imágenes. No se puede deshacer.')}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-danger-solid" onClick={() => setDeleting(true)}>
            {t('Eliminar mi cuenta')}
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
          ? new Error(withPassword ? t('La contraseña no es correcta.') : t('La confirmación ha caducado. Vuelve a confirmar tu identidad.'))
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
    <Modal title={t('Eliminar la cuenta')} onClose={busy ? () => undefined : onClose}>
      <form className="stack" onSubmit={confirm}>
        <p>
          {t('Vas a borrar tu cuenta y')} <strong>{t('todo')}</strong> {t('lo que tienes en MyOut. Esta acción no se puede deshacer.')}
        </p>
        {withPassword ? (
          <label className="field">
            <span>{t('Escribe tu contraseña para confirmar')}</span>
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
            <Icon name="check" size={14} /> {t('Identidad confirmada. Tienes unos minutos para terminar.')}
          </p>
        ) : (
          <div className="stack">
            <p className="muted">{t('Tu cuenta no tiene contraseña: confirma que eres tú volviendo a entrar.')}</p>
            <div className="actions">
              {providers.map((slug) => (
                <button key={slug} type="button" className="btn" onClick={() => reauth(slug)}>
                  {t('Confirmar con {v}', { v: PROVIDER_LABEL[slug] })}
                </button>
              ))}
            </div>
          </div>
        )}
        <ErrorNote error={error} />
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>
            {t('Cancelar')}
          </button>
          <button type="submit" className="btn btn-danger-solid" disabled={busy || (withPassword ? !password : !proof)}>
            {busy ? t('Eliminando…') : t('Eliminar para siempre')}
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
