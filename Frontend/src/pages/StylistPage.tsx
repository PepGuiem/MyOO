import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { outfitsApi, stylistApi } from '../api/endpoints';
import type { Styling, StylistContext, StylistItem, StylistOutfit, StylistSlot, StylistTip } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { useToast } from '../components/fx/Toast';
import { Icon, type IconName } from '../components/Icon';
import { useAppData } from '../components/Layout';
import { Select } from '../components/Select';
import { Busy } from '../components/Spinner';
import { MissingPieces } from '../components/stylist/MissingPieces';
import { StickyNote } from '../components/stylist/StickyNote';
import { StyleAnalysis, seasonForWeather } from '../components/stylist/StyleAnalysis';
import { SwapTray } from '../components/stylist/SwapTray';
import { t } from '../i18n';
import { useBodyShape } from '../lib/bodyPref';
import { colorName } from '../lib/colors';
import { hasWebGL } from '../lib/device';
import { burstAt, reducedMotion } from '../lib/motion';
import { OCCASIONS, STYLE_TAGS, WEATHER, labelOf } from '../lib/stylist';
import { useAsync } from '../lib/useAsync';
import { OutfitStage, type StageRig, type StageView } from '../three/OutfitMannequin';
import { ItemView } from '../three/ItemView';

/** Orden en el maniquí: lo de debajo primero (la capa intermedia va sobre la camiseta). */
const SLOT_ORDER: StylistSlot[] = ['full', 'top', 'mid', 'bottom', 'outer', 'shoes', 'head', 'neck'];
const SLOT_LABEL: Record<StylistSlot, string> = {
  full: t('Vestido'),
  top: t('Arriba'),
  mid: t('Capa'),
  bottom: t('Abajo'),
  outer: t('Abrigo'),
  shoes: t('Calzado'),
  head: t('Cabeza'),
  neck: t('Cuello'),
};

/** Grupos de la lista de prendas del outfit. */
const GROUPS: { label: string; icon: IconName; slots: StylistSlot[] }[] = [
  { label: t('Parte superior'), icon: 'tshirt', slots: ['full', 'top', 'mid'] },
  { label: t('Parte inferior'), icon: 'pants', slots: ['bottom'] },
  { label: t('Abrigo'), icon: 'jacket', slots: ['outer'] },
  { label: t('Calzado'), icon: 'shoe', slots: ['shoes'] },
  { label: t('Accesorios'), icon: 'cap', slots: ['head', 'neck'] },
];

const OCCASION_ICON: Record<string, IconName> = {
  everyday: 'coffee',
  work: 'briefcase',
  university: 'book',
  date: 'heart',
  party: 'spark',
  vacation: 'plane',
  sport: 'dumbbell',
  formal_event: 'crown',
};
const WEATHER_ICON: Record<string, IconName> = { '': 'shuffle', cold: 'snow', cool: 'wind', mild: 'sun', hot: 'flame' };

const VIEWS: { value: StageView; label: string }[] = [
  { value: 'front', label: t('Frente') },
  { value: 'side', label: t('Lado') },
  { value: 'back', label: t('Espalda') },
];

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
 * Estilista: propone outfits con tus prendas y deja notas escritas a mano
 * alrededor del maniquí (consejos que se aceptan, se descartan o se cambian).
 * Motor propio del backend: reglas de color, estilo, ocasión y tiempo, y lo
 * que vas aceptando o rechazando.
 */
export function StylistPage() {
  const { wardrobes } = useAppData();
  const { shape } = useBodyShape();
  const toast = useToast();
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState<{ key: string; id: string } | null>(null);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [discarding, setDiscarding] = useState(false);
  /** Cambia cada vez que se cambia ropa en el maniquí (para el destello). */
  const [dressTick, setDressTick] = useState(0);
  const [changed, setChanged] = useState<string | null>(null);
  const [rig, setRig] = useState<StageRig>({ view: null, viewTick: 0, zoomDir: 0, zoomTick: 0, spin: !reducedMotion() });
  const likeRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

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

  /** Pide propuestas nuevas. Las prendas bloqueadas se quedan siempre. */
  async function generate() {
    setBusy(true);
    setError(null);
    setSwapFor(null);
    setPreview(null);
    try {
      const res = await stylistApi.generate({
        ...ctx,
        count: 4,
        seed: Math.floor(Math.random() * 2_000_000_000),
        lockedItemIds: locked.length ? locked : undefined,
        discover,
      });
      setItems((prev) => ({ ...prev, ...res.items }));
      setLooks(res.outfits.map(toLook));
      setIndex(0);
      setDressTick((n) => n + 1);
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
  // Lo que lleva el maniquí: el outfit, con la prenda que te estás probando si la hay.
  const garments = useMemo(
    () =>
      look?.picks
        .map((p) => {
          const id = swapFor && preview && p.itemId === swapFor ? preview : p.itemId;
          return items[id] && { ...items[id], styling: id === p.itemId ? p.styling : undefined };
        })
        .filter((g): g is StylistItem & { styling: Styling | undefined } => !!g) ?? [],
    [look, items, swapFor, preview],
  );
  // Un consejo no puede cambiar una prenda bloqueada.
  const tips = (look?.tips ?? []).filter((tip) => !(tip.action?.type === 'swap' && locked.includes(tip.action.fromItemId)));

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
      return { ...l, picks, key: picks.map((p) => p.itemId).sort().join(','), tips: l.tips.filter((x) => x.id !== tip.id) };
    });
    if (a) {
      setDressTick((n) => n + 1);
      setChanged(a.type === 'swap' ? a.toItemId : a.itemId);
    }
    if (tip.kind !== 'praise') void send('ACCEPT_TIP', { itemIds: tipItems(tip), tipCode: tip.code });
  }

  function rejectTip(tip: StylistTip) {
    updateLook((l) => ({ ...l, tips: l.tips.filter((x) => x.id !== tip.id) }));
    if (tip.kind !== 'praise') void send('REJECT_TIP', { itemIds: tipItems(tip), tipCode: tip.code });
  }

  /** «Otra»: en vez de esa prenda, la siguiente mejor del mismo hueco. */
  async function anotherTip(tip: StylistTip) {
    const a = tip.action;
    const target = a?.type === 'swap' ? a.fromItemId : null;
    const suggested = a?.type === 'swap' ? a.toItemId : a?.type === 'add' ? a.itemId : null;
    if (!suggested) return rejectTip(tip);
    try {
      // Para «añadir», se pregunta como si ya estuviera puesta y se busca otra.
      const current = target ? ids : [...ids, suggested];
      const res = await stylistApi.alternatives({ ...ctx, itemIds: current, replaceItemId: target ?? suggested, excludeItemIds: [suggested] });
      const next = res.alternatives.find((x) => x.itemId !== suggested && !ids.includes(x.itemId));
      setItems((prev) => ({ ...prev, ...res.items }));
      if (!next) return rejectTip(tip);
      const name = res.items[next.itemId]?.name ?? t('otra prenda');
      const replacement: StylistTip =
        a?.type === 'swap'
          ? {
              ...tip,
              id: `${tip.code}:${next.itemId}`,
              text: t('¿Y con «{name}»? {reason}', { name, reason: next.reason }),
              action: { type: 'swap', fromItemId: a.fromItemId, toItemId: next.itemId },
            }
          : {
              ...tip,
              id: `${tip.code}:${next.itemId}`,
              text: t('¿Y si pruebas con «{name}»? {reason}', { name, reason: next.reason }),
              action: { type: 'add', itemId: next.itemId },
            };
      updateLook((l) => ({ ...l, tips: l.tips.map((x) => (x.id === tip.id ? replacement : x)) }));
    } catch (err) {
      setError(err);
    }
  }

  function swapItem(fromId: string, toId: string) {
    updateLook((l) => {
      const picks = l.picks.map((p) => (p.itemId === fromId ? { itemId: toId, slot: p.slot } : p));
      return { ...l, picks, key: picks.map((p) => p.itemId).sort().join(','), tips: l.tips.filter((x) => !tipItems(x).includes(fromId)) };
    });
    closeTray();
    setLocked((prev) => prev.filter((x) => x !== fromId));
    setDressTick((n) => n + 1);
    setChanged(toId);
    void send('SWAP', { itemIds: [fromId] });
  }

  function removeItem(id: string) {
    updateLook((l) => ({ ...l, picks: l.picks.filter((p) => p.itemId !== id) }));
    setLocked((prev) => prev.filter((x) => x !== id));
    closeTray();
    setDressTick((n) => n + 1);
  }

  function openTray(id: string) {
    setPreview(null);
    setSwapFor((cur) => (cur === id ? null : id));
  }

  function closeTray() {
    setSwapFor(null);
    setPreview(null);
  }

  async function save() {
    if (!look) return;
    setSaving(true);
    setError(null);
    try {
      const title = [labelOf(STYLE_TAGS, style), labelOf(OCCASIONS, occasion)].filter(Boolean).map((x) => t(x)).join(' · ') || t('Propuesta del estilista');
      const created = await outfitsApi.create({
        name: title.slice(0, 80),
        description: look.reasons.join(' ').slice(0, 500) || undefined,
        // El motor reconoce la ocasión por el texto en español.
        occasion: occasion ? labelOf(OCCASIONS, occasion).slice(0, 60) : undefined,
        season: seasonForWeather(weather),
        items: look.picks.map((p, i) => ({ wardrobeItemId: p.itemId, position: i, styling: p.styling })),
      });
      setSaved({ key: look.key, id: created.id });
      burstAt(saveRef.current, { count: 16, spread: 70 });
      toast.show(t('Outfit guardado'), { tone: 'ok', icon: 'check', sound: 'success' });
      void send('SAVE');
      void insights.reload();
    } catch (err) {
      setError(err);
      toast.show(t('No se ha podido guardar el outfit.'), { tone: 'danger', sound: 'error' });
    } finally {
      setSaving(false);
    }
  }

  function like() {
    if (!look) return;
    const on = !liked[look.key];
    setLiked((p) => ({ ...p, [look.key]: on }));
    if (on) {
      burstAt(likeRef.current, { count: 12, spread: 46 });
      void send('LIKE');
    }
  }

  function dislike() {
    if (!look || discarding) return;
    void send('DISLIKE');
    const drop = () => {
      setLooks((prev) => prev.filter((_, i) => i !== index));
      setIndex((i) => Math.max(0, Math.min(i, looks.length - 2)));
      setDiscarding(false);
      setDressTick((n) => n + 1);
      closeTray();
      toast.show(t('Descartado. Lo tendré en cuenta.'), { tone: 'info', icon: 'close' });
    };
    if (reducedMotion()) return drop();
    setDiscarding(true);
    window.setTimeout(drop, 420);
  }

  function go(next: number) {
    setIndex(next);
    closeTray();
    setDressTick((n) => n + 1);
  }

  const toggleLock = (id: string) => setLocked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const setView = (view: StageView) => setRig((r) => ({ ...r, view, viewTick: r.viewTick + 1, spin: false }));
  const zoom = (dir: 1 | -1) => setRig((r) => ({ ...r, zoomDir: dir, zoomTick: r.zoomTick + 1 }));

  // Destello en la prenda recién cambiada de la lista.
  useEffect(() => {
    if (!changed) return;
    const timer = window.setTimeout(() => setChanged(null), 1200);
    return () => window.clearTimeout(timer);
  }, [changed]);

  const webgl = hasWebGL();
  const noItems = insights.data?.stats.total === 0;
  const swapping = swapFor ? items[swapFor] : null;
  const swapSlot = look?.picks.find((p) => p.itemId === swapFor)?.slot;

  return (
    <section className="page st">
      <header className="st-head">
        <span className="wd-kicker">
          <Icon name="sparkles" size={12} /> {t('Virtual stylist')}
        </span>
        <h1 className="wd-title st-title" data-text={t('Estilista')}>
          {t('Estilista')}
        </h1>
        <p className="st-lede">
          {t('Combina lo que ya tienes.')} <span>{t('Te deja notas a mano: acéptalas, descártalas o pídele otra idea.')}</span>
        </p>
      </header>

      <div className="st-controls">
        <ControlBlock icon="sparkles" label={t('Estilo')} value={style ? t(labelOf(STYLE_TAGS, style)) : t('Cualquiera')}>
          <TagRow label={t('Estilo')} value={style} onChange={setStyle} options={STYLE_TAGS} />
        </ControlBlock>
        <ControlBlock icon="pin" label={t('Ocasión')} value={occasion ? t(labelOf(OCCASIONS, occasion)) : t('Cualquiera')}>
          <TagRow label={t('Ocasión')} value={occasion} onChange={setOccasion} options={OCCASIONS} icons={OCCASION_ICON} />
        </ControlBlock>
        <ControlBlock icon="sun" label={t('Tiempo')} value={weather ? t(WEATHER.find((w) => w.value === weather)?.label ?? '') : t('Da igual')}>
          <div className="st-tags" role="radiogroup" aria-label={t('Tiempo')}>
            {[{ value: '', short: 'Da igual', label: '' }, ...WEATHER].map((w) => (
              <button
                key={w.value || 'any'}
                type="button"
                role="radio"
                aria-checked={weather === w.value}
                className={`wd-tag st-tag${weather === w.value ? ' is-active' : ''}`}
                title={w.label ? t(w.label) : undefined}
                onClick={() => setWeather(w.value)}
              >
                <Icon name={WEATHER_ICON[w.value]} size={13} />
                <span>{t(w.short)}</span>
              </button>
            ))}
          </div>
        </ControlBlock>

        <div className="st-run">
          <div className="st-run-opts">
            {wardrobes.length > 1 && (
              <div className="st-run-field">
                <span id="st-wardrobe" className="st-block-label">
                  <Icon name="wardrobe" size={13} /> {t('Armario')}
                </span>
                <Select
                  size="sm"
                  labelledBy="st-wardrobe"
                  value={wardrobeId}
                  options={[{ value: '', label: t('Todos') }, ...wardrobes.map((w) => ({ value: w.id, label: w.name }))]}
                  onChange={setWardrobeId}
                />
              </div>
            )}
            <label className="st-switch" title={t('Da prioridad a prendas que no usas en ningún outfit')}>
              <input type="checkbox" checked={discover} onChange={(e) => setDiscover(e.target.checked)} />
              <span className="st-switch-ui" aria-hidden="true" />
              <span>{t('Descubrir combinaciones nuevas')}</span>
            </label>
            {locked.length > 0 && (
              <span className="st-locks">
                <Icon name="lock" size={13} />
                {locked.length === 1 ? t('1 prenda bloqueada') : t('{n} prendas bloqueadas', { n: locked.length })}
                <button type="button" onClick={() => setLocked([])}>
                  {t('Soltar')}
                </button>
              </span>
            )}
          </div>
          <button type="button" className={`st-cta${busy ? ' is-busy' : ''}`} disabled={busy} onClick={() => void generate()} aria-busy={busy}>
            <span className="st-cta-icon" aria-hidden="true">
              <Icon name="sparkles" size={18} />
            </span>
            <span className="st-cta-text">{busy ? t('Generando propuestas…') : t('Proponer outfits')}</span>
            {busy && <span className="st-cta-progress" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <ErrorNote error={error} />

      {noItems ? (
        <div className="st-empty">
          <Icon name="hanger" size={42} />
          <h2 className="st-h2">{t('Primero, tu armario')}</h2>
          <p className="muted">{t('Aún no hay prendas en el armario. Añade unas cuantas y te propongo outfits con ellas.')}</p>
          <Link className="btn st-btn-neon" to="/armario?nueva=1">
            <Icon name="plus" size={14} /> {t('Añadir prenda')}
          </Link>
        </div>
      ) : look ? (
        <div className={`st-layout${discarding ? ' is-discarding' : ''}`}>
          <div className="st-main">
            <div className="st-stage-wrap">
            <div className={`st-stage${busy ? ' is-busy' : ''}`}>
              <span className="st-stage-beams" aria-hidden="true" />
              <span className="st-stage-floor" aria-hidden="true" />
              <span className="st-stage-spot" aria-hidden="true" />
              <span key={dressTick} className="st-stage-flash" aria-hidden="true" />
              {webgl ? (
                <div className="st-canvas">
                  <OutfitStage garments={garments} shape={shape} rig={rig} />
                </div>
              ) : (
                <p className="muted stage-fallback">{t('Tu navegador no muestra 3D.')}</p>
              )}

              {webgl && (
                <>
                  <span className="st-hint">
                    <Icon name="refresh" size={12} /> {t('Arrastra para girar · rueda o pellizco para el zoom')}
                  </span>
                  <div className="st-tools" role="toolbar" aria-label={t('Vista del maniquí')}>
                    {VIEWS.map((v) => (
                      <button key={v.value} type="button" className={rig.view === v.value && !rig.spin ? 'is-on' : undefined} onClick={() => setView(v.value)}>
                        {v.label}
                      </button>
                    ))}
                    <span className="st-tools-sep" aria-hidden="true" />
                    <button type="button" onClick={() => zoom(1)} aria-label={t('Acercar')} title={t('Acercar')}>
                      <Icon name="zoomIn" size={15} />
                    </button>
                    <button type="button" onClick={() => zoom(-1)} aria-label={t('Alejar')} title={t('Alejar')}>
                      <Icon name="zoomOut" size={15} />
                    </button>
                    <button
                      type="button"
                      className={rig.spin ? 'is-on' : undefined}
                      aria-pressed={rig.spin}
                      onClick={() => setRig((r) => ({ ...r, spin: !r.spin, view: r.spin ? r.view : null }))}
                      aria-label={rig.spin ? t('Parar el giro') : t('Girar solo')}
                      title={rig.spin ? t('Parar el giro') : t('Girar solo')}
                    >
                      <Icon name={rig.spin ? 'pause' : 'play'} size={14} />
                    </button>
                  </div>
                </>
              )}


              {looks.length > 1 && (
                <div className="st-pager">
                  <button type="button" aria-label={t('Outfit anterior')} disabled={index === 0} onClick={() => go(index - 1)}>
                    <Icon name="back" size={15} />
                  </button>
                  <span className="st-dots" aria-label={t('Outfit {n} de {total}', { n: index + 1, total: looks.length })}>
                    {looks.map((l, i) => (
                      <i key={l.key + i} className={i === index ? 'is-on' : undefined} />
                    ))}
                  </span>
                  <button type="button" aria-label={t('Outfit siguiente')} disabled={index >= looks.length - 1} onClick={() => go(index + 1)}>
                    <Icon name="forward" size={15} />
                  </button>
                </div>
              )}

              {busy && (
                <div className="st-scan" aria-hidden="true">
                  <span>{t('Combinando tus prendas…')}</span>
                </div>
              )}
            </div>
              <div className="st-notes" aria-live="polite">
                {tips.map((tip, i) => (
                  <StickyNote
                    key={tip.id}
                    tip={tip}
                    slot={i}
                    onAccept={() => applyTip(tip)}
                    onReject={() => rejectTip(tip)}
                    onAnother={tip.action && tip.action.type !== 'styling' ? () => void anotherTip(tip) : undefined}
                  />
                ))}
              </div>
            </div>

            {swapping && swapFor && (
              <SwapTray
                ctx={ctx}
                ids={ids}
                from={swapping}
                preview={preview}
                onItems={(m) => setItems((prev) => ({ ...prev, ...m }))}
                onPreview={(id) => {
                  setPreview(id);
                  setDressTick((n) => n + 1);
                }}
                onConfirm={(to) => swapItem(swapFor, to)}
                onCancel={() => {
                  closeTray();
                  if (preview) setDressTick((n) => n + 1);
                }}
                onRemove={swapSlot && ['head', 'neck', 'outer', 'mid'].includes(swapSlot) ? () => removeItem(swapFor) : undefined}
              />
            )}
          </div>

          <aside className="st-side">
            <StyleAnalysis
              picks={look.picks}
              palette={look.palette}
              reasons={look.reasons}
              style={style}
              occasion={occasion}
              occasionLabel={labelOf(OCCASIONS, occasion)}
              weather={weather}
              weatherLabel={weather ? t(WEATHER.find((w) => w.value === weather)?.short ?? '') : ''}
            />

            <section className="st-outfit" aria-labelledby="st-outfit-title">
              <header className="st-outfit-head">
                <p className="st-eyebrow">{t('Lo que llevas')}</p>
                <h2 id="st-outfit-title">{t('Prendas del outfit')}</h2>
              </header>
              {GROUPS.map((g) => {
                const picks = look.picks.filter((p) => g.slots.includes(p.slot) && items[p.itemId]);
                if (!picks.length) return null;
                return (
                  <div key={g.label} className="st-group">
                    <span className="st-block-label">
                      <Icon name={g.icon} size={13} /> {g.label}
                    </span>
                    <ul>
                      {picks.map((p) => (
                        <PieceCard
                          key={p.itemId}
                          item={items[p.itemId]}
                          slot={p.slot}
                          locked={locked.includes(p.itemId)}
                          open={swapFor === p.itemId}
                          fresh={changed === p.itemId}
                          onLock={() => toggleLock(p.itemId)}
                          onSwap={() => openTray(p.itemId)}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </section>

            <div className="st-actions">
              <button
                ref={likeRef}
                type="button"
                className={`st-like${liked[look.key] ? ' is-on' : ''}`}
                onClick={like}
                aria-pressed={!!liked[look.key]}
              >
                <Icon name="heart" size={16} /> {liked[look.key] ? t('Te gusta') : t('Me gusta')}
              </button>
              <button type="button" className="st-nope" onClick={dislike} disabled={discarding}>
                <Icon name="close" size={14} /> {t('No es para mí')}
              </button>
              {saved?.key === look.key ? (
                <Link className="st-save is-saved" to={`/outfits/${saved.id}`}>
                  <span className="st-save-check" aria-hidden="true">
                    <Icon name="check" size={16} />
                  </span>
                  {t('Guardado · abrir')}
                </Link>
              ) : (
                <button ref={saveRef} type="button" className="st-save" disabled={saving} onClick={() => void save()}>
                  {saving ? (
                    <Busy text={t('Guardando…')} />
                  ) : (
                    <>
                      <Icon name="check" size={16} /> {t('Guardar outfit')}
                    </>
                  )}
                </button>
              )}
            </div>
          </aside>
        </div>
      ) : (
        !busy && (
          <div className="st-empty">
            <Icon name="flag" size={36} />
            <p>{t('No he podido montar ningún outfit completo con estas prendas: me hace falta al menos una parte de arriba y una de abajo (o un vestido).')}</p>
          </div>
        )
      )}

      {insights.data && <MissingPieces data={insights.data} />}
    </section>
  );
}

function tipItems(tip: StylistTip): string[] {
  const a = tip.action;
  if (!a) return [];
  if (a.type === 'swap') return [a.toItemId];
  return [a.itemId];
}

function ControlBlock({ icon, label, value, children }: { icon: IconName; label: string; value: string; children: ReactNode }) {
  return (
    <div className="st-ctl">
      <div className="st-ctl-head">
        <span className="st-ctl-icon" aria-hidden="true">
          <Icon name={icon} size={15} />
        </span>
        <span className="st-ctl-label">{label}</span>
        <span key={value} className="st-ctl-value">
          {value}
        </span>
      </div>
      {children}
    </div>
  );
}

function TagRow({
  label,
  value,
  onChange,
  options,
  icons,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icons?: Record<string, IconName>;
}) {
  return (
    <div className="st-tags" role="group" aria-label={label}>
      <button type="button" className={`wd-tag st-tag${value === '' ? ' is-active' : ''}`} aria-pressed={value === ''} onClick={() => onChange('')}>
        <span>{t('Cualquiera')}</span>
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`wd-tag st-tag${value === o.value ? ' is-active' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? '' : o.value)}
        >
          {icons?.[o.value] && <Icon name={icons[o.value]} size={13} />}
          <span>{t(o.label)}</span>
        </button>
      ))}
    </div>
  );
}

/** Ficha de una prenda del outfit: miniatura 3D, datos, bloqueo y cambiar. */
function PieceCard({
  item,
  slot,
  locked,
  open,
  fresh,
  onLock,
  onSwap,
}: {
  item: StylistItem;
  slot: StylistSlot;
  locked: boolean;
  open: boolean;
  fresh: boolean;
  onLock: () => void;
  onSwap: () => void;
}) {
  const [active, setActive] = useState(false);
  return (
    <li
      className={`st-piece${locked ? ' is-locked' : ''}${open ? ' is-open' : ''}${fresh ? ' is-fresh' : ''}`}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
    >
      <span className="st-piece-thumb">
        <ItemView className="tile-view" garment={item} active={active} />
      </span>
      <div className="st-piece-info">
        <small>{SLOT_LABEL[slot]}</small>
        <Link to={`/items/${item.id}`} className="st-piece-name">
          {item.name}
        </Link>
        <span className="st-piece-color">
          <span className="st-dot" style={{ background: item.color } as CSSProperties} aria-hidden="true" /> {colorName(item.color)}
          {locked && (
            <em>
              <Icon name="lock" size={11} /> {t('Bloqueada')}
            </em>
          )}
        </span>
      </div>
      <div className="st-piece-acts">
        <button
          type="button"
          className={`st-icon-btn${locked ? ' is-on' : ''}`}
          aria-pressed={locked}
          title={locked ? t('Bloqueada: el estilista no la cambiará') : t('Bloquear: que el estilista no la cambie')}
          aria-label={locked ? t('Desbloquear {name}', { name: item.name }) : t('Bloquear {name}', { name: item.name })}
          onClick={onLock}
        >
          <Icon name={locked ? 'lock' : 'unlock'} size={14} />
        </button>
        <button type="button" className={`st-swap-btn${open ? ' is-on' : ''}`} aria-expanded={open} onClick={onSwap}>
          <Icon name="swap" size={13} /> {t('Cambiar')}
        </button>
      </div>
    </li>
  );
}
