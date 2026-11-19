import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { monitorApi } from '../api/endpoints';
import type { MonitorActivity, MonitorDatabase, MonitorFeedItem, MonitorLevel, MonitorLive, MonitorRange, ReportReason, ReportTarget } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon, type IconName } from '../components/Icon';
import { compact, Sparkline, TimeChart, type TooltipRow } from '../components/monitor/TimeChart';
import { PersonAvatar, personName, profilePath } from '../components/social/PersonAvatar';
import { Spinner } from '../components/Spinner';
import { SectionHead } from '../components/street/SectionHead';
import { REPORT_REASON_LABEL, REPORT_TARGET_LABEL, timeAgo } from '../lib/community';
import { LOCALE_TAG, t } from '../i18n';

const RANGES: { value: MonitorRange; label: string }[] = [
  { value: '1h', label: '1 h' },
  { value: '6h', label: '6 h' },
  { value: '24h', label: '24 h' },
];
const DAYS = [7, 30, 90] as const;
type Days = (typeof DAYS)[number];

const LEVEL_LABEL: Record<MonitorLevel, string> = { ok: t('Todo en orden'), warning: t('Atención'), critical: t('Problema') };

// ------------------------------------------------------------------ formatos

const num = (n: number) => new Intl.NumberFormat(LOCALE_TAG).format(n);
const ms = (n: number | null) => (n === null ? '—' : n < 10 ? `${n.toFixed(1)} ms` : `${Math.round(n)} ms`);
const pct = (n: number) => `${(n * 100).toLocaleString(LOCALE_TAG, { maximumFractionDigits: n < 0.1 ? 1 : 0 })} %`;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE_TAG, { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(LOCALE_TAG, { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function bytes(n: number | null): string {
  if (n === null) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString(LOCALE_TAG, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 })} ${units[i]}`;
}

export function uptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}

// ---------------------------------------------------------------- recargas

/**
 * Pide los datos al entrar y cada `every` ms mientras la pestaña está a la
 * vista. Si una recarga falla se queda lo último que llegó.
 */
function usePoll<T>(fetcher: () => Promise<T>, every: number, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [at, setAt] = useState<number | null>(null);
  const ref = useRef(fetcher);
  ref.current = fetcher;

  const load = useCallback(() => {
    setLoading(true);
    return ref
      .current()
      .then((d) => {
        setData(d);
        setError(null);
        setAt(Date.now());
      })
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load, fetcher]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, every);
    return () => window.clearInterval(id);
  }, [enabled, every, load]);

  return { data, error, loading, at, reload: load };
}

/** "hace 4 s" que se actualiza solo. */
function useNowTick(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

// --------------------------------------------------------------------- página

/** Monitor: estado de la API, tráfico, base de datos y uso de la app. Solo admins. */
export function MonitorPage() {
  const { user } = useAuth();
  if (!user) return <Spinner label={t('Cargando…')} />;
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <Monitor />;
}

function Monitor() {
  const [range, setRange] = useState<MonitorRange>('1h');
  const [days, setDays] = useState<Days>(30);
  const [live, setLive] = useState(true);
  const now = useNowTick();

  const liveFetch = useCallback(() => monitorApi.live(range), [range]);
  const activityFetch = useCallback(() => monitorApi.activity(days), [days]);
  const L = usePoll(liveFetch, 5000, live);
  const D = usePoll(monitorApi.database, 30_000, live);
  const A = usePoll(activityFetch, 60_000, live);
  const F = usePoll(monitorApi.feed, 30_000, live);

  const level = L.data?.status.level;
  const ago = L.at ? Math.max(0, Math.round((now - L.at) / 1000)) : null;

  return (
    <section className="page monitor ux mo">
      <header className="monitor-head ux-head mo-head">
        <div>
          <span className="wd-kicker">
            <Icon name="shield" size={12} /> {t('Admins only')}
          </span>
          <h1 className="wd-title ux-title" data-text={t('Monitor')}>
            {t('Monitor')}
          </h1>
          <p className="ux-lede">{t('Estado de la API, tráfico, base de datos y uso de MyOO, en directo.')}</p>
        </div>
        <div className="monitor-head-side">
          {level ? (
            <span className={`monitor-status is-${level}`} role="status">
              <span className="monitor-led" aria-hidden="true" />
              {LEVEL_LABEL[level]}
            </span>
          ) : (
            <span className="monitor-status">{t('Comprobando…')}</span>
          )}
          <span className="muted small monitor-updated">
            {ago === null ? '—' : ago < 2 ? t('Actualizado ahora') : t('Actualizado hace {ago} s', { ago })}
          </span>
        </div>
      </header>

      <div className="monitor-toolbar" role="toolbar" aria-label={t('Filtros del monitor')}>
        <div className="monitor-filter">
          <span className="monitor-filter-label">{t('Ventana')}</span>
          <div className="segmented segmented-tabs" role="group" aria-label={t('Ventana de tiempo')}>
            {RANGES.map((r) => (
              <button key={r.value} type="button" aria-pressed={range === r.value} onClick={() => setRange(r.value)}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div className="monitor-filter">
          <span className="monitor-filter-label">{t('Uso')}</span>
          <div className="segmented segmented-tabs" role="group" aria-label={t('Días de uso')}>
            {DAYS.map((d) => (
              <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
                {t('{d} días', { d })}
              </button>
            ))}
          </div>
        </div>
        <span className="spacer" />
        <button type="button" className={`btn btn-small monitor-live${live ? ' is-on' : ''}`} aria-pressed={live} onClick={() => setLive((v) => !v)}>
          <span className="monitor-led" aria-hidden="true" />
          {live ? t('En directo') : t('En pausa')}
        </button>
        <button
          type="button"
          className="btn btn-small wd-btn-line"
          onClick={() => {
            void L.reload();
            void D.reload();
            void A.reload();
            void F.reload();
          }}
        >
          <Icon name="refresh" size={13} /> {t('Actualizar')}
        </button>
      </div>

      <SectionHead n={1} title={t('Estado y tráfico')} />
      {L.error && !L.data ? <ErrorNote error={L.error} /> : null}
      {!L.data && !L.error && <Spinner label={t('Cargando el monitor…')} />}
      {L.data && <LiveSection d={L.data} activity={A.data} stale={L.loading && !!L.data} />}
      {L.error && L.data ? <p className="note note-error small">{t('No se ha podido actualizar: se muestran los últimos datos.')}</p> : null}

      <SectionHead n={2} title={t('Base de datos y actividad')} />
      <div className="monitor-grid monitor-grid-2">
        <DatabasePanel d={D.data} error={D.error} />
        <FeedPanel items={F.data} error={F.error} />
      </div>

      <ActivitySection d={A.data} error={A.error} stale={A.loading && !!A.data} />
    </section>
  );
}

// ------------------------------------------------------------------- en vivo

function LiveSection({ d, activity, stale }: { d: MonitorLive; activity: MonitorActivity | null; stale: boolean }) {
  const tp = d.traffic.points;
  const label = (i: number) => hhmm(tp[i].t);
  const step = d.traffic.step;
  const per = step === 1 ? t('por minuto') : t('cada {step} min', { step });
  const s60 = d.summary.last60;
  const sys = d.system.points;

  const trafficTip = (i: number): TooltipRow[] => [
    { label: t('peticiones'), value: num(tp[i].requests), key: true },
    { label: t('errores 4xx'), value: num(tp[i].s4xx) },
    { label: t('errores 5xx'), value: num(tp[i].s5xx) },
    { label: 'p50 / p95', value: `${ms(tp[i].p50)} / ${ms(tp[i].p95)}` },
  ];

  return (
    <>
      <ul className="monitor-checks" aria-label={t('Comprobaciones')}>
        {d.status.checks.map((c) => (
          <li key={c.key} className={`monitor-check is-${c.level}`}>
            <span className="monitor-led" aria-hidden="true" />
            <span className="monitor-check-text">
              <strong>{c.label}</strong>
              <small>{c.detail}</small>
            </span>
            <span className="visually-hidden">{LEVEL_LABEL[c.level]}</span>
          </li>
        ))}
      </ul>

      <div className="monitor-kpis">
        <Kpi label={t('En línea ahora')} value={num(d.realtime.users)} hint={t('{n} conexiones', { n: num(d.realtime.connections) })} spark={sys.map((p) => p.wsConnections)} />
        <Kpi label={t('Peticiones / min')} value={compact(d.summary.last5.perMinute)} hint={t('media de 5 min')} spark={tp.map((p) => p.requests)} />
        <Kpi
          label={t('Errores 5xx')}
          value={pct(s60.errorRate)}
          hint={t('{num} de {num2} en 1 h', { num: num(s60.s5xx), num2: num(s60.requests) })}
          tone={s60.s5xx > 0 ? 'danger' : 'ink'}
          spark={tp.map((p) => p.s5xx)}
        />
        <Kpi label={t('Latencia p95')} value={ms(s60.p95)} hint={t('p50 {ms} · última hora', { ms: ms(s60.p50) })} spark={tp.map((p) => p.p95)} />
        <Kpi label={t('Activos hoy')} value={activity ? num(activity.active.dau) : '—'} hint={activity ? t('{n} esta semana', { n: num(activity.active.wau) }) : t('cargando…')} />
        <Kpi label={t('Denuncias abiertas')} value={activity ? num(activity.totals.openReports) : '—'} hint={t('pendientes de revisar')} link="/admin?tab=denuncias" />
      </div>

      <div className="monitor-grid monitor-grid-traffic">
        <Panel title={t('Peticiones')} sub={per} className="monitor-span-2">
          <TimeChart label={t('Peticiones {per}', { per })} kind="bars" points={tp.map((p, i) => ({ label: label(i), value: p.requests }))} tooltip={trafficTip} height={200} stale={stale} />
        </Panel>
        <Panel title={t('Latencia p95')} sub={t('ms')}>
          <TimeChart label={t('Latencia p95 en milisegundos')} name="p95" points={tp.map((p, i) => ({ label: label(i), value: p.p95 }))} unit=" ms" format={(n) => compact(Math.round(n))} stale={stale} />
        </Panel>
        <Panel title={t('Errores del servidor (5xx)')} sub={per} icon="flag">
          <TimeChart label={t('Errores 5xx {per}', { per })} kind="bars" tone="danger" points={tp.map((p, i) => ({ label: label(i), value: p.s5xx }))} tooltip={trafficTip} stale={stale} />
        </Panel>
      </div>

      <div className="monitor-grid monitor-grid-2">
        <RoutesPanel routes={d.routes} />
        <ErrorsPanel errors={d.errors} />
      </div>

      <Panel title={t('Proceso del servidor')} sub={`Node ${d.process.node} · ${d.process.env}`}>
        <div className="monitor-process">
          <dl className="monitor-facts">
            <Fact k={t('En marcha')} v={uptime(d.process.uptimeSec)} />
            <Fact k={t('Memoria (RSS)')} v={`${compact(d.process.rssMb)} MB`} />
            <Fact k="Heap" v={`${compact(d.process.heapUsedMb)} / ${compact(d.process.heapLimitMb)} MB`} meter={d.process.heapUsedMb / d.process.heapLimitMb} />
            <Fact k="CPU" v={`${compact(d.process.cpuPct)} %`} sub={t('de 1 núcleo · {cpuCores} núcleos', { cpuCores: d.process.cpuCores })} />
            <Fact k={t('Bucle de eventos')} v={ms(d.process.lagP99Ms)} sub={t('retardo p99')} />
            <Fact k={t('Tiempo real')} v={t('{n} conexiones', { n: num(d.realtime.connections) })} sub={t('{n} eventos enviados', { n: compact(d.realtime.eventsSent) })} />
            <Fact k={t('Base de datos')} v={d.database.ok ? ms(d.database.ms) : t('Caída')} sub={t('ping')} />
          </dl>
          {d.system.hasData ? (
            <div className="monitor-small-multiples">
              <Mini title={t('Memoria (MB)')} values={sys.map((p, i) => ({ label: hhmm(sys[i].t), value: p.rssMb }))} stale={stale} />
              <Mini title={t('CPU (%)')} values={sys.map((p, i) => ({ label: hhmm(sys[i].t), value: p.cpuPct }))} stale={stale} />
              <Mini title={t('Retardo del bucle (ms)')} values={sys.map((p, i) => ({ label: hhmm(sys[i].t), value: p.lagP99Ms }))} stale={stale} />
              <Mini title={t('Conexiones en tiempo real')} values={sys.map((p, i) => ({ label: hhmm(sys[i].t), value: p.wsConnections }))} stale={stale} />
            </div>
          ) : (
            <p className="muted small">{t('Las gráficas del proceso empiezan a llenarse al minuto de arrancar.')}</p>
          )}
        </div>
      </Panel>
    </>
  );
}

function Kpi({ label, value, hint, spark, tone = 'ink', link }: { label: string; value: string; hint?: string; spark?: (number | null)[]; tone?: 'ink' | 'danger'; link?: string }) {
  const body = (
    <>
      <span className="monitor-kpi-label">{label}</span>
      <span className={`monitor-kpi-value${tone === 'danger' ? ' is-danger' : ''}`}>{value}</span>
      <span className="monitor-kpi-foot">{hint && <span className="monitor-kpi-hint">{hint}</span>}</span>
      {spark && spark.length > 1 && <Sparkline values={spark.slice(-30)} tone={tone} />}
    </>
  );
  return link ? (
    <Link to={link} className="monitor-kpi is-link">
      {body}
    </Link>
  ) : (
    <div className="monitor-kpi">{body}</div>
  );
}

function Panel({ title, sub, icon, className = '', children, action }: { title: string; sub?: string; icon?: IconName; className?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className={`monitor-panel ${className}`}>
      <header className="monitor-panel-head">
        <h2>
          {icon && <Icon name={icon} size={13} />}
          {title}
        </h2>
        {sub && <span className="monitor-panel-sub">{sub}</span>}
        {action && <span className="monitor-panel-action">{action}</span>}
      </header>
      {children}
    </section>
  );
}

function Fact({ k, v, sub, meter }: { k: string; v: string; sub?: string; meter?: number }) {
  return (
    <div className="monitor-fact">
      <dt>{k}</dt>
      <dd>
        {v}
        {sub && <small>{sub}</small>}
        {meter !== undefined && (
          <span className={`monitor-meter${meter >= 0.95 ? ' is-critical' : meter >= 0.85 ? ' is-warning' : ''}`} aria-hidden="true">
            <span style={{ width: `${Math.min(100, meter * 100)}%` }} />
          </span>
        )}
      </dd>
    </div>
  );
}

function Mini({ title, values, stale }: { title: string; values: { label: string; value: number }[]; stale: boolean }) {
  return (
    <div className="monitor-mini">
      <span className="monitor-mini-title">{title}</span>
      <TimeChart label={title} points={values} height={110} stale={stale} />
    </div>
  );
}

function RoutesPanel({ routes }: { routes: MonitorLive['routes'] }) {
  const max = Math.max(1, ...routes.map((r) => r.requests));
  return (
    <Panel title={t('Rutas más usadas')} sub={t('última hora')}>
      {routes.length === 0 ? (
        <p className="muted small">{t('Sin peticiones en la última hora.')}</p>
      ) : (
        <div className="monitor-table-wrap">
          <table className="monitor-table">
            <thead>
              <tr>
                <th scope="col">{t('Ruta')}</th>
                <th scope="col" className="num">
                  {t('Peticiones')}
                </th>
                <th scope="col" className="num">
                  {t('4xx')}
                </th>
                <th scope="col" className="num">
                  {t('5xx')}
                </th>
                <th scope="col" className="num">
                  p95
                </th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={`${r.method} ${r.route}`}>
                  <td>
                    <span className="monitor-route">
                      <span className={`monitor-method m-${r.method.toLowerCase()}`}>{r.method}</span>
                      <code title={r.route}>{r.route.replace(/^\/api/, '')}</code>
                    </span>
                    <span className="monitor-share" aria-hidden="true">
                      <span style={{ width: `${(r.requests / max) * 100}%` }} />
                    </span>
                  </td>
                  <td className="num">{num(r.requests)}</td>
                  <td className="num muted">{r.s4xx ? num(r.s4xx) : '·'}</td>
                  <td className={`num${r.s5xx ? ' danger-text' : ' muted'}`}>{r.s5xx ? num(r.s5xx) : '·'}</td>
                  <td className="num">{ms(r.p95)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function ErrorsPanel({ errors }: { errors: MonitorLive['errors'] }) {
  return (
    <Panel title={t('Últimos errores del servidor')} sub={t('5xx · desde que arrancó')} icon="flag">
      {errors.length === 0 ? (
        <p className="monitor-empty">
          <Icon name="check" size={14} /> {t('Ningún error 5xx.')}
        </p>
      ) : (
        <ul className="monitor-errors">
          {errors.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <span className="monitor-err-status">{e.status}</span>
              <span className="monitor-err-main">
                <span className="monitor-route">
                  <span className={`monitor-method m-${e.method.toLowerCase()}`}>{e.method}</span>
                  <code>{e.route.replace(/^\/api/, '')}</code>
                </span>
                <small className="muted">
                  {t('{v} · {round} ms', { v: e.error ?? t('Error'), round: Math.round(e.ms) })}
                </small>
              </span>
              <time dateTime={e.at} className="muted small">
                {timeAgo(e.at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------ base de datos

function DatabasePanel({ d, error }: { d: MonitorDatabase | null; error: unknown }) {
  const maxBytes = Math.max(1, ...(d?.tables.map((t) => t.bytes) ?? [1]));
  return (
    <Panel title={t('Base de datos')} sub={d?.version ? `PostgreSQL ${d.version.split(' ')[0]}` : undefined}>
      {error && !d ? <ErrorNote error={error} /> : null}
      {!d && !error && <Spinner size={16} label={t('Cargando…')} />}
      {d && !d.ok && <p className="note note-error">{t('La base de datos no responde.')}</p>}
      {d?.ok && (
        <>
          <dl className="monitor-facts monitor-facts-row">
            <Fact k={t('Ping')} v={ms(d.ms)} />
            <Fact k={t('Tamaño')} v={bytes(d.sizeBytes)} />
            <Fact k={t('Conexiones')} v={d.connections === null ? '—' : num(d.connections)} />
          </dl>
          <div className="monitor-table-wrap">
            <table className="monitor-table">
              <thead>
                <tr>
                  <th scope="col">{t('Tabla')}</th>
                  <th scope="col" className="num">
                    {t('Filas')}
                  </th>
                  <th scope="col" className="num">
                    {t('Tamaño')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.tables.slice(0, 10).map((t) => (
                  <tr key={t.name}>
                    <td>
                      <code>{t.name}</code>
                      <span className="monitor-share" aria-hidden="true">
                        <span style={{ width: `${(t.bytes / maxBytes) * 100}%` }} />
                      </span>
                    </td>
                    <td className="num">{num(t.rows)}</td>
                    <td className="num">{bytes(t.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------ eventos

const FEED_ICON: Record<MonitorFeedItem['kind'], IconName> = { signup: 'users', report: 'flag', idea: 'bulb', release: 'megaphone', admin: 'shield' };
const ADMIN_ACTION: Record<string, string> = {
  'user.ban': t('suspendió una cuenta'),
  'user.unban': t('levantó una suspensión'),
  'idea.update': t('actualizó una idea'),
  'idea.delete': t('borró una idea'),
  'report.update': t('revisó una denuncia'),
  'outfit.hide': t('ocultó un outfit'),
  'outfit.unhide': t('volvió a mostrar un outfit'),
  'message.delete': t('borró un mensaje denunciado'),
  'release.create': t('creó una novedad'),
  'release.update': t('editó una novedad'),
  'release.publish': t('publicó una novedad'),
  'release.unpublish': t('retiró una novedad'),
  'release.delete': t('borró una novedad'),
};

function feedText(i: MonitorFeedItem): { text: string; link?: string } {
  switch (i.kind) {
    case 'signup':
      return { text: t('{personName} se ha registrado', { personName: personName(i.user) }), link: i.user ? profilePath(i.user) : undefined };
    case 'report': {
      const [target, reason] = (i.meta ?? '').split(':') as [ReportTarget, ReportReason];
      return { text: t('Denuncia de {toLowerCase} · {v}', { toLowerCase: (REPORT_TARGET_LABEL[target] ?? t('contenido')).toLowerCase(), v: REPORT_REASON_LABEL[reason] ?? '' }), link: '/admin?tab=denuncias' };
    }
    case 'idea':
      return { text: t('Idea: «{title}»', { title: i.title }), link: i.meta ? `/ideas?idea=${i.meta}` : '/ideas' };
    case 'release':
      return { text: t('Novedad publicada: «{title}»', { title: i.title }), link: '/novedades' };
    default:
      return { text: t('{who} {action}', { who: i.user ? personName(i.user) : t('Un admin'), action: ADMIN_ACTION[i.title] ?? i.title }), link: '/admin?tab=registro' };
  }
}

function FeedPanel({ items, error }: { items: MonitorFeedItem[] | null; error: unknown }) {
  return (
    <Panel title={t('Últimos eventos')}>
      {error && !items ? <ErrorNote error={error} /> : null}
      {!items && !error && <Spinner size={16} label={t('Cargando…')} />}
      {items && items.length === 0 && <p className="muted small">{t('Nada todavía.')}</p>}
      {items && items.length > 0 && (
        <ol className="monitor-feed">
          {items.map((i) => {
            const f = feedText(i);
            const content = (
              <>
                <span className={`monitor-feed-icon k-${i.kind}`}>
                  {i.kind === 'signup' && i.user ? <PersonAvatar person={i.user} size={24} /> : <Icon name={FEED_ICON[i.kind]} size={13} />}
                </span>
                <span className="monitor-feed-text">{f.text}</span>
                <time dateTime={i.at} className="muted small">
                  {timeAgo(i.at)}
                </time>
              </>
            );
            return <li key={i.id}>{f.link ? <Link to={f.link}>{content}</Link> : <span>{content}</span>}</li>;
          })}
        </ol>
      )}
    </Panel>
  );
}

// --------------------------------------------------------------------- uso

const DAILY_ORDER = ['active', 'signups', 'outfits', 'items', 'messages', 'ideas', 'reports'];

function ActivitySection({ d, error, stale }: { d: MonitorActivity | null; error: unknown; stale: boolean }) {
  return (
    <section className="monitor-section" aria-labelledby="mon-uso">
      <SectionHead n={3} id="mon-uso" title={t('Uso de la app')}>
        {d && <span className="ux-section-count">{t('Días en hora de Madrid · {days} días', { days: d.days })}</span>}
      </SectionHead>
      {error && !d ? <ErrorNote error={error} /> : null}
      {!d && !error && <Spinner label={t('Cargando el uso…')} />}
      {d && (
        <>
          <div className="monitor-kpis monitor-kpis-usage">
            <Kpi label={t('Activos hoy (DAU)')} value={num(d.active.dau)} />
            <Kpi label={t('Últimos 7 días (WAU)')} value={num(d.active.wau)} />
            <Kpi label={t('Últimos 30 días (MAU)')} value={num(d.active.mau)} />
            <Kpi label={t('Fidelidad (DAU/MAU)')} value={d.active.mau ? pct(d.active.dau / d.active.mau) : '—'} hint={t('vuelven cada día')} />
            <Kpi label={t('Cuentas')} value={num(d.totals.users)} hint={d.totals.banned ? t('{n} suspendidas', { n: num(d.totals.banned) }) : t('ninguna suspendida')} />
          </div>

          <div className="monitor-small-multiples monitor-daily">
            {DAILY_ORDER.filter((k) => d.daily[k]).map((k) => {
              const s = d.daily[k];
              return (
                <div key={k} className="monitor-mini">
                  <span className="monitor-mini-title">
                    {s.label}
                    <strong>{num(s.total)}</strong>
                  </span>
                  <TimeChart
                    label={t('{label} por día', { label: s.label })}
                    kind="bars"
                    height={120}
                    stale={stale}
                    points={s.points.map((p) => ({ label: dayLabel(p.day), value: p.value }))}
                  />
                </div>
              );
            })}
          </div>

          <Panel title={t('Totales')}>
            <dl className="monitor-totals">
              <Fact k={t('Armarios')} v={num(d.totals.wardrobes)} />
              <Fact k={t('Prendas')} v={num(d.totals.items)} />
              <Fact k={t('Outfits')} v={num(d.totals.outfits)} sub={t('{n} compartidos', { n: num(d.totals.sharedOutfits) })} />
              <Fact k={t('Conversaciones')} v={num(d.totals.conversations)} />
              <Fact k={t('Mensajes')} v={num(d.totals.messages)} />
              <Fact k={t('Seguimientos')} v={num(d.totals.follows)} />
              <Fact k={t('Ideas')} v={num(d.totals.ideas)} />
              <Fact k={t('Imágenes subidas')} v={num(d.totals.assets)} sub={bytes(d.totals.assetBytes)} />
            </dl>
          </Panel>
        </>
      )}
    </section>
  );
}
