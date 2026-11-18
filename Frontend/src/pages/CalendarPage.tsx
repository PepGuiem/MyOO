import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { calendarApi } from '../api/endpoints';
import type { CalendarEntry, CalendarInsights, CalendarSuggestion } from '../api/types';
import { DayDetail, StyleTag } from '../components/calendar/DayDetail';
import { DayPanel } from '../components/calendar/DayPanel';
import { OutfitGlyph } from '../components/calendar/OutfitGlyph';
import { ErrorNote } from '../components/ErrorNote';
import { SoundToggle } from '../components/fx/SoundToggle';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { ScoreRing } from '../components/rating/RatingGauge';
import { SectionHead } from '../components/street/SectionHead';
import { CountUp } from '../components/street/Street';
import { useBodyShape } from '../lib/bodyPref';
import { EVENT_KINDS } from '../lib/calendar';
import {
  WEEKDAYS_SHORT,
  addDays,
  addMonths,
  diffDays,
  monthGrid,
  monthLabel,
  relativeDay,
  sameMonth,
  shortDay,
  startOfWeek,
  todayKey,
  type DayKey,
} from '../lib/dates';
import { OUTFIT_STYLES } from '../lib/outfitStyles';
import { play } from '../lib/sfx';
import { OutfitView } from '../three/OutfitMannequin';
import { t } from '../i18n';

type View = 'month' | 'week' | 'day';
const VIEWS: { id: View; label: string }[] = [
  { id: 'month', label: t('Mes') },
  { id: 'week', label: t('Semana') },
  { id: 'day', label: t('Día') },
];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function rangeFor(view: View, cursor: DayKey): [DayKey, DayKey] {
  if (view === 'month') {
    const g = monthGrid(cursor);
    return [g[0], g[g.length - 1]];
  }
  if (view === 'week') {
    const s = startOfWeek(cursor);
    return [s, addDays(s, 6)];
  }
  return [cursor, cursor];
}

/**
 * OUTFIT CALENDAR: qué te pones cada día. Mes, semana o día; cada día lleva
 * la miniatura del outfit, su nombre y su estilo, y al pulsarlo se abre el
 * detalle. A la derecha, lo próximo, eventos, repeticiones y estadísticas.
 */
export function CalendarPage() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const today = todayKey();
  const initial = params.get('date');
  const [view, setView] = useState<View>(() => (['month', 'week', 'day'].includes(params.get('view') ?? '') ? (params.get('view') as View) : 'month'));
  const [cursor, setCursor] = useState<DayKey>(initial && DAY_RE.test(initial) ? initial : today);
  const [openDay, setOpenDay] = useState<DayKey | null>(initial && DAY_RE.test(initial) && view !== 'day' ? initial : null);
  const [dir, setDir] = useState<'next' | 'prev' | 'none'>('none');
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [insights, setInsights] = useState<CalendarInsights | null>(null);
  const [fresh, setFresh] = useState<DayKey | null>(null);
  const [version, setVersion] = useState(0);

  const [from, to] = rangeFor(view, cursor);

  // Recuerda vista y día en la URL (para volver desde el editor).
  useEffect(() => {
    const next = new URLSearchParams();
    if (view !== 'month') next.set('view', view);
    if (cursor !== today) next.set('date', cursor);
    setParams(next, { replace: true });
  }, [view, cursor, today, setParams]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    calendarApi
      .list(from, to)
      .then((r) => {
        if (!alive) return;
        setEntries(r);
        setError(null);
      })
      .catch((e: unknown) => alive && setError(e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [from, to, version]);

  useEffect(() => {
    let alive = true;
    calendarApi
      .insights(today)
      .then((r) => alive && setInsights(r))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [today, version]);

  const byDay = useMemo(() => {
    const m = new Map<DayKey, CalendarEntry[]>();
    for (const e of entries) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [entries]);

  const refresh = useCallback((info: { assigned?: DayKey } = {}) => {
    setVersion((v) => v + 1);
    if (info.assigned) {
      setFresh(info.assigned);
      window.setTimeout(() => setFresh(null), 1200);
    }
  }, []);

  const move = (n: number) => {
    play('swoosh');
    setDir(n > 0 ? 'next' : 'prev');
    setCursor((c) => (view === 'month' ? addMonths(c, n) : addDays(c, view === 'week' ? 7 * n : n)));
  };

  const open = (d: DayKey) => {
    play('click');
    setCursor(d);
    if (view === 'day') return;
    setOpenDay(d);
  };

  const title =
    view === 'month'
      ? monthLabel(cursor)
      : view === 'week'
        ? `${shortDay(from)} – ${shortDay(to)}`
        : shortDay(cursor);

  const todayEntries = insights?.upcoming.filter((e) => e.date === today) ?? [];

  return (
    <section className="page cal ux cl">

      <header className="cal-hero ux-head">
        <div>
          <span className="wd-kicker">
            <Icon name="calendar" size={12} /> {t('On the calendar')}
          </span>
          <h1 className="wd-title ux-title" data-text={t('Outfit Calendar')}>
            {t('Outfit')} <em>{t('Calendar')}</em>
          </h1>
          <p className="ux-lede">{t('Qué te pones cada día: planifica, marca lo que usas y no repitas sin querer.')}</p>
        </div>
        <div className="wd-head-actions">
          <TodayBanner entries={todayEntries} onOpen={() => open(today)} />
          <SoundToggle />
        </div>
      </header>

      {insights && (
        <ul className="wd-stats ux-stats cl-stats" aria-label={t('Estadísticas')}>
          <li style={{ '--i': 0 } as CSSProperties}>
            <Icon name="check" size={16} />
            <strong>
              <CountUp value={insights.stats.worn30} />
            </strong>
            <span>{t('Usados (30 días)')}</span>
          </li>
          <li style={{ '--i': 1 } as CSSProperties}>
            <Icon name="flame" size={16} />
            <strong>
              <CountUp value={insights.stats.streak} delay={100} />
            </strong>
            <span>
              {t('Racha')} · {insights.stats.streak === 1 ? t('día') : t('días')}
            </span>
          </li>
          <li style={{ '--i': 2 } as CSSProperties}>
            <Icon name="target" size={16} />
            <strong>{insights.stats.wearRate30 === null ? '—' : `${Math.round(insights.stats.wearRate30 * 100)}%`}</strong>
            <span>{t('Cumplidos')}</span>
          </li>
          <li style={{ '--i': 3 } as CSSProperties}>
            <Icon name="sparkles" size={16} />
            <strong>
              <CountUp value={insights.stats.neverWorn} delay={200} />
              <small>/{insights.stats.totalOutfits}</small>
            </strong>
            <span>{t('Sin estrenar')}</span>
          </li>
        </ul>
      )}

      <div className="cal-layout">
        <div className="cal-main">
          <SectionHead n={1} title={t('Agenda')} />
          <div className="cal-toolbar">
            <div className={`view-switch is-${view}`} role="tablist" aria-label={t('Vista')}>
              <span className="tab-thumb" aria-hidden="true" />
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => {
                    play('click');
                    setDir('none');
                    setView(v.id);
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div className="cal-nav">
              <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label={t('Anterior')}>
                <Icon name="back" />
              </button>
              <h2 key={title} className={`cal-title is-${dir}`}>
                {title}
              </h2>
              <button type="button" className="icon-btn" onClick={() => move(1)} aria-label={t('Siguiente')}>
                <Icon name="forward" />
              </button>
            </div>
            <button
              type="button"
              className="btn wd-btn-line cal-today"
              disabled={cursor === today}
              onClick={() => {
                play('click');
                setDir(diffDays(cursor, today) > 0 ? 'next' : 'prev');
                setCursor(today);
              }}
            >
              {t('Hoy')}
            </button>
          </div>

          <ul className="cal-legend" aria-label={t('Leyenda')}>
            <li className="lg-worn">{t('Usado')}</li>
            <li className="lg-plan">{t('Planificado')}</li>
            <li className="lg-event">{t('Evento')}</li>
            <li className="lg-repeat">{t('Se repite')}</li>
          </ul>

          <ErrorNote error={error} />

          {view === 'month' && (
            <MonthView
              key={cursor.slice(0, 7)}
              cursor={cursor}
              today={today}
              byDay={byDay}
              dir={dir}
              loading={loading}
              fresh={fresh}
              selected={openDay}
              onOpen={open}
            />
          )}
          {view === 'week' && (
            <WeekView key={from} from={from} today={today} byDay={byDay} dir={dir} fresh={fresh} onOpen={open} />
          )}
          {view === 'day' && (
            <div key={cursor} className={`cal-dayview is-${dir}`}>
              <DayDetail date={cursor} entries={byDay.get(cursor) ?? []} onChanged={refresh} inline />
            </div>
          )}
        </div>

        <Insights
          insights={insights}
          today={today}
          target={openDay ?? cursor}
          onOpen={open}
          onAssign={async (s, date) => {
            try {
              await calendarApi.create({ date, outfitId: s.outfit.id });
              play('spray');
              toast.show(t('«{name}» para {relativeDay}', { name: s.outfit.name, relativeDay: relativeDay(date, today) }), { icon: 'check' });
              refresh({ assigned: date });
            } catch (err) {
              toast.show(err instanceof Error ? err.message : t('No se pudo asignar'), { tone: 'danger', sound: 'error' });
            }
          }}
          version={version}
        />
      </div>

      {openDay && view !== 'day' && (
        <DayPanel
          date={openDay}
          entries={byDay.get(openDay) ?? []}
          onClose={() => setOpenDay(null)}
          onChanged={refresh}
          onPrev={() => {
            const d = addDays(openDay, -1);
            setOpenDay(d);
            if (!sameMonth(d, cursor) || view === 'week') setCursor(d);
          }}
          onNext={() => {
            const d = addDays(openDay, 1);
            setOpenDay(d);
            if (!sameMonth(d, cursor) || view === 'week') setCursor(d);
          }}
        />
      )}
    </section>
  );
}

/** Recordatorio de hoy, arriba del todo. */
function TodayBanner({ entries, onOpen }: { entries: CalendarEntry[]; onOpen: () => void }) {
  const e = entries[0];
  return (
    <button type="button" className={`today-banner${e ? '' : ' is-empty'}`} onClick={onOpen}>
      {e ? (
        <>
          <OutfitGlyph outfit={e.outfit} height={56} />
          <span>
            <small>{t('Hoy te toca')}</small>
            <b>{e.outfit.name}</b>
            {e.worn ? <em className="is-ok">{t('Ya marcado como usado')}</em> : <em>{t('Toca para marcarlo como usado')}</em>}
          </span>
        </>
      ) : (
        <>
          <span className="today-plus" aria-hidden="true">
            <Icon name="plus" size={18} />
          </span>
          <span>
            <small>{t('Hoy')}</small>
            <b>{t('Sin outfit todavía')}</b>
            <em>{t('Elige qué te pones')}</em>
          </span>
        </>
      )}
    </button>
  );
}

function DayBadges({ list }: { list: CalendarEntry[] }) {
  const repeat = list.find((e) => e.repeat);
  const ev = list.find((e) => e.eventName);
  const worn = list.some((e) => e.worn);
  return (
    <>
      {ev && (
        <span className="cell-event" style={{ '--c': EVENT_KINDS[ev.eventKind ?? 'OTHER'].color } as CSSProperties} title={ev.eventName ?? ''}>
          {ev.eventName}
        </span>
      )}
      <span className="cell-flags">
        {repeat?.repeat && (
          <span className={`cell-repeat is-${repeat.repeat.level}`} title={repeat.repeat.text}>
            <Icon name="refresh" size={11} />
            <span className="visually-hidden">{repeat.repeat.text}</span>
          </span>
        )}
        {worn && <span className="cell-worn">{t('Usado')}</span>}
      </span>
    </>
  );
}

function MonthView({
  cursor,
  today,
  byDay,
  dir,
  loading,
  fresh,
  selected,
  onOpen,
}: {
  cursor: DayKey;
  today: DayKey;
  byDay: Map<DayKey, CalendarEntry[]>;
  dir: 'next' | 'prev' | 'none';
  loading: boolean;
  fresh: DayKey | null;
  selected: DayKey | null;
  onOpen: (d: DayKey) => void;
}) {
  const days = monthGrid(cursor);
  return (
    <div className={`cal-month is-${dir}${loading ? ' is-loading' : ''}`}>
      {WEEKDAYS_SHORT.map((w) => (
        <span key={w} className="cal-wd">
          {w}
        </span>
      ))}
      {days.map((d, i) => {
        const list = byDay.get(d) ?? [];
        const first = list[0];
        const past = diffDays(today, d) < 0;
        const worn = list.some((e) => e.worn);
        const cls = [
          'cal-cell',
          sameMonth(d, cursor) ? '' : 'is-out',
          d === today ? 'is-today' : '',
          past ? 'is-past' : '',
          first ? 'has-outfit' : '',
          worn ? 'is-worn' : '',
          first && past && !worn ? 'is-missed' : '',
          d === selected ? 'is-selected' : '',
          d === fresh ? 'is-fresh' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <button
            key={d}
            type="button"
            className={cls}
            style={{ '--i': i } as CSSProperties}
            onClick={() => onOpen(d)}
            aria-label={`${shortDay(d)}${first ? `: ${list.map((e) => e.outfit.name).join(', ')}` : t(', sin outfit')}`}
          >
            <span className="cell-top">
              <span className="cell-num">{Number(d.slice(8))}</span>
              {d === today && <span className="cell-today">{t('Hoy')}</span>}
              <DayBadges list={list} />
            </span>
            {first ? (
              <span className="cell-body">
                <OutfitGlyph outfit={first.outfit} height={58} />
                <span className="cell-info">
                  <span className="cell-name">{first.outfit.name}</span>
                  <StyleTag outfit={first.outfit} />
                  {list.length > 1 && <span className="cell-more">+{list.length - 1}</span>}
                </span>
              </span>
            ) : (
              <span className="cell-empty" aria-hidden="true">
                <Icon name="plus" size={16} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function WeekView({
  from,
  today,
  byDay,
  dir,
  fresh,
  onOpen,
}: {
  from: DayKey;
  today: DayKey;
  byDay: Map<DayKey, CalendarEntry[]>;
  dir: 'next' | 'prev' | 'none';
  fresh: DayKey | null;
  onOpen: (d: DayKey) => void;
}) {
  const { shape } = useBodyShape();
  const [hover, setHover] = useState<DayKey | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  return (
    <div className={`cal-week is-${dir}`}>
      {days.map((d, i) => {
        const list = byDay.get(d) ?? [];
        const first = list[0];
        const worn = list.some((e) => e.worn);
        return (
          <button
            key={d}
            type="button"
            className={`week-col${d === today ? ' is-today' : ''}${worn ? ' is-worn' : ''}${d === fresh ? ' is-fresh' : ''}${first ? '' : ' is-empty'}`}
            style={{ '--i': i } as CSSProperties}
            onClick={() => onOpen(d)}
            onMouseEnter={() => setHover(d)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="week-head">
              <span className="week-wd">{WEEKDAYS_SHORT[i]}</span>
              <span className="week-num">{Number(d.slice(8))}</span>
              <DayBadges list={list} />
            </span>
            {first ? (
              <>
                <span className="week-stage">
                  <OutfitView
                    className="tile-view"
                    garments={first.outfit.items.map((it) => ({ ...it.wardrobeItem, styling: it.styling }))}
                    shape={shape}
                    active={hover === d}
                    distance={4}
                  />
                </span>
                <span className="week-name">{first.outfit.name}</span>
                <span className="week-tags">
                  <StyleTag outfit={first.outfit} />
                  <ScoreRing value={first.outfit.ratingScore} size={28} />
                </span>
                {first.note && <span className="week-note">{first.note}</span>}
                {list.length > 1 && <span className="cell-more">{t('+{v} más', { v: list.length - 1 })}</span>}
              </>
            ) : (
              <span className="week-empty">
                <Icon name="plus" size={20} />
                {t('Asignar')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Columna derecha: lo próximo, eventos, repeticiones, sin estrenar y estadísticas. */
function Insights({
  insights,
  today,
  target,
  onOpen,
  onAssign,
  version,
}: {
  insights: CalendarInsights | null;
  today: DayKey;
  target: DayKey;
  onOpen: (d: DayKey) => void;
  onAssign: (s: CalendarSuggestion, date: DayKey) => void;
  version: number;
}) {
  const [suggested, setSuggested] = useState<CalendarSuggestion[]>([]);
  const assignTo = diffDays(today, target) >= 0 ? target : today;
  useEffect(() => {
    let alive = true;
    calendarApi
      .suggestions(assignTo, 4)
      .then((s) => alive && setSuggested(s))
      .catch(() => alive && setSuggested([]));
    return () => {
      alive = false;
    };
  }, [assignTo, version]);

  if (!insights) return <aside className="cal-side is-loading" aria-busy="true" />;
  const s = insights.stats;
  const maxWd = Math.max(1, ...s.byWeekday);
  const maxTop = Math.max(1, ...s.topWorn.map((t) => t.count));
  const maxStyle = Math.max(1, ...s.byStyle.map((t) => t.count));

  return (
    <aside className="cal-side" aria-label={t('Resumen del calendario')}>
      <section className="side-card">
        <h3>
          <Icon name="bell" size={14} /> {t('Próximos 7 días')}
        </h3>
        {insights.upcoming.length === 0 ? (
          <p className="muted small">{t('Nada planificado. Elige qué te pones esta semana.')}</p>
        ) : (
          <ul className="upcoming">
            {insights.upcoming.map((e, i) => (
              <li key={e.id} style={{ '--i': i } as CSSProperties}>
                <button type="button" onClick={() => onOpen(e.date)}>
                  <OutfitGlyph outfit={e.outfit} height={40} />
                  <span>
                    <small className={e.date === today ? 'is-today' : ''}>{relativeDay(e.date, today)}</small>
                    <b>{e.outfit.name}</b>
                  </span>
                  {e.worn && <Icon name="check" size={14} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {insights.events.length > 0 && (
        <section className="side-card">
          <h3>
            <Icon name="flag" size={14} /> {t('Eventos')}
          </h3>
          <ul className="events">
            {insights.events.map((e) => (
              <li key={e.id} style={{ '--c': EVENT_KINDS[e.eventKind ?? 'OTHER'].color } as CSSProperties}>
                <button type="button" onClick={() => onOpen(e.date)}>
                  <span className="ev-count">
                    {diffDays(today, e.date) === 0 ? t('Hoy') : <>{diffDays(today, e.date)}<small>{t('días')}</small></>}
                  </span>
                  <span>
                    <b>{e.eventName}</b>
                    <small>
                      {shortDay(e.date)} · {e.outfit.name}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {insights.repeats.length > 0 && (
        <section className="side-card is-warn">
          <h3>
            <Icon name="refresh" size={14} /> {t('Se repiten')}
          </h3>
          <ul className="repeats">
            {insights.repeats.map((r) => (
              <li key={r.outfitId} className={`is-${r.level}`}>
                <b>{r.name}</b>
                <span>{r.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggested.length > 0 && (
        <section className="side-card">
          <h3>
            <Icon name="spark" size={14} /> {t('Para {relativeDay}', { relativeDay: relativeDay(assignTo, today) })}
          </h3>
          <ul className="suggested">
            {suggested.map((x) => (
              <li key={x.outfit.id}>
                <OutfitGlyph outfit={x.outfit} height={46} />
                <span>
                  <b>{x.outfit.name}</b>
                  <small>{x.reasons.join(' · ') || t('Buena opción')}</small>
                </span>
                <button type="button" className="tip-try" onClick={() => onAssign(x, assignTo)}>
                  {t('Asignar')}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="side-card">
        <h3>
          <Icon name="pulse" size={14} /> {t('Estadísticas')}
        </h3>
        <h4>{t('Por día de la semana')}</h4>
        <div className="wd-bars" role="img" aria-label={t('Usos por día: {join}', { join: WEEKDAYS_SHORT.map((w, i) => `${w} ${s.byWeekday[i]}`).join(', ') })}>
          {s.byWeekday.map((n, i) => (
            <span key={i} className="wd-bar" style={{ '--h': `${(n / maxWd) * 100}%`, '--i': i } as CSSProperties} title={`${WEEKDAYS_SHORT[i]}: ${n}`}>
              <i />
              <b>{n || ''}</b>
              <small>{WEEKDAYS_SHORT[i].slice(0, 1)}</small>
            </span>
          ))}
        </div>

        {s.topWorn.length > 0 && (
          <>
            <h4>{t('Los que más usas')}</h4>
            <ul className="hbars">
              {s.topWorn.map((row) => (
                <li key={row.outfitId}>
                  <span className="hb-label">{row.name}</span>
                  <span className="hb-track">
                    <span style={{ width: `${(row.count / maxTop) * 100}%` }} />
                  </span>
                  <b>{row.count}</b>
                </li>
              ))}
            </ul>
          </>
        )}

        {s.byStyle.length > 0 && (
          <>
            <h4>{t('Estilos (90 días)')}</h4>
            <ul className="hbars">
              {s.byStyle.map((row) => (
                <li key={row.style ?? 'none'}>
                  <span className="hb-label">{row.style ? OUTFIT_STYLES[row.style].label : t('Sin estilo')}</span>
                  <span className="hb-track">
                    <span style={{ width: `${(row.count / maxStyle) * 100}%`, background: row.style ? OUTFIT_STYLES[row.style].color : '#8d8a85' } as CSSProperties} />
                  </span>
                  <b>{row.count}</b>
                </li>
              ))}
            </ul>
          </>
        )}
        {s.wornTotal === 0 && <p className="muted small">{t('Marca tus outfits como usados para ver aquí tus números.')}</p>}
      </section>
    </aside>
  );
}
