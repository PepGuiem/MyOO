import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { outfitsApi, stylistApi } from '../api/endpoints';
import type {
  Styling,
  StylistContext,
  StylistItem,
  StylistOutfit,
  StylistSlot,
  StylistTip,
} from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { useAppData } from '../components/Layout';
import { Select } from '../components/Select';
import { useBodyShape } from '../lib/bodyPref';
import { hasWebGL } from '../lib/device';
import { OCCASIONS, STYLE_TAGS, WEATHER, labelOf } from '../lib/stylist';
import { useAsync } from '../lib/useAsync';
import { OutfitStage } from '../three/OutfitMannequin';
import { Busy } from '../components/Spinner';

/** Orden en el maniquí: lo de debajo primero (la capa intermedia va sobre la camiseta). */
const SLOT_ORDER: StylistSlot[] = ['full', 'top', 'mid', 'bottom', 'outer', 'shoes', 'head', 'neck'];
const SLOT_LABEL: Record<StylistSlot, string> = {
  full: 'Vestido',
  top: 'Arriba',
  mid: 'Capa',
  bottom: 'Abajo',
  outer: 'Abrigo',
  shoes: 'Calzado',
  head: 'Cabeza',
  neck: 'Cuello',
};

/** Prenda del outfit que se está mirando (con cómo se lleva). */
interface Look {
  key: string;
  picks: { itemId: string; slot: StylistSlot; styling?: Styling }[];
  reasons: string[];
  palette: StylistOutfit['palette'];
  tips: StylistTip[];
}

const toLook = (o: StylistOutfit): Look => ({
  key: o.key,
  picks: [...o.items].sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)),
  reasons: o.reasons,
  palette: o.palette,
  tips: o.tips,
});

/**
 * Estilista: propone outfits con tus prendas y deja notas tipo grafiti
 * alrededor del maniquí (consejos que se aceptan, se descartan o se cambian).
 * Motor propio del backend: reglas de color, estilo, ocasión y tiempo, y lo
 * que vas aceptando o rechazando.
 */
export function StylistPage() {
  const { wardrobes } = useAppData();
  const { shape } = useBodyShape();
  const [style, setStyle] = useState('');
  const [occasion, setOccasion] = useState('');
  const [weather, setWeather] = useState('');
  const [wardrobeId, setWardrobeId] = useState('');
  const [discover, setDiscover] = useState(false);

  const [looks, setLooks] = useState<Look[]>([]);
  const [index, setIndex] = useState(0);
  const [items, setItems] = useState<Record<string, StylistItem>>({});
  const [locked, setLocked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<{ key: string; id: string } | null>(null);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});

  const insights = useAsync(() => stylistApi.insights(wardrobeId || undefined), [wardrobeId]);

  const ctx: StylistContext = useMemo(
    () => ({
      style: style || undefined,
      occasion: occasion || undefined,
      weather: weather || undefined,
      wardrobeId: wardrobeId || undefined,
    }),
    [style, occasion, weather, wardrobeId],
  );

  async function generate(keepLocked = false) {
    setBusy(true);
    setError(null);
    setSwapFor(null);
    try {
      const res = await stylistApi.generate({
        ...ctx,
        count: 4,
        seed: Math.floor(Math.random() * 2_000_000_000),
        lockedItemIds: keepLocked && locked.length ? locked : undefined,
        discover,
      });
      setItems((prev) => ({ ...prev, ...res.items }));
      setLooks(res.outfits.map(toLook));
      setIndex(0);
      if (!keepLocked) setLocked([]);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  // Primera tanda al entrar
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const look = looks[index];
  const ids = look?.picks.map((p) => p.itemId) ?? [];
  const garments = useMemo(
    () =>
      look?.picks
        .map((p) => items[p.itemId] && { ...items[p.itemId], styling: p.styling })
        .filter((g): g is StylistItem & { styling: Styling | undefined } => !!g) ?? [],
    [look, items],
  );

  const send = (signal: Parameters<typeof stylistApi.feedback>[0]['signal'], extra: { itemIds?: string[]; tipCode?: string } = {}) =>
    stylistApi
      .feedback({ signal, itemIds: extra.itemIds ?? ids, tipCode: extra.tipCode, style: style || undefined, occasion: occasion || undefined })
      .catch(() => undefined);

  function updateLook(fn: (l: Look) => Look) {
    setLooks((prev) => prev.map((l, i) => (i === index ? fn(l) : l)));
  }

  function applyTip(tip: StylistTip) {
    const a = tip.action;
    updateLook((l) => {
      let picks = l.picks;
      if (a?.type === 'add') {
        const it = items[a.itemId];
        const slot: StylistSlot = it?.garmentType.modelKey === 'scarf' ? 'neck' : it?.garmentType.category === 'FOOTWEAR' ? 'shoes' : 'head';
        picks = [...picks, { itemId: a.itemId, slot }];
      } else if (a?.type === 'swap') {
        picks = picks.map((p) => (p.itemId === a.fromItemId ? { ...p, itemId: a.toItemId } : p));
      } else if (a?.type === 'styling') {
        picks = picks.map((p) => (p.itemId === a.itemId ? { ...p, styling: { ...p.styling, ...a.styling } } : p));
      }
      return { ...l, picks, key: picks.map((p) => p.itemId).sort().join(','), tips: l.tips.filter((t) => t.id !== tip.id) };
    });
    if (tip.kind !== 'praise') void send('ACCEPT_TIP', { itemIds: tipItems(tip), tipCode: tip.code });
  }

  function rejectTip(tip: StylistTip) {
    updateLook((l) => ({ ...l, tips: l.tips.filter((t) => t.id !== tip.id) }));
    if (tip.kind !== 'praise') void send('REJECT_TIP', { itemIds: tipItems(tip), tipCode: tip.code });
  }

  /** «Otra»: en vez de esa prenda, la siguiente mejor del mismo hueco. */
  async function anotherTip(tip: StylistTip) {
    const a = tip.action;
    const target = a?.type === 'swap' ? a.fromItemId : a?.type === 'add' ? null : null;
    const suggested = a?.type === 'swap' ? a.toItemId : a?.type === 'add' ? a.itemId : null;
    if (!suggested) return rejectTip(tip);
    try {
      // Para «añadir», se pregunta como si ya estuviera puesta y se busca otra.
      const current = target ? ids : [...ids, suggested];
      const res = await stylistApi.alternatives({ ...ctx, itemIds: current, replaceItemId: target ?? suggested, excludeItemIds: [suggested] });
      const next = res.alternatives.find((x) => x.itemId !== suggested && !ids.includes(x.itemId));
      setItems((prev) => ({ ...prev, ...res.items }));
      if (!next) return rejectTip(tip);
      const name = res.items[next.itemId]?.name ?? 'otra prenda';
      const replacement: StylistTip =
        a?.type === 'swap'
          ? { ...tip, id: `${tip.code}:${next.itemId}`, text: `¿Y con «${name}»? ${next.reason}`, action: { type: 'swap', fromItemId: a.fromItemId, toItemId: next.itemId } }
          : { ...tip, id: `${tip.code}:${next.itemId}`, text: `¿Y si pruebas con «${name}»? ${next.reason}`, action: { type: 'add', itemId: next.itemId } };
      updateLook((l) => ({ ...l, tips: l.tips.map((t) => (t.id === tip.id ? replacement : t)) }));
    } catch (err) {
      setError(err);
    }
  }

  async function swapItem(fromId: string, toId: string) {
    updateLook((l) => {
      const picks = l.picks.map((p) => (p.itemId === fromId ? { itemId: toId, slot: p.slot } : p));
      return { ...l, picks, key: picks.map((p) => p.itemId).sort().join(','), tips: l.tips.filter((t) => !tipItems(t).includes(fromId)) };
    });
    setSwapFor(null);
    setLocked((prev) => prev.filter((x) => x !== fromId));
    void send('SWAP', { itemIds: [fromId] });
  }

  function removeItem(id: string) {
    updateLook((l) => ({ ...l, picks: l.picks.filter((p) => p.itemId !== id) }));
    setLocked((prev) => prev.filter((x) => x !== id));
  }

  async function save() {
    if (!look) return;
    setBusy(true);
    setError(null);
    try {
      const title = [labelOf(STYLE_TAGS, style), labelOf(OCCASIONS, occasion)].filter(Boolean).join(' · ') || 'Propuesta del estilista';
      const created = await outfitsApi.create({
        name: title.slice(0, 80),
        description: look.reasons.join(' ').slice(0, 500) || undefined,
        occasion: occasion ? labelOf(OCCASIONS, occasion).slice(0, 60) : undefined,
        season: weather === 'hot' ? 'SUMMER' : weather === 'cold' ? 'WINTER' : undefined,
        items: look.picks.map((p, i) => ({ wardrobeItemId: p.itemId, position: i, styling: p.styling })),
      });
      setSaved({ key: look.key, id: created.id });
      void send('SAVE');
      void insights.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function like() {
    if (!look) return;
    setLiked((p) => ({ ...p, [look.key]: true }));
    void send('LIKE');
  }

  function dislike() {
    if (!look) return;
    void send('DISLIKE');
    setLooks((prev) => prev.filter((_, i) => i !== index));
    setIndex((i) => Math.max(0, Math.min(i, looks.length - 2)));
  }

  const toggleLock = (id: string) => setLocked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const webgl = hasWebGL();
  const noItems = insights.data?.stats.total === 0;

  return (
    <section className="page stylist">
      <header className="page-head">
        <div>
          <h1>Estilista</h1>
          <p className="muted">Combina lo que ya tienes. Te deja notas: acéptalas, descártalas o pídele otra idea.</p>
        </div>
      </header>

      <div className="stylist-controls panel">
        <ChipGroup label="Estilo" value={style} onChange={setStyle} options={STYLE_TAGS} />
        <ChipGroup label="Ocasión" value={occasion} onChange={setOccasion} options={OCCASIONS} />
        <div className="stylist-controls-row">
          <div className="field">
            <span className="field-label">Tiempo</span>
            <div className="segmented segmented-small" role="group" aria-label="Tiempo">
              {[{ value: '', short: 'Da igual' }, ...WEATHER].map((w) => (
                <button key={w.value || 'any'} type="button" aria-pressed={weather === w.value} title={'label' in w ? String(w.label) : undefined} onClick={() => setWeather(w.value)}>
                  {w.short}
                </button>
              ))}
            </div>
          </div>
          {wardrobes.length > 1 && (
            <div className="field">
              <span id="st-wardrobe" className="field-label">Armario</span>
              <Select
                labelledBy="st-wardrobe"
                value={wardrobeId}
                options={[{ value: '', label: 'Todos' }, ...wardrobes.map((w) => ({ value: w.id, label: w.name }))]}
                onChange={setWardrobeId}
              />
            </div>
          )}
          <label className="check" title="Da prioridad a prendas que no usas en ningún outfit">
            <input type="checkbox" checked={discover} onChange={(e) => setDiscover(e.target.checked)} />
            <span>Descubrir combinaciones nuevas</span>
          </label>
          <span className="spacer" />
          {locked.length > 0 && (
            <button type="button" className="btn" disabled={busy} onClick={() => void generate(true)}>
              <Icon name="lock" size={14} /> Otra con {locked.length === 1 ? 'la fijada' : `las ${locked.length} fijadas`}
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void generate()}>
            {busy ? <Busy text="Pensando…" /> : <><Icon name="spark" size={14} /> Proponer outfits</>}
          </button>
        </div>
      </div>

      <ErrorNote error={error} />

      {noItems ? (
        <div className="panel stylist-empty">
          <p>Aún no hay prendas en el armario. Añade unas cuantas y te propongo outfits con ellas.</p>
          <Link className="btn btn-primary" to="/armario?nueva=1">
            <Icon name="plus" size={14} /> Añadir prenda
          </Link>
        </div>
      ) : look ? (
        <div className="stylist-layout">
          <div className="stylist-stage">
            {webgl ? <OutfitStage garments={garments} shape={shape} /> : <p className="muted stage-fallback">Tu navegador no muestra 3D.</p>}
            <div className="graffiti-layer" aria-live="polite">
              {look.tips.map((tip, i) => (
                <GraffitiNote
                  key={tip.id}
                  tip={tip}
                  slot={i}
                  onAccept={() => applyTip(tip)}
                  onReject={() => rejectTip(tip)}
                  onAnother={tip.action && tip.action.type !== 'styling' ? () => void anotherTip(tip) : undefined}
                />
              ))}
            </div>
            {looks.length > 1 && (
              <div className="stylist-pager">
                <button type="button" className="btn btn-icon" aria-label="Outfit anterior" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                  <Icon name="back" />
                </button>
                <span>
                  {index + 1} / {looks.length}
                </span>
                <button
                  type="button"
                  className="btn btn-icon"
                  aria-label="Outfit siguiente"
                  disabled={index >= looks.length - 1}
                  onClick={() => setIndex(index + 1)}
                >
                  <Icon name="forward" />
                </button>
              </div>
            )}
          </div>

          <aside className="stylist-side panel">
            <h2 className="panel-title">Por qué funciona</h2>
            <div className="palette" aria-label="Paleta del outfit">
              {look.palette.map((p, i) => (
                <span key={i} className="swatch" style={{ background: p.color }} title={p.name} />
              ))}
            </div>
            <ul className="reasons">
              {look.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>

            <h2 className="panel-title">Prendas</h2>
            <ul className="stylist-items">
              {look.picks.map((p) => {
                const it = items[p.itemId];
                if (!it) return null;
                const isLocked = locked.includes(p.itemId);
                return (
                  <li key={p.itemId} className={swapFor === p.itemId ? 'is-open' : ''}>
                    <div className="stylist-item">
                      <span className="dot" style={{ background: it.color }} aria-hidden="true" />
                      <span className="slot">{SLOT_LABEL[p.slot]}</span>
                      <Link to={`/items/${it.id}`} className="name">
                        {it.name}
                      </Link>
                      <button
                        type="button"
                        className={`btn btn-icon btn-small${isLocked ? ' is-active' : ''}`}
                        aria-pressed={isLocked}
                        title={isLocked ? 'Fijada: se queda al pedir otra' : 'Fijar para la siguiente propuesta'}
                        onClick={() => toggleLock(p.itemId)}
                      >
                        <Icon name="lock" size={13} />
                      </button>
                      <button type="button" className="btn btn-small" onClick={() => setSwapFor(swapFor === p.itemId ? null : p.itemId)}>
                        Cambiar
                      </button>
                    </div>
                    {swapFor === p.itemId && (
                      <SwapList
                        ctx={ctx}
                        ids={ids}
                        replaceId={p.itemId}
                        onItems={(m) => setItems((prev) => ({ ...prev, ...m }))}
                        onPick={(to) => void swapItem(p.itemId, to)}
                        onRemove={['head', 'neck', 'outer', 'mid'].includes(p.slot) ? () => removeItem(p.itemId) : undefined}
                      />
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="stylist-actions">
              <button type="button" className={`btn${liked[look.key] ? ' is-active' : ''}`} onClick={like} aria-pressed={!!liked[look.key]}>
                <Icon name="heart" size={14} /> Me gusta
              </button>
              <button type="button" className="btn" onClick={dislike}>
                No es para mí
              </button>
              {saved?.key === look.key ? (
                <Link className="btn btn-primary" to={`/outfits/${saved.id}`}>
                  Guardado · abrir
                </Link>
              ) : (
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save()}>
                  Guardar outfit
                </button>
              )}
            </div>
          </aside>
        </div>
      ) : (
        !busy && (
          <div className="panel stylist-empty">
            <p>No he podido montar ningún outfit completo con estas prendas: me hace falta al menos una parte de arriba y una de abajo (o un vestido).</p>
          </div>
        )
      )}

      {insights.data && insights.data.insights.length > 0 && (
        <section className="stylist-insights" aria-labelledby="missing-title">
          <h2 id="missing-title" className="spray-title">Le falta a tu armario</h2>
          <div className="tape-notes">
            {insights.data.insights.slice(0, 6).map((n, i) => (
              <p key={n.code} className={`tape-note p${n.priority}`} style={{ ['--tilt' as string]: `${((i * 37) % 7) - 3}deg` }}>
                {n.text}
              </p>
            ))}
          </div>
          {insights.data.stats.styles.length > 0 && (
            <p className="muted small">
              Tu armario es sobre todo:{' '}
              {insights.data.stats.styles
                .slice(0, 3)
                .map((s) => s.label.toLowerCase())
                .join(', ')}
              . Colores que más tienes: {insights.data.stats.topColors.slice(0, 3).map((c) => c.name).join(', ')}.
            </p>
          )}
        </section>
      )}
    </section>
  );
}

function tipItems(tip: StylistTip): string[] {
  const a = tip.action;
  if (!a) return [];
  if (a.type === 'swap') return [a.toItemId];
  return [a.itemId];
}

function ChipGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="chips chips-small" role="group" aria-label={label}>
        <button type="button" className={`chip${value === '' ? ' is-active' : ''}`} aria-pressed={value === ''} onClick={() => onChange('')}>
          Cualquiera
        </button>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`chip${value === o.value ? ' is-active' : ''}`}
            aria-pressed={value === o.value}
            onClick={() => onChange(value === o.value ? '' : o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<StylistTip['kind'], string> = {
  praise: '¡Bien!',
  add: 'Añade',
  swap: 'Prueba',
  styling: 'Truco',
  missing: 'Te falta',
};

/** Nota tipo grafiti/pegatina junto al maniquí. */
function GraffitiNote({
  tip,
  slot,
  onAccept,
  onReject,
  onAnother,
}: {
  tip: StylistTip;
  slot: number;
  onAccept: () => void;
  onReject: () => void;
  onAnother?: () => void;
}) {
  const tilt = [-4, 3, -2, 4][slot % 4];
  const actionable = tip.kind !== 'praise' && tip.kind !== 'missing';
  return (
    <div className={`graffiti-note k-${tip.kind} pos-${slot % 4}`} style={{ ['--tilt' as string]: `${tilt}deg` }}>
      <span className="graffiti-tag">{KIND_LABEL[tip.kind]}</span>
      <p>{tip.text}</p>
      <div className="graffiti-actions">
        {actionable ? (
          <>
            <button type="button" onClick={onAccept} title="Aplicar al outfit">
              <Icon name="check" size={13} /> Vale
            </button>
            {onAnother && (
              <button type="button" onClick={onAnother} title="Otra idea">
                <Icon name="refresh" size={13} /> Otra
              </button>
            )}
            <button type="button" onClick={onReject} title="Descartar" aria-label="Descartar consejo">
              <Icon name="close" size={13} />
            </button>
          </>
        ) : (
          <button type="button" onClick={tip.kind === 'praise' ? onAccept : onReject} title="Cerrar" aria-label="Cerrar nota">
            <Icon name="close" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Lista de prendas que pueden sustituir a una del outfit. */
function SwapList({
  ctx,
  ids,
  replaceId,
  onItems,
  onPick,
  onRemove,
}: {
  ctx: StylistContext;
  ids: string[];
  replaceId: string;
  onItems: (m: Record<string, StylistItem>) => void;
  onPick: (id: string) => void;
  onRemove?: () => void;
}) {
  const alts = useAsync(async () => {
    const res = await stylistApi.alternatives({ ...ctx, itemIds: ids, replaceItemId: replaceId });
    onItems(res.items);
    return res;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replaceId]);
  if (alts.loading) return <p className="muted small swap-list"><Busy text="Buscando…" /></p>;
  if (alts.error) return <ErrorNote error={alts.error} />;
  const list = alts.data?.alternatives ?? [];
  return (
    <div className="swap-list">
      {list.length === 0 && <p className="muted small">No tienes otra prenda para este hueco.</p>}
      <ul>
        {list.map((a) => {
          const it = alts.data?.items[a.itemId];
          if (!it) return null;
          return (
            <li key={a.itemId}>
              <button type="button" onClick={() => onPick(a.itemId)}>
                <span className="dot" style={{ background: it.color }} aria-hidden="true" />
                <span className="name">{it.name}</span>
                <small className="muted">{a.reason}</small>
              </button>
            </li>
          );
        })}
      </ul>
      {onRemove && (
        <button type="button" className="btn btn-small btn-ghost" onClick={onRemove}>
          Quitarla del outfit
        </button>
      )}
    </div>
  );
}
