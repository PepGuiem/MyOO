import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { adminApi } from '../api/endpoints';
import type {
  AdminBillingSummary,
  AdminBillingUser,
  AdminPayment,
  AdminPlan,
  AdminUser,
  BillingSubscription,
  Paginated,
  PaymentStatus,
} from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { PersonAvatar, personName } from '../components/social/PersonAvatar';
import { Busy, Spinner } from '../components/Spinner';
import { NoMatch } from '../components/street/EmptyStage';
import { CountUp } from '../components/street/Street';
import { longDate } from '../lib/community';
import { LOCALE_TAG, t } from '../i18n';

/**
 * Pagos y suscripciones (Stripe, modo prueba): resumen, pagos con
 * reembolsos, suscripción de cada cuenta (asignar plan, regalar meses,
 * cancelar) y precios de los planes. Todo queda en el registro.
 */

function money(cents: number, currency = 'EUR'): string {
  return new Intl.NumberFormat(LOCALE_TAG, { style: 'currency', currency }).format(cents / 100);
}

const STATUS_LABEL: Record<PaymentStatus, string> = {
  PAID: t('Pagado'),
  FAILED: t('Fallido'),
  PARTIALLY_REFUNDED: t('Reembolso parcial'),
  REFUNDED: t('Reembolsado'),
};

const STATUS_FILTERS: { value: PaymentStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: t('Todos') },
  { value: 'PAID', label: t('Pagados') },
  { value: 'FAILED', label: t('Fallidos') },
  { value: 'PARTIALLY_REFUNDED', label: t('Reembolso parcial') },
  { value: 'REFUNDED', label: t('Reembolsados') },
];

const SOURCE_LABEL: Record<BillingSubscription['source'], string> = {
  STRIPE: t('Stripe'),
  ADMIN: t('Regalado'),
  SIMULATED: t('Simulado'),
};

const intervalLabel = (iv: 'MONTH' | 'YEAR' | null) => (iv === 'YEAR' ? t('anual') : iv === 'MONTH' ? t('mensual') : '');

export function AdminBilling() {
  const [summary, setSummary] = useState<AdminBillingSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    adminApi.billingSummary().then(setSummary).catch(setError);
  }, [version]);

  return (
    <div className="stack admin-billing">
      <ErrorNote error={error} />
      {!summary && !error && <Spinner label={t('Cargando…')} />}
      {summary && <BillingStatus summary={summary} />}
      {summary && <BillingTiles summary={summary} />}
      {summary && summary.byPlan.length > 0 && (
        <section className="panel admin-section">
          <h3 className="panel-title">{t('Suscripciones activas por plan')}</h3>
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('Plan')}</th>
                  <th scope="col">{t('Pagan (Stripe)')}</th>
                  <th scope="col">{t('Regaladas')}</th>
                  <th scope="col">{t('Simuladas')}</th>
                </tr>
              </thead>
              <tbody>
                {summary.byPlan.map((r) => (
                  <tr key={r.plan.id}>
                    <td>{r.plan.name}</td>
                    <td>{r.stripe}</td>
                    <td>{r.admin}</td>
                    <td>{r.simulated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <UserFinder onOpen={setOpenUser} />
      <Payments key={`p${version}`} onOpenUser={setOpenUser} onChanged={refresh} />
      <PlansEditor />

      {openUser && <BillingUserDialog id={openUser} onClose={() => setOpenUser(null)} onChanged={refresh} />}
    </div>
  );
}

function BillingStatus({ summary }: { summary: AdminBillingSummary }) {
  const c = summary.config;
  let text: string;
  if (c.keyProblem === 'missing') text = t('Pagos apagados: falta STRIPE_SECRET_KEY en Vercel. Mientras tanto se usa el cambio de plan simulado (si está permitido).');
  else if (c.keyProblem === 'live') text = t('Pagos apagados: la clave de Stripe es REAL (sk_live_). Solo se aceptan claves de prueba (sk_test_).');
  else if (c.keyProblem === 'invalid') text = t('Pagos apagados: STRIPE_SECRET_KEY no tiene el formato de una clave de prueba (sk_test_…).');
  else if (!c.webhookConfigured)
    text = t('Stripe activo en modo prueba, pero falta STRIPE_WEBHOOK_SECRET: las renovaciones, impagos y reembolsos hechos desde Stripe no llegarán solos.');
  else text = t('Stripe activo en modo prueba, con webhook. No se cobra dinero real.');
  const ok = c.enabled && c.webhookConfigured;
  return (
    <p className={`billing-now${ok ? '' : ' is-warning'}`} role="status">
      <Icon name={ok ? 'check' : 'bulb'} size={14} /> <span>{text}</span>
    </p>
  );
}

function BillingTiles({ summary: s }: { summary: AdminBillingSummary }) {
  const net = s.month.grossCents - s.month.refundedCents;
  const prevNet = s.previousMonth.grossCents - s.previousMonth.refundedCents;
  const paying = s.byPlan.reduce((n, r) => n + r.stripe, 0);
  const gifted = s.byPlan.reduce((n, r) => n + r.admin, 0);
  const tiles: { label: string; value: string | number; hint?: string; alert?: boolean }[] = [
    { label: t('Ingresos netos del mes'), value: money(net, s.currency), hint: t('mes anterior: {amount}', { amount: money(prevNet, s.currency) }) },
    { label: t('Reembolsado este mes'), value: money(s.month.refundedCents, s.currency) },
    { label: t('Pagos este mes'), value: s.month.payments },
    { label: t('Suscripciones de pago'), value: paying, hint: gifted ? t('{n} regaladas', { n: gifted }) : undefined },
    { label: t('Se cancelan al final del periodo'), value: s.cancelling },
    { label: t('Cobros fallidos (30 días)'), value: s.failedLast30Days, alert: s.failedLast30Days > 0 || s.pastDue > 0, hint: s.pastDue ? t('{n} pendientes de cobro', { n: s.pastDue }) : undefined },
  ];
  return (
    <div className="admin-stats">
      {tiles.map((x, i) => (
        <div key={x.label} className={`admin-stat${x.alert ? ' is-alert' : ''}`} style={{ '--i': i } as CSSProperties}>
          <span className="admin-stat-value">{typeof x.value === 'number' ? <CountUp value={x.value} delay={i * 90} /> : x.value}</span>
          <span className="admin-stat-label">{x.label}</span>
          {x.hint && <span className="admin-stat-hint">{x.hint}</span>}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ cuentas

function UserFinder({ onOpen }: { onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    const id = window.setTimeout(() => {
      adminApi
        .users({ search: term, page: 1 })
        .then((r) => setResults(r.data.slice(0, 6)))
        .catch(setError);
    }, 300);
    return () => window.clearTimeout(id);
  }, [q]);

  return (
    <section className="panel admin-section">
      <h3 className="panel-title">{t('Suscripción de una cuenta')}</h3>
      <p className="muted small">{t('Busca una cuenta para ver sus pagos, asignarle un plan, regalarle meses o cancelar su suscripción.')}</p>
      <label className="search">
        <Icon name="search" size={15} />
        <input type="search" value={q} placeholder={t('Email, @usuario o nombre')} aria-label={t('Buscar cuentas')} onChange={(e) => setQ(e.target.value)} />
      </label>
      <ErrorNote error={error} />
      {results && results.length === 0 && <p className="muted small">{t('Ninguna cuenta con ese filtro.')}</p>}
      {results && results.length > 0 && (
        <ul className="admin-users">
          {results.map((u) => (
            <li key={u.id}>
              <button type="button" className="admin-user" onClick={() => onOpen(u.id)}>
                <PersonAvatar person={u} size={32} />
                <span className="admin-user-text">
                  <strong>
                    {personName(u)} {u.username && <span className="muted">@{u.username}</span>}
                  </strong>
                  <small className="muted">{u.email}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------------- pagos

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pager" aria-label={t('Páginas')}>
      <button type="button" className="btn btn-small btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Icon name="back" size={13} /> {t('Anterior')}
      </button>
      <span className="muted small">{t('{page} de {totalPages}', { page, totalPages })}</span>
      <button type="button" className="btn btn-small btn-ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        {t('Siguiente')} <Icon name="forward" size={13} />
      </button>
    </nav>
  );
}

function Payments({
  onOpenUser,
  onChanged,
}: {
  onOpenUser: (id: string) => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<PaymentStatus | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AdminPayment> | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const load = useCallback(() => {
    setError(null);
    adminApi
      .payments({ status: status === 'ALL' ? undefined : status, search: search || undefined, page })
      .then(setData)
      .catch(setError);
  }, [status, search, page]);
  useEffect(load, [load]);

  return (
    <section className="panel admin-section">
      <h3 className="panel-title">{t('Pagos')}</h3>
      <div className="idea-toolbar">
        <label className="search">
          <Icon name="search" size={15} />
          <input type="search" value={q} placeholder={t('Email, @usuario o nombre')} aria-label={t('Buscar pagos por cuenta')} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chips chips-small" role="group" aria-label={t('Filtrar')}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`chip${status === f.value ? ' is-active' : ''}`}
              aria-pressed={status === f.value}
              onClick={() => {
                setStatus(f.value);
                setPage(1);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <ErrorNote error={error} />
      {!data && !error && <Spinner label={t('Cargando…')} />}
      {data && data.data.length === 0 && <NoMatch icon="wallet" title={t('Sin pagos')} text={t('Todavía no hay pagos con ese filtro.')} />}
      {data && data.data.length > 0 && (
        <PaymentTable
          payments={data.data}
          onOpenUser={onOpenUser}
          onRefunded={(p) => {
            setData((d) => (d ? { ...d, data: d.data.map((x) => (x.id === p.id ? { ...x, ...p } : x)) } : d));
            onChanged();
          }}
        />
      )}
      {data && <Pager page={page} totalPages={data.meta.totalPages} onPage={setPage} />}
    </section>
  );
}

function PaymentTable({
  payments,
  onOpenUser,
  onRefunded,
}: {
  payments: AdminPayment[];
  onOpenUser?: (id: string) => void;
  onRefunded: (p: AdminPayment) => void;
}) {
  const [refunding, setRefunding] = useState<string | null>(null);
  return (
    <div className="table-scroll">
      <table className="table admin-payments">
        <thead>
          <tr>
            <th scope="col">{t('Fecha')}</th>
            {onOpenUser && <th scope="col">{t('Cuenta')}</th>}
            <th scope="col">{t('Plan')}</th>
            <th scope="col">{t('Importe')}</th>
            <th scope="col">{t('Estado')}</th>
            <th scope="col">
              <span className="visually-hidden">{t('Acciones')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>{longDate(p.paidAt ?? p.createdAt)}</td>
              {onOpenUser && (
                <td>
                  {p.user ? (
                    <button type="button" className="link-button" onClick={() => onOpenUser(p.user!.id)}>
                      {personName(p.user)}
                    </button>
                  ) : (
                    <span className="muted">{t('una cuenta eliminada')}</span>
                  )}
                </td>
              )}
              <td>
                {p.plan?.name ?? '—'}
                {p.interval && <span className="muted small"> · {intervalLabel(p.interval)}</span>}
              </td>
              <td>
                {money(p.amountCents, p.currency)}
                {p.refundedCents > 0 && <span className="muted small"> · {t('{amount} devuelto', { amount: money(p.refundedCents, p.currency) })}</span>}
              </td>
              <td>
                <span className={`status status-${p.status.toLowerCase()}`} title={p.failureReason ?? undefined}>
                  {STATUS_LABEL[p.status]}
                </span>
              </td>
              <td>
                {refunding === p.id ? (
                  <RefundForm payment={p} onCancel={() => setRefunding(null)} onDone={(r) => { setRefunding(null); onRefunded(r); }} />
                ) : (
                  p.refundableCents > 0 && (
                    <button type="button" className="btn btn-small wd-btn-line" onClick={() => setRefunding(p.id)}>
                      {t('Reembolsar')}
                    </button>
                  )
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Reembolso total o parcial (en euros). No cancela la suscripción. */
function RefundForm({ payment, onCancel, onDone }: { payment: AdminPayment; onCancel: () => void; onDone: (p: AdminPayment) => void }) {
  const [amount, setAmount] = useState((payment.refundableCents / 100).toFixed(2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const cents = Math.round(Number(amount.replace(',', '.')) * 100);
  const valid = Number.isFinite(cents) && cents > 0 && cents <= payment.refundableCents;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.refund(payment.id, cents === payment.refundableCents ? undefined : cents);
      onDone(r);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form className="refund-form" onSubmit={submit}>
      <label className="field">
        <span className="small">{t('Importe a devolver (máx. {amount})', { amount: money(payment.refundableCents, payment.currency) })}</span>
        <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!valid} />
      </label>
      <div className="refund-actions">
        <button type="submit" className="btn btn-small btn-danger-solid" disabled={busy || !valid}>
          {busy ? <Busy text={t('Reembolsando…')} /> : t('Confirmar reembolso')}
        </button>
        <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={onCancel}>
          {t('Cancelar')}
        </button>
      </div>
      <ErrorNote error={error} />
    </form>
  );
}

// ------------------------------------------------------ ficha de una cuenta

const MONTH_OPTIONS = [1, 3, 6, 12];

function BillingUserDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [u, setU] = useState<AdminBillingUser | null>(null);
  const [plans, setPlans] = useState<AdminPlan[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [planCode, setPlanCode] = useState('');
  const [months, setMonths] = useState<number>(0);
  const [gift, setGift] = useState(1);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    adminApi.billingUser(id).then(setU).catch(setError);
    adminApi.plans().then(setPlans).catch(setError);
  }, [id]);

  const active = u?.subscriptions.find((s) => s.id === u.activeSubscriptionId) ?? null;
  const paysStripe = active?.source === 'STRIPE';

  async function run(key: string, fn: () => Promise<AdminBillingUser>) {
    setBusy(key);
    setError(null);
    setConfirm(null);
    try {
      setU(await fn());
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  function ask(key: string, fn: () => Promise<AdminBillingUser>) {
    if (confirm !== key) setConfirm(key);
    else void run(key, fn);
  }

  return (
    <Modal title={u ? personName(u.user) : t('Cuenta')} onClose={onClose} wide className="admin-user-dialog">
      {!u && !error && <Spinner label={t('Cargando…')} />}
      <ErrorNote error={error} />
      {u && (
        <div className="admin-user-detail">
          <div className="admin-user-card">
            <div>
              <strong>{personName(u.user)}</strong>
              <p className="muted small">
                {u.user.username ? `@${u.user.username} · ` : ''}
                {u.user.email}
              </p>
              <p className="small">
                {t('Plan actual: {plan}', { plan: u.plan.name })}
                {active && (
                  <span className="muted">
                    {' '}
                    · {SOURCE_LABEL[active.source]}
                    {active.interval ? ` · ${intervalLabel(active.interval)}` : ''}
                    {active.cancelAtPeriodEnd && active.endsAt
                      ? ` · ${t('se cancela el {date}', { date: longDate(active.endsAt) })}`
                      : active.currentPeriodEnd
                        ? ` · ${t('renueva el {date}', { date: longDate(active.currentPeriodEnd) })}`
                        : active.endsAt
                          ? ` · ${t('hasta el {date}', { date: longDate(active.endsAt) })}`
                          : ''}
                    {active.stripeStatus === 'past_due' ? ` · ${t('cobro pendiente')}` : ''}
                  </span>
                )}
              </p>
            </div>
          </div>

          {active && (
            <section className="admin-section">
              <h3 className="panel-title">{t('Suscripción actual')}</h3>
              <div className="chips chips-small" role="radiogroup" aria-label={t('Meses a regalar')}>
                {MONTH_OPTIONS.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={gift === m} className={`chip${gift === m ? ' is-active' : ''}`} onClick={() => setGift(m)}>
                    {m === 1 ? t('1 mes') : t('{n} meses', { n: m })}
                  </button>
                ))}
              </div>
              <p className="muted small">
                {paysStripe
                  ? t('Stripe no le cobrará nada hasta que pasen los meses regalados; luego se renueva con su precio.')
                  : active.endsAt
                    ? t('Se alarga la fecha de fin.')
                    : t('Este plan no tiene fecha de fin: no hace falta regalar meses.')}
              </p>
              <div className="actions">
                <button
                  type="button"
                  className="btn wd-btn-line"
                  disabled={busy !== null || (!paysStripe && !active.endsAt)}
                  onClick={() => ask('gift', () => adminApi.giftMonths(id, gift))}
                >
                  {busy === 'gift' ? <Busy text={t('Guardando…')} /> : confirm === 'gift' ? t('Confirmar regalo') : t('Regalar meses')}
                </button>
                {paysStripe && !active.cancelAtPeriodEnd && (
                  <button type="button" className="btn wd-btn-line" disabled={busy !== null} onClick={() => ask('end', () => adminApi.cancelSubscription(active.id, false))}>
                    {busy === 'end' ? <Busy text={t('Cancelando…')} /> : confirm === 'end' ? t('Confirmar: no se renovará') : t('Cancelar al final del periodo')}
                  </button>
                )}
                <button type="button" className="btn btn-danger-solid" disabled={busy !== null} onClick={() => ask('now', () => adminApi.cancelSubscription(active.id, true))}>
                  {busy === 'now' ? <Busy text={t('Cancelando…')} /> : confirm === 'now' ? t('Confirmar: cortar ya') : t('Cancelar ya')}
                </button>
              </div>
              {paysStripe && <p className="muted small">{t('Cancelar no devuelve dinero: si hace falta, reembolsa el pago abajo.')}</p>}
            </section>
          )}

          <section className="admin-section">
            <h3 className="panel-title">{t('Asignar un plan sin cobro')}</h3>
            {paysStripe ? (
              <p className="muted small">{t('Paga con Stripe: cancela antes su suscripción para asignarle otro plan.')}</p>
            ) : (
              <form
                className="stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (planCode) ask('assign', () => adminApi.assignPlan(id, planCode, months || undefined));
                }}
              >
                <label className="field">
                  <span>{t('Plan')}</span>
                  <select value={planCode} onChange={(e) => setPlanCode(e.target.value)} required>
                    <option value="">{t('Elige un plan')}</option>
                    {plans?.map((p) => (
                      <option key={p.id} value={p.code}>
                        {p.name}
                        {p.isActive ? '' : ` (${t('desactivado')})`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="chips chips-small" role="radiogroup" aria-label={t('Duración')}>
                  {[...MONTH_OPTIONS, 0].map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={months === m} className={`chip${months === m ? ' is-active' : ''}`} onClick={() => setMonths(m)}>
                      {m === 0 ? t('Sin fecha de fin') : m === 1 ? t('1 mes') : t('{n} meses', { n: m })}
                    </button>
                  ))}
                </div>
                <div>
                  <button type="submit" className="btn" disabled={busy !== null || !planCode}>
                    {busy === 'assign' ? <Busy text={t('Guardando…')} /> : confirm === 'assign' ? t('Confirmar') : t('Asignar plan')}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="admin-section">
            <h3 className="panel-title">{t('Pagos ({n})', { n: u.payments.length })}</h3>
            {u.payments.length === 0 ? (
              <p className="muted small">{t('Ninguno.')}</p>
            ) : (
              <PaymentTable
                payments={u.payments}
                onRefunded={(p) => {
                  setU((x) => (x ? { ...x, payments: x.payments.map((y) => (y.id === p.id ? { ...y, ...p } : y)) } : x));
                  onChanged();
                }}
              />
            )}
          </section>

          <section className="admin-section">
            <h3 className="panel-title">{t('Historial de suscripciones')}</h3>
            {u.subscriptions.length === 0 ? (
              <p className="muted small">{t('Ninguna: está en el plan gratuito.')}</p>
            ) : (
              <ul className="admin-mini-list">
                {u.subscriptions.map((s) => (
                  <li key={s.id}>
                    <span className={`admin-pill${s.status === 'ACTIVE' ? ' is-ok' : ''}`}>
                      {{ ACTIVE: t('Activa'), CANCELED: t('Cancelada'), EXPIRED: t('Caducada') }[s.status]}
                    </span>{' '}
                    {s.plan.name} · {SOURCE_LABEL[s.source]}
                    {s.interval ? ` · ${intervalLabel(s.interval)}` : ''}
                    <span className="muted">
                      {' '}
                      · {longDate(s.startedAt)}
                      {s.endsAt ? ` → ${longDate(s.endsAt)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ planes

function PlansEditor() {
  const [plans, setPlans] = useState<AdminPlan[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    adminApi.plans().then(setPlans).catch(setError);
  }, []);

  return (
    <section className="panel admin-section">
      <h3 className="panel-title">{t('Planes y precios')}</h3>
      <p className="muted small">
        {t('Los precios nuevos valen para los pagos nuevos: quien ya paga mantiene su precio hasta que cambie de plan. Si desactivas un plan deja de ofrecerse, pero quien lo tiene lo conserva.')}
      </p>
      <ErrorNote error={error} />
      {!plans && !error && <Spinner label={t('Cargando…')} />}
      <div className="plan-editors">
        {plans?.map((p) => (
          <PlanEditor key={p.id} plan={p} onSaved={setPlans} />
        ))}
      </div>
    </section>
  );
}

const toEuros = (cents: number) => (cents / 100).toFixed(2);
const toCents = (v: string) => Math.round(Number(v.replace(',', '.')) * 100);

function PlanEditor({ plan, onSaved }: { plan: AdminPlan; onSaved: (p: AdminPlan[]) => void }) {
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description ?? '');
  const [monthly, setMonthly] = useState(toEuros(plan.priceCents));
  const [annual, setAnnual] = useState(toEuros(plan.annualPriceCents));
  const [active, setActive] = useState(plan.isActive);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const m = toCents(monthly);
  const a = toCents(annual);
  const valid = name.trim().length >= 2 && Number.isFinite(m) && m >= 0 && Number.isFinite(a) && a >= 0;
  const dirty =
    name.trim() !== plan.name ||
    (description.trim() || null) !== plan.description ||
    m !== plan.priceCents ||
    a !== plan.annualPriceCents ||
    active !== plan.isActive;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!valid || !dirty) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const body = plan.isDefault
        ? { name: name.trim(), description: description.trim() || null }
        : { name: name.trim(), description: description.trim() || null, priceCents: m, annualPriceCents: a, isActive: active };
      onSaved(await adminApi.updatePlan(plan.id, body));
      setSaved(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="plan-editor" onSubmit={save}>
      <div className="plan-editor-head">
        <strong>{plan.code}</strong>
        <span className="muted small">
          {t('{n} con el plan', { n: plan.activeSubscriptions })}
          {plan.isDefault ? ` · ${t('plan gratuito por defecto')}` : ''}
        </span>
      </div>
      <label className="field">
        <span>{t('Nombre')}</span>
        <input value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('Descripción')}</span>
        <textarea value={description} maxLength={500} rows={2} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {!plan.isDefault && (
        <div className="plan-editor-prices">
          <label className="field">
            <span>{t('Precio al mes (€)')}</span>
            <input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('Precio al año (€, 0 = sin pago anual)')}</span>
            <input inputMode="decimal" value={annual} onChange={(e) => setAnnual(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span>{t('Se ofrece a nuevas suscripciones')}</span>
          </label>
        </div>
      )}
      <div className="actions">
        <button type="submit" className="btn" disabled={busy || !valid || !dirty}>
          {busy ? <Busy text={t('Guardando…')} /> : t('Guardar')}
        </button>
        {saved && !dirty && (
          <span className="plans-note small">
            <Icon name="check" size={13} /> {t('Guardado')}
          </span>
        )}
      </div>
      <ErrorNote error={error} />
    </form>
  );
}
