import { useCallback, useEffect, useState, type FormEvent } from 'react';
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
import { IdeaBoard } from './IdeasPage';
import { ReleaseBody } from './ReleasesPage';

type Tab = 'resumen' | 'usuarios' | 'ideas' | 'denuncias' | 'novedades' | 'registro';
const TABS: { key: Tab; label: string }[] = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'ideas', label: 'Ideas' },
  { key: 'denuncias', label: 'Denuncias' },
  { key: 'novedades', label: 'Novedades' },
  { key: 'registro', label: 'Registro' },
];

/** Panel de administración: solo para cuentas con rol ADMIN. */
export function AdminPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'resumen') as Tab;
  const go = (t: Tab) => setParams(t === 'resumen' ? {} : { tab: t });

  // El backend también lo comprueba (403); esto solo evita enseñar la página.
  if (!user) return <Spinner label="Cargando…" />;
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;

  return (
    <section className="page admin-page">
      <header className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="muted">Usuarios, ideas, denuncias y novedades. Todo lo que hagas aquí queda en el registro.</p>
        </div>
        <div className="head-actions">
          <Link to="/monitor" className="btn">
            <Icon name="pulse" size={14} /> Abrir el monitor
          </Link>
        </div>
      </header>
      <nav className="profile-tabs admin-tabs" aria-label="Secciones del panel">
        {TABS.map((t) => (
          <button key={t.key} type="button" className="profile-tab" aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="admin-body">
        {tab === 'resumen' && <Overview go={go} />}
        {tab === 'usuarios' && <Users />}
        {tab === 'ideas' && <IdeaBoard defaultSort="new" defaultStatus="NEW" />}
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
  if (!s) return <Spinner label="Cargando…" />;
  const tiles: { label: string; value: number; hint?: string; tab: Tab; alert?: boolean }[] = [
    { label: 'Denuncias abiertas', value: s.openReports, tab: 'denuncias', alert: s.openReports > 0 },
    { label: 'Ideas nuevas', value: s.newIdeas, hint: `de ${s.ideas} en total`, tab: 'ideas' },
    { label: 'Cuentas', value: s.users, hint: `${s.newUsers} esta semana`, tab: 'usuarios' },
    { label: 'Suspendidas', value: s.banned, tab: 'usuarios' },
    { label: 'Novedades publicadas', value: s.releases.published, hint: s.releases.drafts ? `${s.releases.drafts} borradores` : undefined, tab: 'novedades' },
  ];
  return (
    <div className="admin-stats">
      {tiles.map((t) => (
        <button key={t.label} type="button" className={`admin-stat${t.alert ? ' is-alert' : ''}`} onClick={() => go(t.tab)}>
          <span className="admin-stat-value">{t.value}</span>
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
  { value: 'all', label: 'Todas' },
  { value: 'reported', label: 'Con denuncias' },
  { value: 'banned', label: 'Suspendidas' },
  { value: 'admins', label: 'Admins' },
];

function banLabel(u: Pick<AdminUser, 'banned' | 'bannedUntil'>): string {
  if (!u.banned) return '';
  return u.bannedUntil ? `Suspendida hasta el ${longDate(u.bannedUntil)}` : 'Suspendida indefinidamente';
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
          <input type="search" value={q} placeholder="Email, @usuario o nombre" aria-label="Buscar cuentas" onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="chips chips-small" role="group" aria-label="Filtrar">
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
      {!data && !error && <Spinner label="Cargando cuentas…" />}
      {data && data.data.length === 0 && <p className="muted">Ninguna cuenta con ese filtro.</p>}
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
                    {u.email} · desde {longDate(u.createdAt)}
                  </small>
                </span>
                <span className="admin-user-flags">
                  {u.role === 'ADMIN' && <span className="admin-pill">Admin</span>}
                  {u.openReports > 0 && <span className="admin-pill is-warn">{u.openReports === 1 ? '1 denuncia' : `${u.openReports} denuncias`}</span>}
                  {u.banned && <span className="admin-pill is-danger">Suspendida</span>}
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
  { days: 1, label: '1 día' },
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 0, label: 'Indefinida' },
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
    <Modal title={u ? personName(u) : 'Cuenta'} onClose={onClose} wide className="admin-user-dialog">
      {!u && !error && <Spinner label="Cargando…" />}
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
              <p className="muted small">Cuenta creada el {longDate(u.createdAt)}</p>
              <Link to={profilePath(u)} className="small" onClick={onClose}>
                Ver perfil público
              </Link>
            </div>
          </div>
          <dl className="admin-counts">
            {(
              [
                ['Outfits', u.counts.outfits],
                ['Armarios', u.counts.wardrobes],
                ['Seguidores', u.counts.followers],
                ['Siguiendo', u.counts.following],
                ['Ideas', u.counts.ideas],
                ['Denuncias hechas', u.counts.reportsMade],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          <section className="admin-section">
            <h3 className="panel-title">Suspensión</h3>
            {u.banned ? (
              <div className="stack">
                <p className="danger-text">
                  {banLabel(u)}.{u.banReason && ` Motivo: ${u.banReason}`}
                </p>
                <div>
                  <button type="button" className="btn" disabled={busy} onClick={() => void unban()}>
                    {busy ? <Busy text="Levantando…" /> : 'Levantar la suspensión'}
                  </button>
                </div>
              </div>
            ) : u.role === 'ADMIN' || u.id === me?.id ? (
              <p className="muted small">Las cuentas de admin no se pueden suspender (primero se le quita el rol en el servidor).</p>
            ) : (
              <form className="stack" onSubmit={ban}>
                <label className="field">
                  <span>Motivo (lo verá la persona al intentar entrar)</span>
                  <input value={reason} maxLength={300} minLength={3} required onChange={(e) => setReason(e.target.value)} placeholder="Ej.: spam repetido en mensajes" />
                </label>
                <div className="chips chips-small" role="radiogroup" aria-label="Duración">
                  {BAN_DURATIONS.map((d) => (
                    <button key={d.days} type="button" role="radio" aria-checked={days === d.days} className={`chip${days === d.days ? ' is-active' : ''}`} onClick={() => setDays(d.days)}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="muted small">Se cierra su sesión al momento y no podrá entrar (ni con Google/Apple) hasta que acabe o la levantes. Su perfil deja de verse.</p>
                <div>
                  <button type="submit" className="btn btn-danger-solid" disabled={busy || reason.trim().length < 3}>
                    {busy ? <Busy text="Suspendiendo…" /> : 'Suspender la cuenta'}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="admin-section">
            <h3 className="panel-title">Denuncias recibidas ({u.reports.length})</h3>
            {u.reports.length === 0 ? (
              <p className="muted small">Ninguna.</p>
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
            <h3 className="panel-title">Historial de moderación</h3>
            {u.actions.length === 0 ? <p className="muted small">Nada todavía.</p> : <ActionList actions={u.actions} />}
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
  if (type === 'MESSAGE') text = s('body') ?? (s('outfitName') ? `Outfit enviado: ${s('outfitName')}` : null);
  if (type === 'OUTFIT') text = [s('name'), s('description')].filter(Boolean).join(' — ');
  if (type === 'IDEA') text = [s('title'), s('body')].filter(Boolean).join(' — ');
  if (type === 'LISTING') text = [s('title'), s('price') && `${s('price')} ${s('currency') ?? ''}`.trim(), s('description')].filter(Boolean).join(' — ');
  if (type === 'USER') text = [s('displayName'), s('username') && `@${s('username')}`, s('bio')].filter(Boolean).join(' · ');
  if (!text) return null;
  return <blockquote className="admin-snapshot">{text}</blockquote>;
}

const REPORT_FILTERS: { value: ReportStatus | ''; label: string }[] = [
  { value: 'OPEN', label: 'Abiertas' },
  { value: 'RESOLVED', label: 'Resueltas' },
  { value: 'DISMISSED', label: 'Descartadas' },
  { value: '', label: 'Todas' },
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
      <div className="chips chips-small" role="group" aria-label="Filtrar">
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
      <p className="muted small">Por privacidad no puedes leer los chats: de un mensaje solo ves la copia que se guardó al denunciarlo.</p>
      <ErrorNote error={error} />
      {!data && !error && <Spinner label="Cargando denuncias…" />}
      {data && data.data.length === 0 && <p className="muted">{status === 'OPEN' ? 'No hay denuncias pendientes. 👌' : 'Nada por aquí.'}</p>}
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
        {r.targetState !== 'visible' && <span className="admin-pill is-muted">{r.targetState === 'hidden' ? 'Ya oculto' : 'Ya borrado'}</span>}
      </header>

      <p className="small">
        <span className="muted">Denunciado: </span>
        {r.targetUser ? (
          <button type="button" className="btn-link" onClick={() => onOpenUser(r.targetUser!.id)}>
            {personName(r.targetUser)}
            {r.targetUser.username ? ` (@${r.targetUser.username})` : ''}
          </button>
        ) : (
          'cuenta eliminada'
        )}
        {r.targetUser?.banned && <span className="admin-pill is-danger"> Suspendida</span>}
        <span className="muted"> · por </span>
        {r.reporter ? personName(r.reporter) : 'cuenta eliminada'}
      </p>
      <Snapshot type={r.targetType} snapshot={r.snapshot} />
      {r.details && <p className="small">«{r.details}»</p>}
      {r.resolution && <p className="small muted">Resolución: {r.resolution}</p>}

      {r.status === 'OPEN' && (
        <div className="stack admin-report-actions">
          <div className="actions">
            {r.targetType === 'MESSAGE' && r.targetState === 'visible' && (
              <button type="button" className="btn btn-small btn-danger" disabled={busy} onClick={() => void run(() => adminApi.deleteMessage(r.targetId))}>
                <Icon name="trash" size={13} /> Borrar el mensaje
              </button>
            )}
            {r.targetType === 'OUTFIT' && r.targetState !== 'deleted' && (
              <button type="button" className="btn btn-small" disabled={busy} onClick={() => void run(() => adminApi.hideOutfit(r.targetId, r.targetState !== 'hidden'))}>
                <Icon name="eyeOff" size={13} /> {r.targetState === 'hidden' ? 'Volver a mostrar el outfit' : 'Ocultar el outfit'}
              </button>
            )}
            {r.targetType === 'LISTING' && r.targetState !== 'deleted' && (
              <button type="button" className="btn btn-small" disabled={busy} onClick={() => void run(() => adminApi.hideListing(r.targetId, r.targetState !== 'hidden'))}>
                <Icon name="eyeOff" size={13} /> {r.targetState === 'hidden' ? 'Volver a mostrar el anuncio' : 'Ocultar el anuncio'}
              </button>
            )}
            {r.targetType === 'IDEA' && r.targetState !== 'deleted' && (
              <button type="button" className="btn btn-small" disabled={busy} onClick={() => void run(() => adminApi.updateIdea(r.targetId, { hidden: r.targetState !== 'hidden' }))}>
                <Icon name="eyeOff" size={13} /> {r.targetState === 'hidden' ? 'Volver a mostrar la idea' : 'Ocultar la idea'}
              </button>
            )}
            {r.targetUser && !r.targetUser.banned && r.targetUser.role !== 'ADMIN' && (
              <button type="button" className="btn btn-small btn-danger" onClick={() => onOpenUser(r.targetUser!.id)}>
                Suspender…
              </button>
            )}
          </div>
          <input value={resolution} maxLength={300} placeholder="Nota interna (opcional): qué se ha hecho" aria-label="Nota de la resolución" onChange={(e) => setResolution(e.target.value)} />
          <div className="actions">
            <label className="check">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Avisar a quien denunció
            </label>
            <span className="spacer" />
            <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void close('DISMISSED')}>
              Descartar
            </button>
            <button type="button" className="btn btn-small btn-primary" disabled={busy} onClick={() => void close('RESOLVED')}>
              Resuelta
            </button>
          </div>
        </div>
      )}
      {r.status !== 'OPEN' && (
        <div className="actions">
          <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => void run(() => adminApi.updateReport(r.id, { status: 'OPEN', notifyReporter: false }))}>
            Reabrir
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
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={14} /> Nueva novedad
        </button>
        <Link to="/novedades" className="btn btn-ghost">
          Ver la página pública
        </Link>
      </div>
      {notice && <p className="note">{notice}</p>}
      <ErrorNote error={error} />
      {!data && !error && <Spinner label="Cargando…" />}
      {data && data.data.length === 0 && <p className="muted">Aún no hay ninguna. Escribe la primera: se guarda como borrador hasta que la publiques.</p>}
      {data && data.data.length > 0 && (
        <ul className="admin-releases">
          {data.data.map((r) => (
            <li key={r.id} className={`admin-release panel${r.publishedAt ? '' : ' is-draft'}`}>
              <div className="admin-release-head">
                <div>
                  <span className={`admin-pill${r.publishedAt ? '' : ' is-warn'}`}>{r.publishedAt ? `Publicada el ${longDate(r.publishedAt)}` : 'Borrador'}</span>
                  {r.version && <span className="muted small"> v{r.version.replace(/^v/i, '')}</span>}
                  <h3>{r.title}</h3>
                </div>
                <div className="actions">
                  <button type="button" className="btn btn-small" onClick={() => setEditing(r)}>
                    <Icon name="edit" size={13} /> Editar
                  </button>
                  {r.publishedAt ? (
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => void run(() => adminApi.unpublishRelease(r.id))}>
                      Retirar
                    </button>
                  ) : (
                    <button type="button" className="btn btn-small btn-primary" onClick={() => setPublishing(r)}>
                      <Icon name="megaphone" size={13} /> Publicar
                    </button>
                  )}
                  <button type="button" className="icon-btn" aria-label={`Borrar «${r.title}»`} onClick={() => setDeleting(r)}>
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
            setNotice(n > 0 ? `Publicada. Aviso enviado a ${n} ${n === 1 ? 'cuenta' : 'cuentas'}.` : 'Publicada.');
            load();
          }}
        />
      )}
      {deleting && (
        <Modal title="Borrar novedad" onClose={() => setDeleting(null)}>
          <div className="stack">
            <p>
              ¿Borrar «{deleting.title}»? {deleting.publishedAt ? 'Dejará de verse en Novedades. ' : ''}No se puede deshacer.
            </p>
            <div className="dialog-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setDeleting(null)}>
                Cancelar
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
                Borrar
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
    <Modal title={release ? 'Editar novedad' : 'Nueva novedad'} onClose={onClose} wide>
      <form className="stack" onSubmit={save}>
        <div className="row release-editor-row">
          <label className="field">
            <span>Título</span>
            <input value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} placeholder="Chats en tiempo real" />
          </label>
          <label className="field">
            <span>Versión (opcional)</span>
            <input value={version} maxLength={30} onChange={(e) => setVersion(e.target.value)} placeholder="1.4" />
          </label>
        </div>
        <fieldset className="field">
          <legend>Tipo</legend>
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
            Texto
            <button type="button" className="link-btn" onClick={() => setPreview((v) => !v)}>
              {preview ? 'Editar' : 'Vista previa'}
            </button>
          </span>
          {preview ? (
            <div className="release-preview">{body.trim() ? <ReleaseBody text={body} /> : <p className="muted">Nada que ver todavía.</p>}</div>
          ) : (
            <textarea
              rows={10}
              maxLength={8000}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={'Ya puedes hablar con tus amigos dentro de MyOut.\n\n- Chats 1 a 1 y de grupo\n- Envía outfits por mensaje'}
            />
          )}
          <small className="muted">Una línea en blanco separa párrafos; las líneas que empiezan por «- » forman una lista.</small>
        </div>
        <ErrorNote error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || title.trim().length < 3 || body.trim().length < 10}>
            {busy ? <Busy text="Guardando…" /> : release ? 'Guardar' : 'Guardar borrador'}
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
    <Modal title="Publicar novedad" onClose={onClose}>
      <div className="stack">
        <p>
          «{release.title}» aparecerá en <strong>Novedades</strong>.
        </p>
        <label className="check">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Mandar un aviso a todas las cuentas
        </label>
        <p className="muted small">El aviso solo se manda la primera vez que se publica.</p>
        <ErrorNote error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void publish()}>
            {busy ? <Busy text="Publicando…" /> : 'Publicar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- registro

const ACTION_LABEL: Record<string, string> = {
  'user.ban': 'suspendió a',
  'user.unban': 'levantó la suspensión de',
  'idea.update': 'actualizó una idea de',
  'idea.delete': 'borró una idea de',
  'report.update': 'revisó una denuncia sobre',
  'outfit.hide': 'ocultó un outfit de',
  'outfit.unhide': 'volvió a mostrar un outfit de',
  'message.delete': 'borró un mensaje de',
  'release.create': 'creó la novedad',
  'release.update': 'editó la novedad',
  'release.publish': 'publicó la novedad',
  'release.unpublish': 'retiró la novedad',
  'release.delete': 'borró la novedad',
};

function actionDetail(a: AdminAction): string {
  const d = a.details ?? {};
  const str = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : null);
  if (a.action.startsWith('release.')) return str('title') ? `«${str('title')}»` : '';
  if (a.action === 'user.ban') return [str('reason') && `Motivo: ${str('reason')}`, typeof d.days === 'number' ? `${d.days} días` : 'indefinida'].filter(Boolean).join(' · ');
  if (a.action === 'idea.update' && typeof d.status === 'string') return `Estado: ${IDEA_STATUS_LABEL[d.status as keyof typeof IDEA_STATUS_LABEL] ?? d.status}`;
  if (a.action === 'report.update' && typeof d.status === 'string') return REPORT_STATUS_LABEL[d.status as ReportStatus] ?? '';
  if (a.action.startsWith('outfit.') || a.action === 'idea.delete') return str('name') ?? str('title') ?? '';
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
              <strong>{a.admin ? personName(a.admin) : 'Un admin'}</strong> {ACTION_LABEL[a.action] ?? a.action}
              {!a.action.startsWith('release.') &&
                (a.targetUser === undefined ? (
                  ' esta cuenta'
                ) : (
                  <>
                    {' '}
                    <strong>{a.targetUser ? personName(a.targetUser) : 'una cuenta eliminada'}</strong>
                  </>
                ))}
              {detail && (a.action.startsWith('release.') ? <> {detail}</> : <span className="muted"> · {detail}</span>)}
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
  if (!data) return <Spinner label="Cargando…" />;
  if (data.data.length === 0) return <p className="muted">Aún no se ha hecho nada desde el panel.</p>;
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
    <nav className="pager" aria-label="Páginas">
      <button type="button" className="btn btn-small btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Icon name="back" size={13} /> Anterior
      </button>
      <span className="muted small">
        {page} de {totalPages}
      </span>
      <button type="button" className="btn btn-small btn-ghost" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
        Siguiente <Icon name="forward" size={13} />
      </button>
    </nav>
  );
}
