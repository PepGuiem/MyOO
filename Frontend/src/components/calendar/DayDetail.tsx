import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { calendarApi, outfitsApi } from '../../api/endpoints';
import type { CalendarEntry, CalendarEventKind, CalendarSuggestion, Outfit } from '../../api/types';
import { useBodyShape } from '../../lib/bodyPref';
import { EVENT_KINDS, EVENT_KIND_KEYS, MAX_PER_DAY } from '../../lib/calendar';
import { diffDays, longDay, relativeDay, shortDay, todayKey, type DayKey } from '../../lib/dates';
import { formatDate } from '../../lib/labels';
import { OUTFIT_STYLES } from '../../lib/outfitStyles';
import { play } from '../../lib/sfx';
import { SLOT_BY_ID, slotOf } from '../../lib/wardrobeSlots';
import { OutfitStage } from '../../three/OutfitMannequin';
import { ErrorNote } from '../ErrorNote';
import { useToast } from '../fx/Toast';
import { Icon } from '../Icon';
import { ScoreRing } from '../rating/RatingGauge';
import { stickerTilt } from '../street/Street';
import { OutfitGlyph } from './OutfitGlyph';
import { t } from '../../i18n';

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : t('Algo ha fallado.');
}

export function StyleTag({ outfit }: { outfit: Outfit }) {
  if (!outfit.style) return null;
  const m = OUTFIT_STYLES[outfit.style];
  return (
    <span className="cal-style" style={{ '--c': m.color, '--ink': m.ink, '--tilt': `${stickerTilt(outfit.style)}deg` } as CSSProperties}>
      {m.label}
    </span>
  );
}

/**
 * Todo lo de un día: el outfit en 3D, nota, evento, «usado», avisos de
 * repetición y acciones; y para añadir otro, el selector con recomendaciones.
 */
export function DayDetail({
  date,
  entries,
  onChanged,
  inline = false,
}: {
  date: DayKey;
  entries: CalendarEntry[];
  /** Se ha creado, cambiado o quitado algo: el calendario recarga. */
  onChanged: (info: { assigned?: DayKey }) => void;
  inline?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.id ?? null);
  const [picking, setPicking] = useState<null | 'add' | 'swap'>(entries.length ? null : 'add');
  const selected = entries.find((e) => e.id === selectedId) ?? entries[0] ?? null;
  const today = todayKey();
  const future = diffDays(today, date) > 0;

  // Recién asignado: todavía no ha llegado en `entries` (el calendario recarga).
  const pending = useRef(new Set<string>());
  useEffect(() => {
    if (selectedId && entries.some((e) => e.id === selectedId)) pending.current.delete(selectedId);
    else if (!selectedId || !pending.current.has(selectedId)) setSelectedId(entries[0]?.id ?? null);
    if (!entries.length) setPicking('add');
  }, [entries, selectedId]);

  return (
    <div className={`day-detail${inline ? ' is-inline' : ''}`}>
      <header className="day-head">
        <span className="day-num">{Number(date.slice(8))}</span>
        <span className="day-when">
          <b>{longDay(date)}</b>
          <span className={`day-rel${date === today ? ' is-today' : ''}`}>{relativeDay(date, today)}</span>
        </span>
      </header>

      {entries.length > 1 && (
        <div className="day-tabs" role="tablist" aria-label={t('Outfits del día')}>
          {entries.map((e) => (
            <button
              key={e.id}
              type="button"
              role="tab"
              aria-selected={selected?.id === e.id}
              onClick={() => {
                play('click');
                setSelectedId(e.id);
                setPicking(null);
              }}
            >
              <OutfitGlyph outfit={e.outfit} height={30} />
              <span>{e.eventName ?? e.outfit.name}</span>
            </button>
          ))}
        </div>
      )}

      {selected && picking !== 'add' && (
        <EntryCard key={selected.id} entry={selected} future={future} onChanged={onChanged} onSwap={() => setPicking(picking === 'swap' ? null : 'swap')} swapping={picking === 'swap'} />
      )}

      {picking ? (
        <OutfitPicker
          date={date}
          mode={picking}
          excludeId={picking === 'swap' ? selected?.outfit.id : undefined}
          onPick={async (outfit) => {
            if (picking === 'swap' && selected) {
              await calendarApi.update(selected.id, { outfitId: outfit.id });
            } else {
              const created = await calendarApi.create({ date, outfitId: outfit.id });
              pending.current.add(created.id);
              setSelectedId(created.id);
            }
            setPicking(null);
            onChanged({ assigned: date });
          }}
          onCancel={entries.length ? () => setPicking(null) : undefined}
        />
      ) : (
        entries.length < MAX_PER_DAY && (
          <button
            type="button"
            className="day-add"
            onClick={() => {
              play('click');
              setPicking('add');
            }}
          >
            <Icon name="plus" size={14} /> {entries.length ? t('Otro outfit para este día (p. ej. un evento)') : t('Asignar un outfit')}
          </button>
        )
      )}
    </div>
  );
}

/** El outfit de un día con todo lo que se puede hacer con él. */
function EntryCard({
  entry,
  future,
  onChanged,
  onSwap,
  swapping,
}: {
  entry: CalendarEntry;
  future: boolean;
  onChanged: (info: { assigned?: DayKey }) => void;
  onSwap: () => void;
  swapping: boolean;
}) {
  const { shape } = useBodyShape();
  const toast = useToast();
  const navigate = useNavigate();
  const [note, setNote] = useState(entry.note ?? '');
  const [eventOn, setEventOn] = useState(!!entry.eventName);
  const [eventName, setEventName] = useState(entry.eventName ?? '');
  const [eventKind, setEventKind] = useState<CalendarEventKind | null>(entry.eventKind);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [noteSaved, setNoteSaved] = useState(false);
  const garments = useMemo(() => entry.outfit.items.map((i) => ({ ...i.wardrobeItem, styling: i.styling })), [entry.outfit.items]);

  const save = async (body: Parameters<typeof calendarApi.update>[1], ok?: string) => {
    setBusy(true);
    setError(null);
    try {
      await calendarApi.update(entry.id, body);
      if (ok) toast.show(ok, { sound: 'success' });
      onChanged({});
      return true;
    } catch (err) {
      setError(err);
      play('error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if ((entry.note ?? '') === note.trim()) return;
    if (await save({ note: note.trim() || null })) {
      setNoteSaved(true);
      window.setTimeout(() => setNoteSaved(false), 1600);
    }
  };

  return (
    <article className={`entry-card${entry.worn ? ' is-worn' : ''}`}>
      {entry.eventName && (
        <div className="entry-event" style={{ '--c': EVENT_KINDS[entry.eventKind ?? 'OTHER'].color } as CSSProperties}>
          <Icon name="flag" size={13} /> {entry.eventKind ? `${EVENT_KINDS[entry.eventKind].label} · ` : ''}
          {entry.eventName}
        </div>
      )}
      <div className="entry-stage">
        <span className="entry-beam" aria-hidden="true" />
        <OutfitStage garments={garments} shape={shape} distance={4.4} />
        {entry.worn && <span className="worn-stamp">{t('Usado')}</span>}
      </div>

      <div className="entry-main">
        <div className="entry-title">
          <h3>
            <Link to={`/outfits/${entry.outfit.id}`}>{entry.outfit.name}</Link>
          </h3>
          <ScoreRing value={entry.outfit.ratingScore} size={38} />
        </div>
        <div className="entry-tags">
          <StyleTag outfit={entry.outfit} />
          {entry.outfit.occasion && <span className="status-tag">{entry.outfit.occasion}</span>}
        </div>
        {entry.repeat && (
          <p className={`entry-repeat is-${entry.repeat.level}`}>
            <Icon name="refresh" size={13} /> {t('{text}. ¿Y si pruebas otro?', { text: entry.repeat.text })}
          </p>
        )}
        <ul className="entry-pieces">
          {entry.outfit.items.map(({ wardrobeItem: g }) => (
            <li key={g.id}>
              <span className="piece-swatch" style={{ background: g.color }} aria-hidden="true">
                <Icon name={SLOT_BY_ID[slotOf(g)].icon} size={11} />
              </span>
              {g.name}
            </li>
          ))}
        </ul>

        <button
          type="button"
          className={`worn-toggle${entry.worn ? ' is-on' : ''}`}
          aria-pressed={entry.worn}
          disabled={busy || (future && !entry.worn)}
          title={future && !entry.worn ? t('Podrás marcarlo cuando llegue el día') : undefined}
          onClick={() => {
            play(entry.worn ? 'click' : 'pop');
            void save({ worn: !entry.worn }, entry.worn ? undefined : t('«{name}» marcado como usado', { name: entry.outfit.name }));
          }}
        >
          <span className="worn-box" aria-hidden="true">
            <Icon name="check" size={14} />
          </span>
          {entry.worn ? `${t('Usado')}${entry.wornAt ? ` · ${formatDate(entry.wornAt)}` : ''}` : future ? t('Aún no ha llegado el día') : t('Marcar como usado')}
        </button>

        <label className="field entry-note">
          <span>
            {t('Nota##apunte')} {noteSaved && <em className="note-ok">{t('guardada')}</em>}
          </span>
          <textarea
            rows={2}
            maxLength={500}
            placeholder={t('Llevar paraguas, devolver la chaqueta a Leo…')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
          />
        </label>

        <div className="entry-eventbox">
          <label className="switch-row">
            <input
              type="checkbox"
              role="switch"
              checked={eventOn}
              onChange={(e) => {
                setEventOn(e.target.checked);
                if (!e.target.checked && entry.eventName) void save({ eventName: null, eventKind: null });
              }}
            />
            <span className="switch" aria-hidden="true" />
            <span>
              <strong>{t('Evento especial')}</strong>
            </span>
          </label>
          {eventOn && (
            <div className="event-form">
              <input
                maxLength={80}
                placeholder={t('Boda de Ana, concierto…')}
                aria-label={t('Nombre del evento')}
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
              />
              <div className="event-kinds" role="radiogroup" aria-label={t('Tipo de evento')}>
                {EVENT_KIND_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={eventKind === k}
                    className={eventKind === k ? 'is-on' : ''}
                    style={{ '--c': EVENT_KINDS[k].color } as CSSProperties}
                    onClick={() => setEventKind(eventKind === k ? null : k)}
                  >
                    {EVENT_KINDS[k].label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn wd-btn-line btn-small"
                disabled={busy || !eventName.trim()}
                onClick={() => void save({ eventName: eventName.trim(), eventKind }, t('Evento guardado'))}
              >
                {t('Guardar evento')}
              </button>
            </div>
          )}
        </div>

        <ErrorNote error={error} />

        <div className="entry-actions">
          <button type="button" className={`entry-act${swapping ? ' is-on' : ''}`} onClick={onSwap}>
            <Icon name="shuffle" size={14} /> {t('Cambiar outfit')}
          </button>
          <button type="button" className="entry-act" onClick={() => navigate(`/outfits/${entry.outfit.id}`)}>
            <Icon name="edit" size={14} /> {t('Editar outfit')}
          </button>
          <button
            type="button"
            className={`entry-act is-danger${confirmRemove ? ' is-confirm' : ''}`}
            disabled={busy}
            onClick={async () => {
              if (!confirmRemove) {
                setConfirmRemove(true);
                window.setTimeout(() => setConfirmRemove(false), 3000);
                return;
              }
              setBusy(true);
              try {
                await calendarApi.remove(entry.id);
                play('swoosh');
                toast.show(t('Quitado del {shortDay}', { shortDay: shortDay(entry.date) }), { tone: 'danger' });
                onChanged({});
              } catch (err) {
                setError(err);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="trash" size={14} /> {confirmRemove ? t('¿Seguro? Quitar') : t('Quitar del día')}
          </button>
        </div>
      </div>
    </article>
  );
}

/** Elegir un outfit guardado (con los recomendados para ese día arriba) o crear uno nuevo. */
function OutfitPicker({
  date,
  mode,
  excludeId,
  onPick,
  onCancel,
}: {
  date: DayKey;
  mode: 'add' | 'swap';
  excludeId?: string;
  onPick: (o: Outfit) => Promise<void>;
  onCancel?: () => void;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const [suggested, setSuggested] = useState<CalendarSuggestion[] | null>(null);
  const [all, setAll] = useState<Outfit[] | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    calendarApi
      .suggestions(date, 4)
      .then((s) => alive && setSuggested(s))
      .catch(() => alive && setSuggested([]));
    return () => {
      alive = false;
    };
  }, [date]);

  useEffect(() => {
    let alive = true;
    const timer = window.setTimeout(() => {
      outfitsApi
        .list(1, 60, { search: query.trim() || undefined })
        .then((r) => alive && setAll(r.data))
        .catch(() => alive && setAll([]));
    }, 250);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const pick = async (o: Outfit) => {
    setBusyId(o.id);
    try {
      play('spray');
      await onPick(o);
      toast.show(t('«{name}» para el {shortDay}', { name: o.name, shortDay: shortDay(date) }), { icon: 'check' });
    } catch (err) {
      toast.show(errorText(err), { tone: 'danger', sound: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const card = (o: Outfit, i: number, reasons?: string[]) => (
    <li key={o.id} style={{ '--i': i } as CSSProperties}>
      <button type="button" className="cpk-card" onClick={() => pick(o)} disabled={!!busyId}>
        <OutfitGlyph outfit={o} height={70} />
        <span className="cpk-info">
          <b>{o.name}</b>
          <StyleTag outfit={o} />
          {reasons && reasons.length > 0 && <span className="cpk-reasons">{reasons.join(' · ')}</span>}
        </span>
        <ScoreRing value={o.ratingScore} size={34} />
        {busyId === o.id && <span className="cpk-busy" aria-hidden="true" />}
      </button>
    </li>
  );

  const visibleSuggested = (suggested ?? []).filter((s) => s.outfit.id !== excludeId);
  return (
    <section className="cpk" aria-label={t('Elegir outfit')}>
      <div className="cpk-head">
        <h4>{mode === 'swap' ? t('Cambiar por…') : t('Outfit para el {shortDay}', { shortDay: shortDay(date) })}</h4>
        {onCancel && (
          <button type="button" className="icon-btn" onClick={onCancel} aria-label={t('Cancelar')}>
            <Icon name="close" />
          </button>
        )}
      </div>

      {visibleSuggested.length > 0 && !query && (
        <>
          <p className="cpk-label">
            <Icon name="spark" size={12} /> {t('Recomendados para ese día')}
          </p>
          <ul className="cpk-list is-suggested">{visibleSuggested.map((s, i) => card(s.outfit, i, s.reasons))}</ul>
        </>
      )}

      <label className="fits-search fits-search-sm">
        <Icon name="search" />
        <input type="search" placeholder={t('Buscar en tus outfits')} aria-label={t('Buscar en tus outfits')} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {all === null ? (
        <p className="muted small">{t('Cargando outfits…')}</p>
      ) : all.length === 0 ? (
        <p className="muted small">{query ? t('Ningún outfit con ese nombre.') : t('Todavía no tienes outfits guardados.')}</p>
      ) : (
        <ul className="cpk-list">{all.filter((o) => o.id !== excludeId).map((o, i) => card(o, Math.min(i, 10)))}</ul>
      )}

      <button
        type="button"
        className="btn wd-add cpk-new"
        onClick={() => {
          play('spray');
          navigate(`/outfits/new?date=${date}`);
        }}
      >
        <Icon name="plus" size={14} /> {t('Crear un outfit nuevo para este día')}
      </button>
    </section>
  );
}
