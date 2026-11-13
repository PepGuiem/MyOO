import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { calendarApi, itemsApi, outfitsApi, ratingsApi } from '../api/endpoints';
import type { OutfitStyle, RatingEntry, RatingResult, RatingTip, Season, Styling, StylingOption, WardrobeItem } from '../api/types';
import { BodySelector } from '../components/BodySelector';
import { ErrorNote } from '../components/ErrorNote';
import { ConfirmDialog } from '../components/fx/ConfirmDialog';
import { NeonScene } from '../components/fx/NeonScene';
import { SoundToggle } from '../components/fx/SoundToggle';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { OutfitRatingPanel } from '../components/rating/OutfitRatingPanel';
import { ScoreRing } from '../components/rating/RatingGauge';
import { Select } from '../components/Select';
import { useAppData } from '../components/Layout';
import { Busy } from '../components/Spinner';
import { stickerTilt } from '../components/street/Street';
import { useBodyShape } from '../lib/bodyPref';
import { SEASONS, SEASON_LABEL } from '../lib/labels';
import { OUTFIT_STYLES, OUTFIT_STYLE_KEYS } from '../lib/outfitStyles';
import { shortDay } from '../lib/dates';
import { tierOf } from '../lib/rating';
import { play } from '../lib/sfx';
import { brandOf } from '../lib/sneakers';
import { useAssetUrl } from '../lib/assetUrl';
import { SLOTS, SLOT_BY_ID, slotOf, type SlotId } from '../lib/wardrobeSlots';
import { stylingSupported } from '../three/libraryCatalog';
import { OutfitStage } from '../three/OutfitMannequin';

const MAX_ITEMS = 20;

/** Lo último que ha pasado en el vestidor (para el destello y el aviso del escenario). */
interface Pulse {
  n: number;
  kind: 'on' | 'off' | 'mix' | 'saved';
  text: string;
}

/**
 * Vestidor digital: a la izquierda el burro con tus prendas por huecos
 * (cabeza, arriba, capa, abajo, pies, extras), en el centro el maniquí
 * vestido en tiempo real y a la derecha la ficha del outfit (nombre,
 * estilo, favorito, cómo se lleva cada prenda) para guardarlo.
 */
export function OutfitEditorPage() {
  const { id } = useParams();
  const { shape } = useBodyShape();
  const navigate = useNavigate();
  const toast = useToast();
  const isNew = !id;
  // Si vienes del calendario (`?date=YYYY-MM-DD`), el outfit nuevo se pone en ese día.
  const [searchParams] = useSearchParams();
  const calendarDate = isNew && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('date') ?? '') ? searchParams.get('date') : null;
  // Desde la WISHLIST (`?with=<id>`): el outfit nuevo empieza con ese artículo puesto.
  const startWith = isNew ? searchParams.get('with') : null;

  const [allItems, setAllItems] = useState<WardrobeItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  /** Cómo se lleva cada prenda (por id de prenda). */
  const [styling, setStyling] = useState<Record<string, Styling>>({});
  const { garmentTypes } = useAppData();
  const [name, setName] = useState('');
  const [occasion, setOccasion] = useState('');
  const [season, setSeason] = useState<Season | ''>('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [style, setStyle] = useState<OutfitStyle | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [slot, setSlot] = useState<SlotId | 'all'>('all');
  /** Burro: todo, solo lo que tienes o solo la wishlist. */
  const [owned, setOwned] = useState<'all' | 'mine' | 'wish'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [panelTab, setPanelTab] = useState<'fit' | 'rating'>('fit');
  // OUTFIT RATING: nota en directo de lo puesto, y la guardada con su historial.
  const [rating, setRating] = useState<RatingResult | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingStale, setRatingStale] = useState(false);
  const [history, setHistory] = useState<RatingEntry[]>([]);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const ratingSeq = useRef(0);
  const [lastOn, setLastOn] = useState<string | null>(null);

  const touch = () => {
    setSaved(false);
    setDirty(true);
  };
  const flash = (kind: Pulse['kind'], text: string) => setPulse((p) => ({ n: (p?.n ?? 0) + 1, kind, text }));

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([itemsApi.listAll({ wishlist: 'include' }), id ? outfitsApi.get(id) : Promise.resolve(null)])
      .then(([items, outfit]) => {
        if (!alive) return;
        setAllItems(items);
        if (!outfit && startWith && items.some((i) => i.id === startWith)) setSelected([startWith]);
        if (outfit) {
          setName(outfit.name);
          setOccasion(outfit.occasion ?? '');
          setSeason(outfit.season ?? '');
          setDescription(outfit.description ?? '');
          setIsShared(!!outfit.isShared);
          setStyle(outfit.style ?? null);
          setIsFavorite(!!outfit.isFavorite);
          setSelected(outfit.items.map((i) => i.wardrobeItem.id));
          setStyling(Object.fromEntries(outfit.items.map((i) => [i.wardrobeItem.id, i.styling ?? {}])));
        }
        setDirty(false);
      })
      .catch((err: unknown) => alive && setError(err))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  /** Nota guardada (¿desactualizada?) e historial del outfit. */
  const refreshSaved = useCallback(async (outfitId: string) => {
    try {
      const [cur, hist] = await Promise.all([ratingsApi.current(outfitId), ratingsApi.history(outfitId)]);
      setRatingStale(cur.stale);
      setHistory(hist);
    } catch {
      /* sin nota guardada todavía (o backend antiguo): solo queda la de en directo */
    }
  }, []);

  useEffect(() => {
    setHistory([]);
    setRatingStale(false);
    if (id) void refreshSaved(id);
  }, [id, refreshSaved]);

  // Aviso del navegador si sales con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const byId = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);
  const selectedItems = selected.map((sid) => byId.get(sid)).filter((i): i is WardrobeItem => Boolean(i));
  // Para el maniquí: cada prenda con su estilo en este outfit.
  const stylingKey = JSON.stringify(styling);
  const dressed = useMemo(
    () => selectedItems.map((item) => ({ ...item, styling: styling[item.id] })),
    // stylingKey representa el contenido de styling
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected.join(','), byId, stylingKey],
  );
  // Nota en directo: se pide al backend (motor de reglas) un momento después de cada cambio.
  useEffect(() => {
    if (loading) return;
    const seq = ++ratingSeq.current;
    if (!selected.length) {
      setRating(null);
      setRatingLoading(false);
      return;
    }
    setRatingLoading(true);
    const t = window.setTimeout(() => {
      ratingsApi
        .preview({
          items: selected.map((wardrobeItemId) => {
            const st = styling[wardrobeItemId];
            return st && Object.keys(st).length ? { wardrobeItemId, styling: st } : { wardrobeItemId };
          }),
          style,
          occasion: occasion.trim() || null,
          season: season || null,
        })
        .then((r) => seq === ratingSeq.current && setRating(r))
        .catch(() => seq === ratingSeq.current && setRating(null))
        .finally(() => seq === ratingSeq.current && setRatingLoading(false));
    }, 450);
    return () => window.clearTimeout(t);
    // stylingKey representa el contenido de styling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, selected.join(','), stylingKey, style, occasion, season]);

  const optionsByType = useMemo(() => new Map(garmentTypes.map((t) => [t.id, t.stylingOptions ?? []])), [garmentTypes]);
  const hasBottom = selectedItems.some((i) => i.garmentType.category === 'BOTTOM' && i.garmentType.modelKey !== 'underwear');
  const hasBoots = selectedItems.some((i) => i.garmentType.modelKey === 'boots');

  // Prendas por hueco y lo que hay puesto en cada uno.
  const slotOfItem = useMemo(() => new Map(allItems.map((i) => [i.id, slotOf(i)])), [allItems]);
  const countBySlot = useMemo(() => {
    const c = Object.fromEntries(SLOTS.map((s) => [s.id, 0])) as Record<SlotId, number>;
    for (const i of allItems) c[slotOfItem.get(i.id) ?? 'acc']++;
    return c;
  }, [allItems, slotOfItem]);
  const wornBySlot = useMemo(() => {
    const w = Object.fromEntries(SLOTS.map((s) => [s.id, [] as WardrobeItem[]])) as Record<SlotId, WardrobeItem[]>;
    for (const i of selectedItems) w[slotOfItem.get(i.id) ?? 'acc'].push(i);
    return w;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join(','), slotOfItem, byId]);
  // Vestidos solo si tienes alguno.
  const slots = SLOTS.filter((s) => s.id !== 'full' || countBySlot.full > 0);

  function setStyleOption(itemId: string, key: keyof Styling, value: string) {
    touch();
    setStyling((prev) => {
      const next: Styling = { ...(prev[itemId] ?? {}) };
      if (value) (next as Record<string, string>)[key] = value;
      else delete next[key];
      return { ...prev, [itemId]: next };
    });
  }

  const q = search.trim().toLowerCase();
  const wishCount = allItems.filter((i) => i.wishlistStatus).length;
  const wishWorn = selectedItems.filter((i) => i.wishlistStatus).length;
  const visible = allItems.filter(
    (i) =>
      (slot === 'all' || slotOfItem.get(i.id) === slot) &&
      (owned === 'all' || (owned === 'wish') === !!i.wishlistStatus) &&
      (!q ||
        i.name.toLowerCase().includes(q) ||
        i.garmentType.name.toLowerCase().includes(q) ||
        (!!i.sneaker && `${brandOf(i.sneaker)} ${i.sneaker.model} ${i.sneaker.colorway ?? ''}`.toLowerCase().includes(q))),
  );
  // SNEAKER COLLECTION: tus zapatillas fichadas, para elegirlas directamente.
  const collection = allItems.filter((i) => i.sneaker && (owned === 'all' || (owned === 'wish') === !!i.wishlistStatus));

  /** Ponerse unas zapatillas de la colección: sustituyen al calzado que hubiera puesto. */
  function wearSneaker(itemId: string) {
    const item = byId.get(itemId);
    if (!item) return;
    if (selected.includes(itemId)) return toggle(itemId);
    const replaced = selected.filter((x) => slotOfItem.get(x) === 'shoes');
    const next = [...selected.filter((x) => !replaced.includes(x)), itemId];
    if (next.length > MAX_ITEMS) {
      toast.show(`Máximo ${MAX_ITEMS} prendas por outfit.`, { tone: 'info', sound: 'error' });
      return;
    }
    touch();
    setSelected(next);
    if (replaced.length) setStyling((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !replaced.includes(k))));
    play('pop');
    flash('on', replaced.length ? `Cambiadas: ${item.name}` : `Puestas: ${item.name}`);
    setLastOn(itemId);
  }

  function toggle(itemId: string) {
    const item = byId.get(itemId);
    const on = selected.includes(itemId);
    if (!on && selected.length >= MAX_ITEMS) {
      toast.show(`Máximo ${MAX_ITEMS} prendas por outfit.`, { tone: 'info', sound: 'error' });
      return;
    }
    touch();
    setSelected((prev) => (prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId]));
    if (item) {
      play(on ? 'swoosh' : 'pop');
      flash(on ? 'off' : 'on', on ? `Fuera: ${item.name}` : `Puesto: ${item.name}`);
      setLastOn(on ? null : itemId);
    }
  }

  /** Cambia toda la selección y deja «Deshacer» en el aviso. */
  function replaceSelection(next: string[], message: string) {
    const before = { selected, styling };
    touch();
    setSelected(next);
    setStyling((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => next.includes(k))));
    flash('mix', message);
    toast.show(message, {
      tone: 'info',
      icon: 'shuffle',
      action: {
        label: 'Deshacer',
        run: () => {
          setSelected(before.selected);
          setStyling(before.styling);
          play('swoosh');
        },
      },
    });
  }

  /** «Sorpréndeme»: un look al azar con lo que tienes (arriba + abajo + calzado, a veces capa y gorra). */
  function surprise() {
    const pick = (s: SlotId) => {
      // Solo con lo que ya tienes (la wishlist no entra en el azar).
      const pool = allItems.filter((i) => slotOfItem.get(i.id) === s && !i.wishlistStatus);
      return pool.length ? pool[Math.floor(Math.random() * pool.length)].id : null;
    };
    const useDress = countBySlot.full > 0 && Math.random() < 0.25;
    const ids = [
      Math.random() < 0.35 ? pick('head') : null,
      useDress ? pick('full') : pick('top'),
      Math.random() < 0.55 ? pick('outer') : null,
      useDress ? null : pick('bottom'),
      pick('shoes'),
      Math.random() < 0.3 ? pick('acc') : null,
    ].filter((x): x is string => Boolean(x));
    if (!ids.length) {
      toast.show('Añade prendas a tu armario para poder mezclar.', { tone: 'info' });
      return;
    }
    play('spray');
    replaceSelection(ids, 'Look al azar. ¿Te convence?');
  }

  function clearAll() {
    if (!selected.length) return;
    play('swoosh');
    replaceSelection([], 'Maniquí vacío.');
  }

  /** Prueba en el maniquí un consejo de OUTFIT RATING. */
  function applyTip(tip: RatingTip) {
    const a = tip.action;
    if (!a) return;
    touch();
    play('spray');
    if (a.type === 'style') {
      setStyle(a.style);
      flash('mix', `Estilo: ${OUTFIT_STYLES[a.style].label}`);
      return;
    }
    if (a.type === 'add') {
      if (selected.length >= MAX_ITEMS || selected.includes(a.itemId)) return;
      setSelected((prev) => [...prev, a.itemId]);
      setLastOn(a.itemId);
      flash('on', `Puesto: ${byId.get(a.itemId)?.name ?? 'prenda'}`);
    } else if (a.type === 'swap') {
      setSelected((prev) => prev.map((x) => (x === a.fromItemId ? a.toItemId : x)));
      setLastOn(a.toItemId);
      flash('mix', `Cambio: ${byId.get(a.toItemId)?.name ?? 'prenda'}`);
    } else if (a.type === 'remove') {
      setSelected((prev) => prev.filter((x) => x !== a.itemId));
      flash('off', `Fuera: ${byId.get(a.itemId)?.name ?? 'prenda'}`);
    }
    if (tip.gain) toast.show(`Consejo aplicado: +${tip.gain}. Guarda si te convence.`, { tone: 'info', icon: 'spark' });
  }

  const tipApplicable = (tip: RatingTip) => {
    const a = tip.action;
    if (!a) return false;
    if (a.type === 'style') return true;
    if (a.type === 'add') return byId.has(a.itemId) && !selected.includes(a.itemId);
    if (a.type === 'swap') return byId.has(a.toItemId) && selected.includes(a.fromItemId);
    return selected.includes(a.itemId);
  };

  async function recalc() {
    if (!id) return;
    setRecalcBusy(true);
    setRatingLoading(true);
    try {
      const r = await ratingsApi.recalc(id);
      setRating(r.result);
      setRatingStale(false);
      setHistory(await ratingsApi.history(id));
      toast.show(r.changed ? `Nota recalculada: ${r.rating.total}` : `Sin cambios: la nota sigue en ${r.rating.total}`, {
        sound: 'success',
        icon: 'refresh',
      });
    } catch (err) {
      setError(err);
    } finally {
      setRecalcBusy(false);
      setRatingLoading(false);
    }
  }

  /** Lleva la prenda de `from` a la posición `to` (arrastrar para reordenar). */
  function moveTo(from: number, to: number) {
    if (from === to) return;
    touch();
    setSelected((prev) => {
      const next = [...prev];
      const [it] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(next.length, to)), 0, it);
      return next;
    });
  }

  // Arrastre: índice que se arrastra y hueco sobre el que está.
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  function move(index: number, delta: number) {
    touch();
    setSelected((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      occasion: occasion.trim() || null,
      season: season || null,
      description: description.trim() || null,
      isShared,
      style,
      isFavorite,
      items: selected.map((wardrobeItemId, position) => {
        const st = styling[wardrobeItemId];
        // Solo se envía si hay algo elegido (un backend antiguo no lo admite).
        return st && Object.keys(st).length ? { wardrobeItemId, position, styling: st } : { wardrobeItemId, position };
      }),
    };
    try {
      if (!id) {
        const created = await outfitsApi.create(body);
        setDirty(false);
        toast.show(
          typeof created.ratingScore === 'number' ? `«${created.name}» creado · nota ${created.ratingScore}` : `«${created.name}» creado`,
          { icon: 'spark', sound: 'success' },
        );
        if (calendarDate) {
          try {
            await calendarApi.create({ date: calendarDate, outfitId: created.id });
            toast.show(`Y puesto en el calendario: ${shortDay(calendarDate)}`, { icon: 'check' });
            navigate(`/calendario?date=${calendarDate}`, { replace: true });
            return;
          } catch {
            toast.show('Outfit creado, pero no se pudo poner en el calendario', { tone: 'danger' });
          }
        }
        navigate(`/outfits/${created.id}`, { replace: true });
      } else {
        const updated = await outfitsApi.update(id, body);
        void refreshSaved(id);
        setSaved(true);
        setDirty(false);
        flash('saved', typeof updated.ratingScore === 'number' ? `Guardado · ${updated.ratingScore}/100` : 'Guardado');
        toast.show(typeof updated.ratingScore === 'number' ? `Outfit guardado · nota ${updated.ratingScore}` : 'Outfit guardado', {
          sound: 'success',
        });
      }
    } catch (err) {
      setError(err);
      play('error');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id) return;
    setDeleting(true);
    try {
      await outfitsApi.remove(id);
      setDirty(false);
      toast.show(`«${name || 'Outfit'}» eliminado`, { tone: 'danger', sound: 'swoosh' });
      navigate('/outfits');
    } catch (err) {
      setError(err);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  const filledSlots = slots.filter((s) => wornBySlot[s.id].length > 0).length;

  return (
    <section className="dressing">
      <NeonScene />

      <header className="dress-head">
        <Link to={calendarDate ? `/calendario?date=${calendarDate}` : '/outfits'} className="dress-back">
          <Icon name="back" size={14} /> {calendarDate ? 'Calendario' : 'Outfits'}
        </Link>
        <div className="dress-title">
          <span className="fits-kicker">
            <span className="rec-dot" aria-hidden="true" /> Vestidor
            {calendarDate && <span className="dress-for"> · para el calendario: {shortDay(calendarDate)}</span>}
          </span>
          <h1>{isNew ? 'Nuevo outfit' : name || 'Outfit'}</h1>
        </div>
        <div className="dress-tools">
          <button type="button" className="btn btn-street btn-ghost" onClick={surprise} disabled={loading || !allItems.length}>
            <Icon name="shuffle" size={14} /> Sorpréndeme
          </button>
          <button type="button" className="btn btn-ghost" onClick={clearAll} disabled={!selected.length}>
            <Icon name="undo" size={14} /> Vaciar
          </button>
          <SoundToggle />
        </div>
      </header>

      <div className="dress-grid">
        {/* Burro de prendas */}
        <aside className="dress-rail" aria-label="Tus prendas">
          <div className="slot-tabs" role="tablist" aria-label="Hueco">
            <button
              type="button"
              role="tab"
              aria-selected={slot === 'all'}
              className="slot-tab"
              onClick={() => {
                play('click');
                setSlot('all');
              }}
            >
              <Icon name="hanger" size={16} />
              <span className="slot-tab-label">Todo</span>
              <span className="count">{allItems.length}</span>
            </button>
            {slots.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={slot === s.id}
                className={`slot-tab${wornBySlot[s.id].length ? ' is-worn' : ''}`}
                title={s.label}
                onClick={() => {
                  play('click');
                  setSlot(s.id);
                }}
              >
                <Icon name={s.icon} size={16} />
                <span className="slot-tab-label">{s.short}</span>
                <span className="count">{countBySlot[s.id]}</span>
              </button>
            ))}
          </div>

          <div className="rack-head">
            <h2>{slot === 'all' ? (owned === 'wish' ? 'Tu wishlist' : 'Todo tu armario') : SLOT_BY_ID[slot].label}</h2>
            <label className="fits-search fits-search-sm">
              <Icon name="search" />
              <input type="search" placeholder="Buscar prenda" aria-label="Buscar prenda" value={search} onChange={(e) => setSearch(e.target.value)} />
            </label>
          </div>
          {wishCount > 0 && (
            <div className="own-switch" role="group" aria-label="Qué prendas ver">
              {(
                [
                  ['all', 'Todo'],
                  ['mine', 'Las tengo'],
                  ['wish', `Wishlist · ${wishCount}`],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={owned === k}
                  className={k === 'wish' ? 'is-wish' : ''}
                  onClick={() => {
                    play('click');
                    setOwned(k);
                  }}
                >
                  {k === 'wish' && <Icon name="heart" size={12} />} {label}
                </button>
              ))}
            </div>
          )}

          {collection.length > 0 && (slot === 'shoes' || slot === 'all') && (
            <div className="snk-strip">
              <span className="snk-strip-head">
                <Icon name="shoe" size={14} /> Tu colección de sneakers
                <Link to="/sneakers" className="snk-strip-more">
                  Ver
                </Link>
              </span>
              <ul className="snk-strip-row">
                {collection.map((item) => (
                  <li key={item.id}>
                    <SneakerPick item={item} on={selected.includes(item.id)} onPick={() => wearSneaker(item.id)} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul key={`${slot}-${owned}`} className="rack">
            {visible.map((item, i) => {
              const on = selected.includes(item.id);
              const s = SLOT_BY_ID[slotOfItem.get(item.id) ?? 'acc'];
              return (
                <li key={item.id} style={{ '--i': Math.min(i, 14) } as CSSProperties}>
                  <button
                    type="button"
                    className={`rack-item${on ? ' is-on' : ''}${lastOn === item.id ? ' just-on' : ''}${item.wishlistStatus ? ' is-wish' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggle(item.id)}
                    title={`${on ? `Quitar ${item.name}` : `Ponerle ${item.name}`}${item.wishlistStatus ? ' (de tu wishlist: aún no la tienes)' : ''}`}
                  >
                    <span className="rack-swatch" style={{ '--sw': item.color } as CSSProperties} aria-hidden="true">
                      <Icon name={s.icon} size={26} />
                    </span>
                    <span className="rack-name">{item.name}</span>
                    <span className="rack-type">
                      {item.sneaker ? <span className="snk-mini-tag">{brandOf(item.sneaker)}</span> : null}
                      {item.wishlistStatus ? (
                        <span className="wish-badge">
                          <Icon name="heart" size={10} /> Deseo
                        </span>
                      ) : null}
                      {item.garmentType.name}
                    </span>
                    <span className="rack-state" aria-hidden="true">
                      <Icon name={on ? 'check' : 'plus'} size={13} />
                    </span>
                    {on && <span className="rack-stamp">Puesto</span>}
                  </button>
                </li>
              );
            })}
            {!loading && visible.length === 0 && (
              <li className="rack-empty">
                {allItems.length === 0 ? (
                  <>
                    Tu armario está vacío. <Link to="/armario">Añade prendas</Link>
                  </>
                ) : (
                  'No hay prendas aquí.'
                )}
              </li>
            )}
          </ul>
        </aside>

        {/* Escenario */}
        <div className="dress-stage">
          <div className="stage-frame">
            <span className="stage-neon" aria-hidden="true" />
            <OutfitStage garments={dressed} shape={shape} />
            {pulse && <span key={pulse.n} className={`stage-flash is-${pulse.kind}`} aria-hidden="true" />}
            {pulse && (
              <span key={`t${pulse.n}`} className={`stage-toast is-${pulse.kind}`} role="status">
                {pulse.text}
              </span>
            )}
            <ol className="stage-hud" aria-label="Huecos del outfit">
              {slots.map((s) => {
                const worn = wornBySlot[s.id];
                return (
                  <li key={s.id} className={worn.length ? 'is-on' : ''} title={worn.length ? worn.map((w) => w.name).join(', ') : `${s.label}: vacío`}>
                    <button
                      type="button"
                      aria-label={`${s.label}${worn.length ? `: ${worn.length}` : ': vacío'}`}
                      onClick={() => {
                        play('click');
                        setSlot(s.id);
                      }}
                    >
                      <Icon name={s.icon} size={15} />
                      {worn.length > 1 && <span className="hud-n">{worn.length}</span>}
                    </button>
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              className={`stage-score${ratingLoading ? ' is-loading' : ''}`}
              onClick={() => {
                play('click');
                setPanelTab('rating');
              }}
              title="Ver OUTFIT RATING"
            >
              <ScoreRing value={rating && selected.length ? rating.total : null} size={58} />
              <span className="stage-score-label">
                {rating && selected.length ? tierOf(rating.total).label : 'Rating'}
              </span>
            </button>
            <span className="stage-meter" aria-hidden="true">
              <b>{selectedItems.length}</b>/{MAX_ITEMS} · {filledSlots} huecos
              {wishWorn > 0 && (
                <span className="meter-wish">
                  {' '}
                  · <Icon name="heart" size={10} /> {wishWorn} por comprar
                </span>
              )}
            </span>
            {loading ? (
              <div className="stage-loading">
                <SprayLoader label="Abriendo el vestidor…" />
              </div>
            ) : (
              selectedItems.length === 0 && <p className="stage-empty">Elige prendas del burro para vestir el maniquí.</p>
            )}
          </div>
          <BodySelector className="dress-body" />
        </div>

        {/* Ficha del outfit */}
        <form className="dress-panel" onSubmit={submit}>
          <div className={`panel-tabs is-${panelTab}`} role="tablist" aria-label="Ficha o nota">
            <span className="tab-thumb" aria-hidden="true" />
            <button
              type="button"
              role="tab"
              aria-selected={panelTab === 'fit'}
              onClick={() => {
                play('click');
                setPanelTab('fit');
              }}
            >
              <Icon name="edit" size={14} /> Ficha
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={panelTab === 'rating'}
              onClick={() => {
                play('click');
                setPanelTab('rating');
              }}
            >
              <Icon name="spark" size={14} /> Rating
              <span className="count">{rating && selected.length ? rating.total : '–'}</span>
            </button>
          </div>

          {panelTab === 'rating' && (
            <OutfitRatingPanel
              result={selected.length ? rating : null}
              loading={ratingLoading}
              live={isNew || dirty}
              stale={!dirty && ratingStale}
              history={history}
              onRecalc={isNew ? undefined : recalc}
              recalcBusy={recalcBusy}
              onApplyTip={applyTip}
              canApply={tipApplicable}
              declaredStyle={style}
            />
          )}

          <div className="panel-pane" hidden={panelTab !== 'fit'}>
          <div className="panel-top">
            <label className="field field-name">
              <span>Nombre</span>
              <input
                required
                maxLength={80}
                placeholder="Ponle nombre a tu fit"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  touch();
                }}
              />
            </label>
            <button
              type="button"
              className={`fav-btn fav-btn-lg${isFavorite ? ' is-on' : ''}`}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
              title="Favorito"
              onClick={() => {
                play('pop');
                setIsFavorite((v) => !v);
                touch();
              }}
            >
              <Icon name="star" size={20} />
              {isFavorite && <span className="fav-burst" aria-hidden="true" />}
            </button>
          </div>

          <div className="field">
            <span id="outfit-style">Estilo</span>
            <div className="style-pick" role="radiogroup" aria-labelledby="outfit-style">
              {OUTFIT_STYLE_KEYS.map((k) => {
                const meta = OUTFIT_STYLES[k];
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={style === k}
                    className={`style-chip${style === k ? ' is-active' : ''}`}
                    style={{ '--c': meta.color, '--ink': meta.ink, '--tilt': `${stickerTilt(k)}deg` } as CSSProperties}
                    title={meta.hint}
                    onClick={() => {
                      play('click');
                      setStyle(style === k ? null : k);
                      touch();
                    }}
                  >
                    <span className="style-dot" aria-hidden="true" />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="row">
            <label className="field">
              <span>Ocasión</span>
              <input
                maxLength={60}
                placeholder="Concierto, curro…"
                value={occasion}
                onChange={(e) => {
                  setOccasion(e.target.value);
                  touch();
                }}
              />
            </label>
            <div className="field">
              <span id="outfit-season">Temporada</span>
              <Select
                labelledBy="outfit-season"
                value={season}
                options={[{ value: '', label: 'Sin especificar' }, ...SEASONS.map((s) => ({ value: s, label: SEASON_LABEL[s] }))]}
                onChange={(v) => {
                  setSeason(v as Season | '');
                  touch();
                }}
              />
            </div>
          </div>
          <label className="field">
            <span>Descripción</span>
            <textarea
              rows={2}
              maxLength={500}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                touch();
              }}
            />
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              role="switch"
              checked={isShared}
              onChange={(e) => {
                setIsShared(e.target.checked);
                touch();
              }}
            />
            <span className="switch" aria-hidden="true" />
            <span>
              <strong>Compartir en mi perfil</strong>
              <small className="muted">Lo verá quien pueda ver tu perfil. Tus prendas no compartidas siguen siendo privadas.</small>
            </span>
          </label>

          <h2 className="panel-title">
            Puesto <span className="count">{selectedItems.length}</span>
          </h2>
          {selectedItems.length === 0 ? (
            <p className="muted small">Nada todavía. Toca una prenda del burro para ponérsela.</p>
          ) : (
            <ol className="picked">
              {selectedItems.map((item, index) => (
                <li
                  key={item.id}
                  className={`${dragFrom === index ? 'is-dragging' : ''}${dragOver === index && dragFrom !== null && dragFrom !== index ? (dragFrom < index ? ' drop-after' : ' drop-before') : ''}${lastOn === item.id ? ' just-on' : ''}`}
                  onDragOver={(e) => {
                    if (dragFrom === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOver !== index) setDragOver(index);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom !== null) moveTo(dragFrom, index);
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                >
                  <div className="picked-row">
                    <span
                      className="drag-handle"
                      draggable
                      title="Arrastra para cambiar el orden"
                      aria-hidden="true"
                      onDragStart={(e) => {
                        setDragFrom(index);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', item.id);
                        const row = (e.currentTarget as HTMLElement).closest('li');
                        if (row) e.dataTransfer.setDragImage(row, 16, 16);
                      }}
                      onDragEnd={() => {
                        setDragFrom(null);
                        setDragOver(null);
                      }}
                    >
                      <Icon name="grip" />
                    </span>
                    <span className="swatch" style={{ background: item.color }} aria-hidden="true" />
                    <span className="picked-name">{item.name}</span>
                    {item.wishlistStatus && (
                      <span className="wish-badge" title="De tu wishlist: todavía no la tienes">
                        <Icon name="heart" size={10} /> Deseo
                      </span>
                    )}
                    <span className="picked-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => move(index, -1)}
                        disabled={index === 0}
                        aria-label={`Subir ${item.name}`}
                        title="Subir (se pone encima)"
                      >
                        <Icon name="up" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => move(index, 1)}
                        disabled={index === selectedItems.length - 1}
                        aria-label={`Bajar ${item.name}`}
                        title="Bajar"
                      >
                        <Icon name="down" />
                      </button>
                      <button type="button" className="icon-btn" onClick={() => toggle(item.id)} aria-label={`Quitar ${item.name}`} title="Quitar del outfit">
                        <Icon name="close" />
                      </button>
                    </span>
                  </div>
                  <StyleControls
                    item={item}
                    options={(optionsByType.get(item.garmentType.id) ?? []).filter((o) =>
                      stylingSupported(item.garmentType.modelKey, item.attributes ?? {}, o.key, item.customization?.parts),
                    )}
                    value={styling[item.id] ?? {}}
                    onChange={(key, v) => setStyleOption(item.id, key, v)}
                    hasBottom={hasBottom}
                    hasBoots={hasBoots}
                  />
                </li>
              ))}
            </ol>
          )}

          </div>

          <ErrorNote error={error} />
          {saved && (
            <p className="note note-saved" role="status">
              <Icon name="check" size={14} /> Outfit guardado.
            </p>
          )}

          <div className="actions dress-actions">
            {!isNew && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  play('click');
                  setConfirmDelete(true);
                }}
              >
                <Icon name="trash" size={14} /> Eliminar
              </button>
            )}
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => navigate('/outfits')}>
              Volver
            </button>
            <button
              type="submit"
              className={`btn btn-primary btn-street btn-save${dirty ? ' is-dirty' : ''}${saved ? ' is-saved' : ''}`}
              disabled={saving || selected.length === 0}
            >
              {saving ? <Busy text="Guardando…" /> : isNew ? 'Crear outfit' : saved && !dirty ? 'Guardado' : 'Guardar outfit'}
            </button>
          </div>
          {dirty && !saving && <p className="dirty-note">Cambios sin guardar</p>}
        </form>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={`¿Eliminar «${name || 'este outfit'}»?`}
          confirmLabel="Eliminar outfit"
          danger
          busy={deleting}
          onConfirm={remove}
          onClose={() => setConfirmDelete(false)}
        >
          <p>Se borra el outfit, no las prendas: siguen en tus armarios.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/** Cómo se lleva una prenda en el outfit: un desplegable por opción. */
function StyleControls({
  item,
  options,
  value,
  onChange,
  hasBottom,
  hasBoots,
}: {
  item: WardrobeItem;
  options: StylingOption[];
  value: Styling;
  onChange: (key: keyof Styling, value: string) => void;
  hasBottom: boolean;
  hasBoots: boolean;
}) {
  const baseId = useId();
  if (!options.length) return null;
  const hint =
    value.tuck && value.tuck !== 'out' && !hasBottom
      ? 'Para meterla por dentro, añade un pantalón o una falda.'
      : value.boots === 'in' && !hasBoots
        ? 'Para meterlo en las botas, añade unas botas.'
        : null;
  return (
    <div className="style-controls" role="group" aria-label={`Cómo se lleva ${item.name}`}>
      {options.map((o) => (
        <div key={o.key} className="style-field">
          <span id={`${baseId}-${o.key}`}>{o.label}</span>
          <Select
            size="sm"
            labelledBy={`${baseId}-${o.key}`}
            value={value[o.key] ?? ''}
            options={[{ value: '', label: 'Como está' }, ...o.values]}
            onChange={(v) => onChange(o.key, v)}
          />
        </div>
      ))}
      {hint && <p className="muted small style-hint">{hint}</p>}
    </div>
  );
}

/** Zapatillas de la colección en el vestidor: tu foto (o su color), marca y modelo. */
function SneakerPick({ item, on, onPick }: { item: WardrobeItem; on: boolean; onPick: () => void }) {
  const asset = useAssetUrl(item.photoAssetId);
  const photo = item.photoAssetId ? asset : item.imageUrl;
  const card = item.sneaker!;
  return (
    <button
      type="button"
      className={`snk-pick${on ? ' is-on' : ''}${item.wishlistStatus ? ' is-wish' : ''}`}
      style={{ '--sw': item.color } as CSSProperties}
      aria-pressed={on}
      title={`${brandOf(card)} ${card.model}${card.colorway ? ` · ${card.colorway}` : ''}${item.size ? ` · talla ${item.size}` : ''}${item.wishlistStatus ? ' (wishlist: aún no las tienes)' : ''}`}
      onClick={onPick}
    >
      <span className="snk-pick-img">
        {photo ? <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Icon name="shoe" size={26} />}
        {on && (
          <span className="snk-pick-on">
            <Icon name="check" size={12} />
          </span>
        )}
      </span>
      <span className="snk-mini-tag">{brandOf(card)}</span>
      <span className="snk-pick-model">{card.model}</span>
      {item.wishlistStatus && (
        <span className="wish-badge">
          <Icon name="heart" size={9} /> Deseo
        </span>
      )}
    </button>
  );
}
