import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { adminApi } from '../api/endpoints';
import type {
  AdminAction,
  AdminReport,
  AdminStats,
  AdminUser,
  AdminUserDetail,
  Paginated,
  Release,
  ReleaseInput,
  ReleaseTag,
  ReportStatus,
  ReportTarget,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { PersonAvatar, personName, profilePath } from '../components/social/PersonAvatar';
import { Busy, Spinner } from '../components/Spinner';
import {
  IDEA_STATUS_LABEL,
  longDate,
  RELEASE_TAGS,
  RELEASE_TAG_LABEL,
  REPORT_REASON_LABEL,
  REPORT_STATUS_LABEL,
  REPORT_TARGET_LABEL,
  timeAgo,
} from '../lib/community';
import { NoMatch } from '../components/street/EmptyStage';
import { SectionHead } from '../components/street/SectionHead';
import { CountUp } from '../components/street/Street';
import { AdminBilling } from './AdminBilling';
import { IdeaBoard } from './IdeasPage';
import { ReleaseBody } from './ReleasesPage';
import { LOCALE_TAG, t, tn } from '../i18n';

type Tab = 'resumen' | 'usuarios' | 'pagos' | 'ideas' | 'denuncias' | 'novedades' | 'registro';
const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen', label: t('Resumen') },
  { key: 'usuarios', label: t('Usuarios') },
  { key: 'pagos', label: t('Pagos') },
  { key: 'ideas', label: t('Ideas') },
  { key: 'denuncias', label: t('Denuncias') },
  { key: 'novedades', label: t('Novedades') },
  { key: 'registro', label: t('Registro') },
];

/** Panel de administración: solo para cuentas con rol ADMIN. */
export function AdminPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'resumen') as Tab;
  const go = (t: Tab) => setParams(t === 'resumen' ? {} : { tab: t });

  // El backend también lo comprueba (403); esto solo evita enseñar la página.
  if (!user) return <Spinner label={t('Cargando…')} />;
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;

  return (
    <section className="page admin-page ux adm">
      <header className="ux-head adm-head">
        <div>
          <span className="wd-kicker">
            <Icon name="shield" size={12} /> {t('Control room')}
          </span>
          <h1 className="wd-title ux-title" data-text={t('Admin')}>
            {t('Admin')}
          </h1>
          <p className="ux-lede">{t('Usuarios, pagos, ideas, denuncias y novedades. Todo lo que hagas aquí queda en el registro.')}</p>
        </div>
        <div className="wd-head-actions">
          <Link to="/monitor" className="btn wd-btn-line">
            <Icon name="pulse" size={14} /> <span>{t('Abrir el monitor')}</span>
          </Link>
        </div>
      </header>
      <nav className="profile-tabs admin-tabs" aria-label={t('Secciones del panel')}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className="profile-tab" aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="admin-body">
        <SectionHead n={TABS.findIndex((x) => x.key === tab) + 1} title={TABS.find((x) => x.key === tab)!.label} />
        {tab === 'resumen' && <Overview go={go} />}
        {tab === 'usuarios' && <Users />}
        {tab === 'pagos' && <AdminBilling />}
        {tab === 'ideas' && <IdeaBoard defaultSort="new" defaultStatus="NEW" numbered={false} />}
        {tab === 'denuncias' && <Reports />}
        {tab === 'novedades' && <Releases />}
        {tab === 'registro' && <ActionLog />}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------- resumen

function Overview({ go }: { go: (t: Tab) => void }) {
  const [s, setS] = useState<AdminStats | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    adminApi.stats().then(setS).catch(setError);
  }, []);
  if (error) return <ErrorNote error={error} />;
  if (!s) return <Spinner label={t('Cargando…')} />;
  const tiles: { label: string; value: number; hint?: string; tab: Tab; alert?: boolean }[] = [
    { label: t('Denuncias abiertas'), value: s.openReports, tab: 'denuncias', alert: s.openReports > 0 },
    { label: t('Ideas nuevas'), value: s.newIdeas, hint: t('de {ideas} en total', { ideas: s.ideas }), tab: 'ideas' },
    { label: t('Cuentas'), value: s.users, hint: t('{n} esta semana', { n: s.newUsers }), tab: 'usuarios' },
    { label: t('Suspendidas'), value: s.banned, tab: 'usuarios' },
    { label: t('Novedades publicadas'), value: s.releases.published, hint: s.releases.drafts ? tn(s.releases.drafts, '{n} borrador', '{n} borradores') : undefined, tab: 'novedades' },
  ];
  return (
    <div className="admin-stats">
      {tiles.map((t, i) => (
        <button
          key={t.label}
          type="button"
          className={`admin-stat${t.alert ? ' is-alert' : ''}`}
          style={{ '--i': i } as CSSProperties}
          onClick={() => go(t.tab)}
        >
          <span className="admin-stat-value">
            <CountUp value={t.value} delay={i * 90} />
          </span>
          <span className="admin-stat-label">{t.label}</span>
          {t.hint && <span className="admin-stat-hint">{t.hint}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- usuarios

type UserFilter = 'all' | 'reported' | 'banned' | 'admins';
const USER_FILTERS: { value: UserFilter; label: string }[] = [
  { value: 'all', label: t('Todas') },
  { value: 'reported', label: t('Con denuncias') },
  { value: 'banned', label: t('Suspendidas') },
  { value: 'admins', label: t('Admins') },
];

function banLabel(u: Pick<AdminUser, 'banned' | 'bannedUntil'>): string {
  if (!u.banned) return '';
  return u.bannedUntil ? t('Suspendida hasta el {longDate}', { longDate: longDate(u.bannedUntil) }) : t('Suspendida indefinidamente');
}

function Users() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserFilter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AdminUser> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(q.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    setError(null);
    adminApi
      .users({ search: search || undefined, status, page })
      .then(setData)
      .catch(setError);
  }, [search, status, page]);
  useEffect(load, [load]);

  return (
    <div className="stack">
      <div className="idea-toolbar">
        <label className="search">
          <Icon name="search" size={15} />
          <input type="search" value={q} placeholder={t('Email, @usuario o nombre')} aria-label={t('Buscar cuentas')} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chips chips-small" role="group" aria-label={t('Filtrar')}>
          {USER_FILTERS.map((f) => (
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
      {!data && !error && <Spinner label={t('Cargando cuentas…')} />}
      {data && data.data.length === 0 && <NoMatch icon="users" title={t('Sin cuentas')} text={t('Ninguna cuenta con ese filtro.')} />}
      {data && data.data.length > 0 && (
        <ul className="admin-users panel">
          {data.data.map((u) => (
            <li key={u.id}>
              <button type="button" className="admin-user" onClick={() => setOpen(u.id)}>
                <PersonAvatar person={u} size={36} />
                <span className="admin-user-text">
                  <strong>
                    {personName(u)} {u.username && <span className="muted">@{u.username}</span>}
                  </strong>
                  <small className="muted">
                    {t('{email} · desde {longDate}', { email: u.email, longDate: longDate(u.createdAt) })}
                  </small>
                </span>
                <span className="admin-user-flags">
                  {u.role === 'ADMIN' && <span className="admin-pill">{t('Admin')}</span>}
                  {u.openReports > 0 && <span className="admin-pill is-warn">{tn(u.openReports, '{n} denuncia', '{n} denuncias')}</span>}
                  {u.banned && <span className="admin-pill is-danger">{t('Suspendida')}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={page} totalPages={data.meta.totalPages} onPage={setPage} />}
      {open && (
        <UserDialog
          id={open}
          onClose={() => setOpen(null)}
          onChanged={(u) => setData((d) => (d ? { ...d, data: d.data.map((x) => (x.id === u.id ? { ...x, ...u } : x)) } : d))}
        />
      )}
    </div>
  );
}

const BAN_DURATIONS = [
  { days: 1, label: t('1 día') },
  { days: 7, label: t('7 días') },
  { days: 30, label: t('30 días') },
  { days: 0, label: t('Indefinida') },
];

/** Ficha de una cuenta: datos, denuncias, historial y suspender/levantar. */
export function UserDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged?: (u: AdminUser) => void }) {
  const { user: me } = useAuth();
  const [u, setU] = useState<AdminUserDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    adminApi.user(id).then(setU).catch(setError);
  }, [id]);
  useEffect(load, [load]);

  async function ban(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.ban(id, reason.trim(), days || undefined);
      onChanged?.(r);
      setReason('');
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function unban() {
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.unban(id);
      onChanged?.(r);
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={u ? personName(u) : t('Cuenta')} onClose={onClose} wide className="admin-user-dialog">
      {!u && !error && <Spinner label={t('Cargando…')} />}
      <ErrorNote error={error} />
      {u && (
        <div className="admin-user-detail">
          <div className="admin-user-card">
            <PersonAvatar person={u} size={64} />
            <div>
              <strong>{personName(u)}</strong>
              <p className="muted small">
                {u.username ? `@${u.username} · ` : ''}
                {u.email}
              </p>
              <p className="muted small">{t('Cuenta creada el {longDate}', { longDate: longDate(u.createdAt) })}</p>
              <Link to={profilePath(u)} className="small" onClick={onClose}>
                {t('Ver perfil público')}
              </Link>
            </div>
          </div>
          <dl className="admin-counts">
            {(
              [
                [t('Outfits'), u.counts.outfits],
                [t('Armarios'), u.counts.wardrobes],
                [t('Seguidores'), u.counts.followers],
                [t('Siguiendo'), u.counts.following],
                [t('Ideas'), u.counts.ideas],
                [t('Denuncias hechas'), u.counts.reportsMade],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          <section className="admin-section">
            <h3 className="panel-title">{t('Suspensión')}</h3>
            {u.banned ? (
              <div className="stack">
                <p className="danger-text">
                  {banLabel(u)}.{u.banReason && ` ${t('Motivo: {reason}', { reason: u.banReason })}`}
                </p>
                <div>
                  <button type="button" className="btn" disabled={busy} onClick={() => void unban()}>
                    {busy ? <Busy text={t('Levantando…')} /> : t('Levantar la suspensión')}
                  </button>
                </div>
              </div>
            ) : u.role === 'ADMIN' || u.id === me?.id ? (
              <p className="muted small">{t('Las cuentas de admin no se pueden suspender (primero se le quita el rol en el servidor).')}</p>
            ) : (
              <form className="stack" onSubmit={ban}>
                <label className="field">
                  <span>{t('Motivo (lo verá la persona al intentar entrar)')}</span>
                  <input value={reason} maxLength={300} minLength={3} required onChange={(e) => setReason(e.target.value)} placeholder={t('Ej.: spam repetido en mensajes')} />
                </label>
                <div className="chips chips-small" role="radiogroup" aria-label={t('Duración')}>
                  {BAN_DURATIONS.map((d) => (
                    <button key={d.days} type="button" role="radio" aria-checked={days === d.days} className={`chip${days === d.days ? ' is-active' : ''}`} onClick={() => setDays(d.days)}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="muted small">{t('Se cierra su sesión al momento y no podrá entrar (ni con Google/Apple) hasta que acabe o la levantes. Su perfil deja de verse.')}</p>
                <div>
                  <button type="submit" className="btn btn-danger-solid" disabled={busy || reason.trim().length < 3}>
                    {busy ? <Busy text={t('Suspendiendo…')} /> : t('Suspender la cuenta')}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="admin-section">
            <h3 className="panel-title">{t('Denuncias recibidas ({n})', { n: u.reports.length })}</h3>
            {u.reports.length === 0 ? (
              <p className="muted small">{t('Ninguna.')}</p>
            ) : (
              <ul className="admin-mini-list">
                {u.reports.map((r) => (
                  <li key={r.id}>
                    <span className={`admin-pill${r.status === 'OPEN' ? ' is-warn' : ''}`}>{REPORT_STATUS_LABEL[r.status]}</span> {REPORT_TARGET_LABEL[r.targetType]} · {REPORT_REASON_LABEL[r.reason]}
                    <span className="muted"> · {timeAgo(r.createdAt)}</span>
                    <Snapshot type={r.targetType} snapshot={r.snapshot} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-section">
            <h3 className="panel-title">{t('Historial de moderación')}</h3>
            {u.actions.length === 0 ? <p className="muted small">{t('Nada todavía.')}</p> : <ActionList actions={u.actions} />}
          </section>
        </div>
      )}
    </Modal>
  );
}

// --------------------------------------------------------------- denuncias

function Snapshot({ type, snapshot }: { type: ReportTarget; snapshot: Record<string, unknown> | null }) {
  if (!snapshot) return null;
  const s = (k: string) => (typeof snapshot[k] === 'string' ? (snapshot[k] as string) : null);
  let text: string | null = null;
  if (type === 'MESSAGE') text = s('body') ?? (s('outfitName') ? t('Outfit enviado: {name}', { name: s('outfitName') ?? '' }) : null);
  if (type === 'OUTFIT') text = [s('name'), s('description')].filter(Boolean).join(' — ');
  if (type === 'IDEA') text = [s('title'), s('body')].filter(Boolean).join(' — ');
  if (type === 'LISTING') text = [s('title'), s('price') && `${s('price')} ${s('currency') ?? ''}`.trim(), s('description')].filter(Boolean).join(' — ');
  if (type === 'USER') text = [s('displayName'), s('username') && `@${s('username')}`, s('bio')].filter(Boolean).join(' · ');
  if (!text) return null;
  return <blockquote className="admin-snapshot">{text}</blockquote>;
}

const REPORT_FILTERS: { value: ReportStatus | ''; label: string }[] = [
  { value: 'OPEN', label: t('Abiertas') },
  { value: 'RESOLVED', label: t('Resueltas') },
  { value: 'DISMISSED', label: t('Descartadas') },
  { value: '', label: t('Todas') },
];

function Reports() {
  const [status, setStatus] = useState<ReportStatus | ''>('OPEN');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AdminReport> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [userOpen, setUserOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminApi
      .reports({ status: status || undefined, page })
      .then(setData)
      .catch(setError);
  }, [status, page]);
  useEffect(load, [load]);

  return (
    <div className="stack">
      <div className="chips chips-small" role="group" aria-label={t('Filtrar')}>
        {REPORT_FILTERS.map((f) => (
          <button
            key={f.label}
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
      <p className="muted small">{t('Por privacidad no puedes leer los chats: de un mensaje solo ves la copia que se guardó al denunciarlo.')}</p>
      <ErrorNote error={error} />
      {!data && !error && <Spinner label={t('Cargando denuncias…')} />}
      {data && data.data.length === 0 && (
        <NoMatch icon="flag" title={status === 'OPEN' ? t('Todo revisado') : t('Sin denuncias')} text={status === 'OPEN' ? t('No hay denuncias pendientes. 👌') : t('Nada por aquí.')} />
      )}
      {data && data.data.length > 0 && (
        <ul className="admin-reports">
          {data.data.map((r) => (
            <li key={r.id}>
              <ReportCard report={r} onChanged={load} onOpenUser={setUserOpen} />
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={page} totalPages={data.meta.totalPages} onPage={setPage} />}
      {userOpen && <UserDialog id={userOpen} onClose={() => setUserOpen(null)} onChanged={load} />}
    </div>
  );
}

function ReportCard({ report: r, onChanged, onOpenUser }: { report: AdminReport; onChanged: () => void; onOpenUser: (id: string) => void }) {
  const [resolution, setResolution] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const close = (status: ReportStatus) => run(() => adminApi.updateReport(r.id, { status, resolution: resolution.trim() || undefined, notifyReporter: notify }));

  return (
    <article className="admin-report panel">
      <header className="admin-report-head">
        <span className="admin-pill">{REPORT_TARGET_LABEL[r.targetType]}</span>
        <strong>{REPORT_REASON_LABEL[r.reason]}</strong>
        <span className="muted small">· {timeAgo(r.createdAt)}</span>
        {r.status !== 'OPEN' && <span className="admin-pill">{REPORT_STATUS_LABEL[r.status]}</span>}
        {r.targetState !== 'visible' && <span className="admin-pill is-muted">{r.targetState === 'hidden' ? t('Ya oculto') : t('Ya borrado')}</span>}
      </header>

      <p className="small">
        <span className="muted">{t('Denunciado:')} </span>
        {r.targetUser ? (
          <button type="button" className="btn-link" onClick={() => onOpenUser(r.targetUser!.id)}>
            {personName(r.targetUser)}
            {r.targetUser.username ? ` (@${r.targetUser.username})` : ''}
          </button>
        ) : (
          t('cuenta eliminada')
        )}
        {r.targetUser?.banned && <span className="admin-pill is-danger"> {t('Suspendida')}</span>}
        <span className="muted"> {t('· por')} </span>
        {r.reporter ? personName(r.reporter) : t('cuenta eliminada')}
      </p>
      <Snapshot type={r.targetType} snapshot={r.snapshot} />
      {r.details && <p className="small">«{r.details}»</p>}
      {r.resolution && <p className="small muted">{t('Resolución: {resolution}', { resolution: r.resolution })}</p>}

      {r.status === 'OPEN' && (
        <div className="stack admin-report-actions">
          <div className="actions">
            {r.targetType === 'MESSAGE' && r.targetState === 'visible' && (
              <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={() => void run(() => adminApi.deleteMessage(r.targetId))}>
                <Icon name="trash" size={13} /> {t('Borrar el mensaje')}
              </button>
            )}
            {r.targetType === 'OUTFIT' && r.targetState !== 'deleted' && (
              <button type="button" className="btn btn-small" disabled={busy} onClick={() => void run(() => adminApi.hideOutfit(r.targetId, r.targetState !== 'hidden'))}>
                <Icon name="eyeOff" size={13} /> {r.targetState === 'hidden' ? t('Volver a mostrar el outfit') : t('Ocultar el outfit')}
              </button>
            )}
            {r.targetType === 'LISTING' && r.targetState !== 'deleted' && (
              <button type="button" className="btn btn-small" disabled={busy} onClick={() => void run(() => adminApi.hideListing(r.targetId, r.targetState !== 'hidden'))}>
                <Icon name="eyeOff" size={13} /> {r.targetState === 'hidden' ? t('Volver a mostrar el anuncio') : t('Ocultar el anuncio')}
              </button>
            )}
            {r.targetType === 'IDEA' && r.targetState !== 'deleted' && (
              <button type="button" className="btn btn-small" disabled={busy} onClick={() => void run(() => adminApi.updateIdea(r.targetId, { hidden: r.targetState !== 'hidden' }))}>
                <Icon name="eyeOff" size={13} /> {r.targetState === 'hidden' ? t('Volver a mostrar la idea') : t('Ocultar la idea')}
              </button>
            )}
            {r.targetUser && !r.targetUser.banned && r.targetUser.role !== 'ADMIN' && (
              <button type="button" className="btn btn-small btn-danger" onClick={() => onOpenUser(r.targetUser!.id)}>
                {t('Suspender…')}
              </button>
            )}
          </div>
          <input value={resolution} maxLength={300} placeholder={t('Nota interna (opcional): qué se ha hecho')} aria-label={t('Nota de la resolución')} onChange={(e) => setResolution(e.target.value)} />
          <div className="actions">
            <label className="check">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t('Avisar a quien denunció')}
            </label>
            <span className="spacer" />
            <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void close('DISMISSED')}>
              {t('Descartar')}
            </button>
            <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void close('RESOLVED')}>
              {t('Resuelta')}
            </button>
          </div>
        </div>
      )}
      {r.status !== 'OPEN' && (
        <div className="actions">
          <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void run(() => adminApi.updateReport(r.id, { status: 'OPEN', notifyReporter: false }))}>
            {t('Reabrir')}
          </button>
        </div>
      )}
      <ErrorNote error={error} />
    </article>
  );
}

// --------------------------------------------------------------- novedades

function Releases() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Release> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<Release | 'new' | null>(null);
  const [publishing, setPublishing] = useState<Release | null>(null);
  const [deleting, setDeleting] = useState<Release | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminApi.releases(page).then(setData).catch(setError);
  }, [page]);
  useEffect(load, [load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      load();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="stack">
      <div className="actions">
        <button type="button" className="btn wd-add" onClick={() => setEditing('new')}>
          <Icon name="plus" size={14} /> <span>{t('Nueva novedad')}</span>
        </button>
        <Link to="/novedades" className="btn wd-btn-line">
          <Icon name="eye" size={14} /> <span>{t('Ver la página pública')}</span>
        </Link>
      </div>
      {notice && <p className="note">{notice}</p>}
      <ErrorNote error={error} />
      {!data && !error && <Spinner label={t('Cargando…')} />}
      {data && data.data.length === 0 && <NoMatch icon="megaphone" title={t('Sin novedades')} text={t('Aún no hay ninguna. Escribe la primera: se guarda como borrador hasta que la publiques.')} />}
      {data && data.data.length > 0 && (
        <ul className="admin-releases">
          {data.data.map((r) => (
            <li key={r.id} className={`admin-release panel${r.publishedAt ? '' : ' is-draft'}`}>
              <div className="admin-release-head">
                <div>
                  <span className={`admin-pill${r.publishedAt ? '' : ' is-warn'}`}>{r.publishedAt ? t('Publicada el {longDate}', { longDate: longDate(r.publishedAt) }) : t('Borrador')}</span>
                  {r.version && <span className="muted small"> v{r.version.replace(/^v/i, '')}</span>}
                  <h3>{r.title}</h3>
                </div>
                <div className="actions">
                  <button type="button" className="btn btn-small" onClick={() => setEditing(r)}>
                    <Icon name="edit" size={13} /> {t('Editar')}
                  </button>
                  {r.publishedAt ? (
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => void run(() => adminApi.unpublishRelease(r.id))}>
                      {t('Retirar')}
                    </button>
                  ) : (
                    <button type="button" className="btn btn-small btn-primary" onClick={() => setPublishing(r)}>
                      <Icon name="megaphone" size={13} /> {t('Publicar')}
                    </button>
                  )}
                  <button type="button" className="icon-btn" aria-label={t('Borrar «{title}»', { title: r.title })} onClick={() => setDeleting(r)}>
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
              <ReleaseBody text={r.body} />
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={page} totalPages={data.meta.totalPages} onPage={setPage} />}

      {editing && (
        <ReleaseEditor
          release={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {publishing && (
        <PublishDialog
          release={publishing}
          onClose={() => setPublishing(null)}
          onDone={(n) => {
            setPublishing(null);
            setNotice(n > 0 ? t('Publicada. Aviso enviado a {n} {v}.', { n, v: n === 1 ? t('cuenta') : t('cuentas') }) : t('Publicada.'));
            load();
          }}
        />
      )}
      {deleting && (
        <Modal title={t('Borrar novedad')} onClose={() => setDeleting(null)}>
          <div className="stack">
            <p>
              {t('¿Borrar «{title}»? {v}No se puede deshacer.', { title: deleting.title, v: deleting.publishedAt ? t('Dejará de verse en Novedades. ') : '' })}
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)}>
                {t('Cancelar')}
              </button>
              <button
                type="button"
                className="btn btn-danger-solid"
                onClick={() => {
                  const r = deleting;
                  setDeleting(null);
                  void run(() => adminApi.deleteRelease(r.id));
                }}
              >
                {t('Borrar')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ReleaseEditor({ release, onClose, onSaved }: { release: Release | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(release?.title ?? '');
  const [version, setVersion] = useState(release?.version ?? '');
  const [body, setBody] = useState(release?.body ?? '');
  const [tags, setTags] = useState<ReleaseTag[]>(release?.tags ?? ['NEW']);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const input: ReleaseInput = { title: title.trim(), version: version.trim() || null, body: body.trim(), tags };
    try {
      if (release) await adminApi.updateRelease(release.id, input);
      else await adminApi.createRelease(input);
      onSaved();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const toggle = (t: ReleaseTag) => setTags((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));

  return (
    <Modal title={release ? t('Editar novedad') : t('Nueva novedad')} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        <div className="row release-editor-row">
          <label className="field">
            <span>{t('Título')}</span>
            <input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} placeholder={t('Chats en tiempo real')} />
          </label>
          <label className="field">
            <span>{t('Versión (opcional)')}</span>
            <input value={version} maxLength={30} onChange={(e) => setVersion(e.target.value)} placeholder="1.4" />
          </label>
        </div>
        <fieldset className="field">
          <legend>{t('Tipo')}</legend>
          <div className="chips chips-small">
            {RELEASE_TAGS.map((t) => (
              <button key={t} type="button" className={`chip${tags.includes(t) ? ' is-active' : ''}`} aria-pressed={tags.includes(t)} onClick={() => toggle(t)}>
                {RELEASE_TAG_LABEL[t]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <span className="release-editor-label">
            {t('Texto')}
            <button type="button" className="link-btn" onClick={() => setPreview((v) => !v)}>
              {preview ? t('Editar') : t('Vista previa')}
            </button>
          </span>
          {preview ? (
            <div className="release-preview">{body.trim() ? <ReleaseBody text={body} /> : <p className="muted">{t('Nada que ver todavía.')}</p>}</div>
          ) : (
            <textarea
              rows={10}
              maxLength={8000}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('Ya puedes hablar con tus amigos dentro de MyOO.\n\n- Chats 1 a 1 y de grupo\n- Envía outfits por mensaje')}
            />
          )}
          <small className="muted">{t('Una línea en blanco separa párrafos; las líneas que empiezan por «- » forman una lista.')}</small>
        </div>
        <ErrorNote error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancelar')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || title.trim().length < 3 || body.trim().length < 10}>
            {busy ? <Busy text={t('Guardando…')} /> : release ? t('Guardar') : t('Guardar borrador')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PublishDialog({ release, onClose, onDone }: { release: Release; onClose: () => void; onDone: (notified: number) => void }) {
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      const r = await adminApi.publishRelease(release.id, notify);
      onDone(r.notified);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal title={t('Publicar novedad')} onClose={onClose}>
      <div className="stack">
        <p>
          {t('«{title}» aparecerá en', { title: release.title })} <strong>{t('Novedades')}</strong>.
        </p>
        <label className="check">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> {t('Mandar un aviso a todas las cuentas')}
        </label>
        <p className="muted small">{t('El aviso solo se manda la primera vez que se publica.')}</p>
        <ErrorNote error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancelar')}
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void publish()}>
            {busy ? <Busy text={t('Publicando…')} /> : t('Publicar')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- registro

const ACTION_LABEL: Record<string, string> = {
  'user.ban': t('suspendió a'),
  'user.unban': t('levantó la suspensión de'),
  'idea.update': t('actualizó una idea de'),
  'idea.delete': t('borró una idea de'),
  'report.update': t('revisó una denuncia sobre'),
  'outfit.hide': t('ocultó un outfit de'),
  'outfit.unhide': t('volvió a mostrar un outfit de'),
  'message.delete': t('borró un mensaje de'),
  'release.create': t('creó la novedad'),
  'release.update': t('editó la novedad'),
  'release.publish': t('publicó la novedad'),
  'release.unpublish': t('retiró la novedad'),
  'release.delete': t('borró la novedad'),
  'billing.assign_plan': t('asignó un plan a'),
  'billing.gift_months': t('regaló meses a'),
  'billing.cancel': t('canceló la suscripción de'),
  'billing.refund': t('reembolsó un pago de'),
  'billing.update_plan': t('editó el plan'),
};

/** Acciones sin cuenta afectada (no se pone «a <cuenta>» detrás). */
const NO_TARGET = (action: string) => action.startsWith('release.') || action === 'billing.update_plan';

function actionDetail(a: AdminAction): string {
  const d = a.details ?? {};
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : null);
  if (a.action.startsWith('release.')) return str('title') ? `«${str('title')}»` : '';
  if (a.action === 'user.ban') return [str('reason') && t('Motivo: {str}', { str: str('reason') }), typeof d.days === 'number' ? t('{days} días', { days: d.days }) : t('indefinida')].filter(Boolean).join(' · ');
  if (a.action === 'idea.update' && typeof d.status === 'string') return t('Estado: {v}', { v: IDEA_STATUS_LABEL[d.status as keyof typeof IDEA_STATUS_LABEL] ?? d.status });
  if (a.action === 'report.update' && typeof d.status === 'string') return REPORT_STATUS_LABEL[d.status as ReportStatus] ?? '';
  if (a.action.startsWith('outfit.') || a.action === 'idea.delete') return str('name') ?? str('title') ?? '';
  if (a.action === 'billing.assign_plan')
    return [str('plan'), typeof d.months === 'number' ? t('{n} meses', { n: d.months }) : t('sin fecha de fin')].filter(Boolean).join(' · ');
  if (a.action === 'billing.gift_months' && typeof d.months === 'number') return t('{n} meses', { n: d.months });
  if (a.action === 'billing.cancel') return d.immediate ? t('al momento') : t('al final del periodo');
  if (a.action === 'billing.refund' && typeof d.amountCents === 'number')
    return new Intl.NumberFormat(LOCALE_TAG, { style: 'currency', currency: 'EUR' }).format(d.amountCents / 100);
  if (a.action === 'billing.update_plan') return str('code') ?? '';
  return '';
}

function ActionList({ actions }: { actions: AdminAction[] }) {
  return (
    <ul className="admin-log">
      {actions.map((a) => {
        const detail = actionDetail(a);
        return (
          <li key={a.id}>
            <time dateTime={a.createdAt} className="muted">
              {timeAgo(a.createdAt)}
            </time>
            <span>
              <strong>{a.admin ? personName(a.admin) : t('Un admin')}</strong> {ACTION_LABEL[a.action] ?? a.action}
              {!NO_TARGET(a.action) &&
                (a.targetUser === undefined ? (
                  t(' esta cuenta')
                ) : (
                  <>
                    {' '}
                    <strong>{a.targetUser ? personName(a.targetUser) : t('una cuenta eliminada')}</strong>
                  </>
                ))}
              {detail && (NO_TARGET(a.action) ? <> {detail}</> : <span className="muted"> · {detail}</span>)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ActionLog() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<AdminAction> | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    adminApi.actions(page).then(setData).catch(setError);
  }, [page]);
  if (error) return <ErrorNote error={error} />;
  if (!data) return <Spinner label={t('Cargando…')} />;
  if (data.data.length === 0) return <NoMatch icon="history" title={t('Registro vacío')} text={t('Aún no se ha hecho nada desde el panel.')} />;
  return (
    <div className="stack">
      <div className="panel">
        <ActionList actions={data.data} />
      </div>
      <Pager page={page} totalPages={data.meta.totalPages} onPage={setPage} />
    </div>
  );
}

function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pager" aria-label={t('Páginas')}>
      <button type="button" className="btn btn-small btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Icon name="back" size={13} /> {t('Anterior')}
      </button>
      <span className="muted small">
        {t('{page} de {totalPages}', { page, totalPages })}
      </span>
      <button type="button" className="btn btn-small btn-ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        {t('Siguiente')} <Icon name="forward" size={13} />
      </button>
    </nav>
  );
}
