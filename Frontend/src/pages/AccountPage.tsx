import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi, billingApi, mailApi, plansApi, subscriptionsApi, usersApi } from '../api/endpoints';
import type { BillingInterval, LimitedResource, Payment, Plan, ProviderSlug, UsageEntry, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon, type IconName } from '../components/Icon';
import { InvoiceLink } from '../components/InvoiceLink';
import { LegalLinks } from '../components/LegalLinks';
import { SectionHead } from '../components/street/SectionHead';
import { CountUp } from '../components/street/Street';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { Modal } from '../components/Modal';
import { explain } from '../lib/apiErrors';
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

function money(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(LOCALE_TAG, { style: 'currency', currency }).format(cents / 100);
}

/** Precio de un plan para el periodo elegido (con lo que se ahorra al año). */
function priceParts(plan: Plan, interval: BillingInterval = 'MONTH'): { amount: string; period: string | null; note: string | null } {
  if (plan.priceCents === 0) return { amount: '0 €', period: t('para siempre'), note: null };
  if (interval === 'YEAR') {
    if (!plan.annualPriceCents) return { amount: money(plan.priceCents, plan.currency), period: t('al mes'), note: t('Solo pago mensual') };
    const save = plan.priceCents * 12 - plan.annualPriceCents;
    return {
      amount: money(plan.annualPriceCents, plan.currency),
      period: t('al año'),
      note: save > 0 ? t('Ahorras {amount} al año', { amount: money(save, plan.currency) }) : null,
    };
  }
  return { amount: money(plan.priceCents, plan.currency), period: t('al mes'), note: null };
}

/** Coste mensual equivalente (para saber si un cambio sube o baja). */
function monthly(plan: Plan, interval: BillingInterval): number {
  return interval === 'YEAR' && plan.annualPriceCents ? plan.annualPriceCents / 12 : plan.priceCents;
}

const PAYMENT_STATUS: Record<Payment['status'], string> = {
  PAID: t('Pagado'),
  FAILED: t('Fallido'),
  PARTIALLY_REFUNDED: t('Reembolso parcial'),
  REFUNDED: t('Reembolsado'),
};

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
  const { user, logout, setUser } = useAuth();
  const location = useLocation();
  const mine = useAsync(() => plansApi.mine(), []);
  const plans = useAsync(() => plansApi.list(), []);
  const history = useAsync(() => subscriptionsApi.history(), []);
  const billing = useAsync(() => billingApi.me(), []);
  const navigate = useNavigate();

  const [error, setError] = useState<unknown>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [changedTo, setChangedTo] = useState<string | null>(null);
  // Pagos (Stripe, modo prueba): periodo elegido, aviso y confirmación en dos pasos.
  const [cycle, setCycle] = useState<BillingInterval>('MONTH');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);

  /** Descarga un JSON con todo lo de la cuenta (lo genera el servidor). */
  async function downloadData() {
    setExporting(true);
    setExportError(null);
    try {
      const data = await usersApi.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myoo-${t('datos')}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setExportError(err);
    } finally {
      setExporting(false);
    }
  }
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

  const cfg = billing.data?.config;
  const sub = billing.data?.subscription ?? null;
  const paying = sub?.source === 'STRIPE' ? sub : null;
  const payments = billing.data?.payments ?? [];

  useEffect(() => {
    if (paying?.interval) setCycle(paying.interval);
  }, [paying?.interval]);

  // Vuelta de Stripe Checkout (?checkout=success&session_id=… o ?checkout=cancel).
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const result = q.get('checkout');
    if (!result) return;
    const sessionId = q.get('session_id');
    navigate('/account', { replace: true, state: location.state });
    if (result !== 'success' || !sessionId) {
      setNote({ ok: false, text: t('Pago cancelado: no se ha cobrado nada.') });
      return;
    }
    setNote({ ok: false, text: t('Confirmando el pago…') });
    billingApi
      .confirm(sessionId)
      .then(async (b) => {
        billing.setData(b);
        await Promise.all([mine.reload(), history.reload()]);
        setNote({ ok: true, text: t('Pago completado. Ya estás en {plan}.', { plan: b.subscription?.plan.name ?? '' }) });
      })
      .catch((err: unknown) => {
        setNote(null);
        setError(err);
      });
    // Solo al entrar en la página.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshAll(b?: Awaited<ReturnType<typeof billingApi.me>>) {
    if (b) billing.setData(b);
    await Promise.all([mine.reload(), history.reload(), b ? Promise.resolve() : billing.reload()]);
  }

  /** Elegir un plan: con Stripe, pagar o cambiar; sin Stripe, el cambio simulado. */
  async function choose(plan: Plan) {
    setError(null);
    setNote(null);
    setChangedTo(null);
    if (!cfg?.enabled) return changePlan(plan);
    if (paying && confirming !== plan.code) {
      setConfirming(plan.code);
      return;
    }
    setConfirming(null);
    setChanging(plan.code);
    try {
      if (!paying) {
        const { url } = await billingApi.checkout(plan.code, cycle);
        window.location.assign(url);
        return;
      }
      const b = plan.isDefault ? await billingApi.cancel() : await billingApi.change(plan.code, cycle);
      await refreshAll(b);
      setNote({
        ok: true,
        text:
          plan.isDefault && b.subscription?.endsAt
            ? t('Suscripción cancelada: mantienes {plan} hasta el {date}.', { plan: b.subscription.plan.name, date: formatDate(b.subscription.endsAt) })
            : t('Ahora estás en {changedTo}.', { changedTo: plan.name }),
      });
    } catch (err) {
      setError(err);
    }
    setChanging(null);
  }

  async function cancelOrResume(resume: boolean) {
    setError(null);
    setNote(null);
    if (!resume && confirming !== '__cancel') {
      setConfirming('__cancel');
      return;
    }
    setConfirming(null);
    setChanging('__cancel');
    try {
      const b = resume ? await billingApi.resume() : await billingApi.cancel();
      await refreshAll(b);
      setNote({ ok: true, text: resume ? t('Suscripción reanudada: se renovará con normalidad.') : t('Suscripción cancelada: no se renovará.') });
    } catch (err) {
      setError(err);
    }
    setChanging(null);
  }

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
  const currentPrice = current ? priceParts(current, paying?.interval ?? 'MONTH') : null;
  const showInterval: BillingInterval = cfg?.enabled ? cycle : 'MONTH';
  const busy = changing !== null;

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
          <Link to="/personalizar" className="btn wd-btn-line">
            <Icon name="palette" size={14} /> <span>{t('Personalizar')}</span>
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

      <ErrorNote error={error ?? mine.error ?? plans.error ?? billing.error} />

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
          {paying && (
            <div className={`billing-now${paying.stripeStatus === 'past_due' ? ' is-warning' : ''}`}>
              <p>
                {paying.cancelAtPeriodEnd && paying.endsAt
                  ? t('Cancelada: mantienes el plan hasta el {date}.', { date: formatDate(paying.endsAt) })
                  : paying.stripeStatus === 'past_due'
                    ? t('No se pudo cobrar la renovación. Stripe lo reintentará en los próximos días.')
                    : paying.stripeStatus === 'trialing' && paying.currentPeriodEnd
                      ? t('Meses regalados: no se cobra nada hasta el {date}.', { date: formatDate(paying.currentPeriodEnd) })
                      : paying.currentPeriodEnd
                        ? t('Pago {period}. Se renueva el {date}.', {
                            period: paying.interval === 'YEAR' ? t('anual') : t('mensual'),
                            date: formatDate(paying.currentPeriodEnd),
                          })
                        : t('Suscripción activa.')}
              </p>
              {!isNative && (
                <button
                  type="button"
                  className="btn wd-btn-line"
                  disabled={busy}
                  onClick={() => void cancelOrResume(paying.cancelAtPeriodEnd)}
                >
                  {changing === '__cancel'
                    ? t('Un momento…')
                    : paying.cancelAtPeriodEnd
                      ? t('Reanudar suscripción')
                      : confirming === '__cancel'
                        ? t('Confirmar: no se renovará')
                        : t('Cancelar suscripción')}
                </button>
              )}
            </div>
          )}
          {sub?.source === 'ADMIN' && (
            <p className="billing-now">
              {sub.endsAt
                ? t('Plan regalado por el equipo de MyOO hasta el {date}.', { date: formatDate(sub.endsAt) })
                : t('Plan regalado por el equipo de MyOO.')}
            </p>
          )}
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
            <button type="button" className="btn wd-btn-line" disabled={exporting} onClick={() => void downloadData()}>
              <Icon name="download" size={14} /> <span>{exporting ? t('Preparando…') : t('Descargar mis datos')}</span>
            </button>
          </div>
          {exportError ? <ErrorNote error={exportError} /> : null}
          {user && <EmailSettings user={user} onUser={setUser} />}
        </section>
      </div>

      {/* En la app de Android/iOS no se cambia de plan: las tiendas obligan a cobrar con su
          propio sistema de pagos para las suscripciones digitales. */}
      {!isNative && (
      <section className="plans-section" aria-labelledby="plans-title">
        <div className="plans-intro">
          <SectionHead n={2} id="plans-title" title={t('Elige tu plan')} />
          {cfg?.enabled ? (
            <>
              <p className="muted">{t('Paga al mes o al año y cancela cuando quieras. El pago se hace en Stripe: tu tarjeta nunca pasa por MyOO.')}</p>
              <p className="note billing-test" role="note">
                <Icon name="bulb" size={14} />{' '}
                {t('Modo de prueba: no se cobra dinero real. Paga con la tarjeta 4242 4242 4242 4242, cualquier fecha futura y cualquier CVC.')}
              </p>
              <div className="segmented segmented-tabs billing-period" role="group" aria-label={t('Periodo de pago')}>
                {(['MONTH', 'YEAR'] as const).map((iv) => (
                  <button key={iv} type="button" aria-pressed={cycle === iv} onClick={() => { setCycle(iv); setConfirming(null); }}>
                    {iv === 'MONTH' ? t('Mensual') : t('Anual (2 meses gratis)')}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">
              {cfg && !cfg.simulated
                ? t('Los pagos todavía no están disponibles.')
                : t('Cambia cuando quieras. El cambio es simulado: no se realiza ningún cobro.')}
            </p>
          )}
          {changedTo && (
            <p className="note plans-note" role="status">
              <Icon name="check" size={14} /> {t('Ahora estás en {changedTo}.', { changedTo })}
            </p>
          )}
          {note && (
            <p className={`note plans-note${note.ok ? '' : ' is-info'}`} role="status">
              <Icon name={note.ok ? 'check' : 'bulb'} size={14} /> {note.text}
            </p>
          )}
        </div>

        <div className="plans">
          {plans.data?.map((plan) => {
            const isCurrent = paying
              ? plan.id === paying.plan.id && (paying.interval ?? 'MONTH') === showInterval
              : plan.id === current?.id;
            const samePlan = paying ? plan.id === paying.plan.id : false;
            const recommended = plan.code === RECOMMENDED;
            const upgrade = current ? monthly(plan, showInterval) > monthly(current, paying?.interval ?? 'MONTH') : true;
            const { amount, period, note: priceNote } = priceParts(plan, showInterval);
            const noAnnual = !!cfg?.enabled && !plan.isDefault && showInterval === 'YEAR' && !plan.annualPriceCents;
            const freeBlocked = !!cfg?.enabled && plan.isDefault && (!paying || paying.cancelAtPeriodEnd);
            const off = !cfg || (!cfg.enabled && !cfg.simulated);
            let label: string;
            if (changing === plan.code) label = cfg?.enabled && !paying ? t('Abriendo el pago…') : t('Cambiando…');
            else if (confirming === plan.code)
              label = plan.isDefault ? t('Confirmar: no se renovará') : t('Confirmar: se cobra o abona la diferencia');
            else if (plan.isDefault && cfg?.enabled)
              label = paying?.cancelAtPeriodEnd && paying.endsAt ? t('Desde el {date}', { date: formatDate(paying.endsAt) }) : paying ? t('Cancelar y pasar a {name}', { name: plan.name }) : t('Plan gratuito');
            else if (samePlan) label = showInterval === 'YEAR' ? t('Pagar al año') : t('Pagar al mes');
            else if (cfg?.enabled && !paying) label = t('Suscribirme a {name}', { name: plan.name });
            else label = upgrade ? t('Pasar a {name}', { name: plan.name }) : t('Bajar a {name}', { name: plan.name });
            return (
              <article key={plan.id} className={`plan${isCurrent ? ' is-current' : ''}${recommended ? ' is-recommended' : ''}`}>
                {(recommended || isCurrent) && <span className="plan-badge">{isCurrent ? t('Tu plan') : t('Recomendado')}</span>}
                <h3>{plan.name}</h3>
                {plan.description && <p className="plan-desc">{plan.description}</p>}
                <p className="plan-price">
                  {amount}
                  {period && <span className="plan-period">{period}</span>}
                </p>
                {priceNote && <p className="plan-save">{priceNote}</p>}
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
                      className={`btn btn-block${upgrade && recommended && !plan.isDefault ? ' wd-add' : ' wd-btn-line'}`}
                      disabled={busy || !current || off || noAnnual || freeBlocked}
                      onClick={() => void choose(plan)}
                    >
                      {label}
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

      <section className="panel history" aria-labelledby="payments-title">
        <SectionHead n={isNative ? 3 : 4} id="payments-title" title={t('Pagos')} />
        {payments.length > 0 ? (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('Fecha')}</th>
                  <th scope="col">{t('Plan')}</th>
                  <th scope="col">{t('Importe')}</th>
                  <th scope="col">{t('Estado')}</th>
                  <th scope="col">{t('Factura')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paidAt ?? p.createdAt)}</td>
                    <td>
                      {p.plan?.name ?? '—'}
                      {p.interval && <span className="muted small"> · {p.interval === 'YEAR' ? t('anual') : t('mensual')}</span>}
                    </td>
                    <td>
                      {money(p.amountCents, p.currency)}
                      {p.refundedCents > 0 && (
                        <span className="muted small"> · {t('{amount} devuelto', { amount: money(p.refundedCents, p.currency) })}</span>
                      )}
                    </td>
                    <td>
                      <span className={`status status-${p.status.toLowerCase()}`}>{PAYMENT_STATUS[p.status]}</span>
                    </td>
                    <td>
                      <InvoiceLink url={p.invoiceUrl} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{t('Todavía no hay pagos.')}</p>
        )}
        <LegalLinks className="legal-links-account" />
      </section>

      <section className="panel danger-zone" aria-labelledby="delete-title">
        <div>
          <SectionHead n={isNative ? 4 : 5} id="delete-title" title={t('Eliminar la cuenta')} />
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

const MAIL_ERRORS: Record<string, string> = {
  mail_wait: t('Espera un minuto antes de pedir otro correo.'),
  mail_failed: t('No se ha podido enviar el correo. Inténtalo más tarde.'),
  mail_disabled: t('El correo no está disponible ahora mismo.'),
};

/**
 * Correo de la cuenta: aviso discreto si el email no está confirmado (con
 * «Reenviar») y los interruptores de los avisos por correo. Solo aparece si
 * el servidor puede mandar correos.
 */
function EmailSettings({ user, onUser }: { user: User; onUser: (u: User) => void }) {
  const mail = useAsync(() => mailApi.config(), []);
  const [resend, setResend] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (!mail.data?.enabled) return null;
  const notices = user.emailNotices ?? { payments: true, chat: true };

  async function resendLink() {
    setResend('busy');
    setError(null);
    try {
      const r = await authApi.resendVerification();
      if (r.status === 'already_verified') onUser({ ...user, emailVerified: true });
      setResend('sent');
    } catch (err) {
      setError(explain(err, MAIL_ERRORS));
      setResend('idle');
    }
  }

  async function toggle(key: 'payments' | 'chat', on: boolean) {
    setSaving(true);
    setError(null);
    try {
      const next = await mailApi.savePreferences(key === 'payments' ? { payments: on } : { chat: on });
      onUser({ ...user, emailNotices: next });
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mail-settings">
      {!user.emailVerified && (
        <div className="mail-verify" role="note">
          <p className="muted small">
            <Icon name="mail" size={13} /> {t('Tu email aún no está confirmado. Te mandamos un enlace al crear la cuenta.')}
          </p>
          <button type="button" className="btn wd-btn-line mail-resend" disabled={resend !== 'idle'} onClick={() => void resendLink()}>
            {resend === 'sent' ? t('Enviado: mira tu correo') : resend === 'busy' ? t('Enviando…') : t('Reenviar')}
          </button>
        </div>
      )}
      <fieldset className="mail-notices">
        <legend className="eyebrow">{t('Avisos por correo')}</legend>
        <label className="switch-row mail-switch">
          <input type="checkbox" role="switch" checked={notices.payments} disabled={saving} onChange={(e) => void toggle('payments', e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          <span>
            <strong>{t('Pagos')}</strong>
            <small className="muted">{t('Pago recibido, cobro fallido y suscripción cancelada.')}</small>
          </span>
        </label>
        <label className="switch-row mail-switch">
          <input type="checkbox" role="switch" checked={notices.chat} disabled={saving} onChange={(e) => void toggle('chat', e.target.checked)} />
          <span className="switch" aria-hidden="true" />
          <span>
            <strong>{t('Mensajes')}</strong>
            <small className="muted">
              {user.emailVerified
                ? t('Si llevas un rato sin entrar. Como mucho uno cada pocas horas por conversación.')
                : t('Llegarán cuando confirmes tu email.')}
            </small>
          </span>
        </label>
      </fieldset>
      <ErrorNote error={error} />
    </div>
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
          {t('Vas a borrar tu cuenta y')} <strong>{t('todo')}</strong> {t('lo que tienes en MyOO. Esta acción no se puede deshacer.')}
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
