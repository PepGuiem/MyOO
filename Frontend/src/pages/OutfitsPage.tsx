import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { outfitsApi, sneakersApi } from '../api/endpoints';
import type { Outfit, OutfitStyle, OutfitSummary, Sneaker } from '../api/types';
import { BodySelector } from '../components/BodySelector';
import { ErrorNote } from '../components/ErrorNote';
import { ConfirmDialog } from '../components/fx/ConfirmDialog';
import { CompareDialog } from '../components/rating/CompareDialog';
import { ScoreRing, TierBadge } from '../components/rating/RatingGauge';
import { SoundToggle } from '../components/fx/SoundToggle';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { InfiniteSentinel } from '../components/InfiniteSentinel';
import { EmptyStage, NoMatch } from '../components/street/EmptyStage';
import { SectionHead } from '../components/street/SectionHead';
import { CountUp, stickerTilt } from '../components/street/Street';
import { useBodyShape } from '../lib/bodyPref';
import { formatDate, SEASON_LABEL, plural } from '../lib/labels';
import { OUTFIT_STYLES, OUTFIT_STYLE_KEYS } from '../lib/outfitStyles';
import { play } from '../lib/sfx';
import { usePagedList } from '../lib/usePagedList';
import { useTilt } from '../lib/useTilt';
import { SLOT_BY_ID, slotOf } from '../lib/wardrobeSlots';
import { OutfitView } from '../three/OutfitMannequin';
import { t } from '../i18n';

/** Outfits por tanda: cada uno es una escena 3D, mejor pocos y seguidos. */
const PAGE_SIZE = 12;
/** Cámara de las fichas de /outfits: el maniquí entero (de la cabeza a la peana) y grande. */
export const OUTFIT_TILE_DISTANCE = 3.8;

type Tab = 'all' | 'fav';
type Sort = 'new' | 'old' | 'name' | 'score';

const SORTS: { id: Sort; label: string }[] = [
  { id: 'new', label: t('Recientes') },
  { id: 'old', label: t('Antiguos') },
  { id: 'name', label: 'A–Z' },
  { id: 'score', label: t('Nota') },
];

/** Cuántos outfits se pueden comparar a la vez. */
const MAX_COMPARE = 4;

/** Lo que tarda en irse una ficha borrada (coincide con la animación). */
const LEAVE_MS = 460;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : t('Algo ha fallado.');
}

export function OutfitsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { shape } = useBodyShape();

  const [tab, setTab] = useState<Tab>('all');
  const [style, setStyle] = useState<OutfitStyle | null>(null);
  const [sort, setSort] = useState<Sort>('new');
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim(), 280);
  // SNEAKER COLLECTION: ver solo los outfits con unas zapatillas (`?item=` desde su ficha).
  const [params, setParams] = useSearchParams();
  const shoe = params.get('item');
  const setShoe = (id: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (id) n.set('item', id);
        else n.delete('item');
        return n;
      },
      { replace: true },
    );
  const [sneakers, setSneakers] = useState<Sneaker[]>([]);
  useEffect(() => {
    sneakersApi
      .listAll('owned')
      .then(setSneakers)
      .catch(() => setSneakers([]));
  }, []);
  const filtered = tab === 'fav' || !!style || !!search || !!shoe;

  const list = usePagedList(
    (page) =>
      outfitsApi.list(page, PAGE_SIZE, {
        style: style ?? undefined,
        favorite: tab === 'fav' || undefined,
        search: search || undefined,
        sort,
        itemId: shoe ?? undefined,
      }),
    [tab, style, sort, search, shoe],
  );
  const { items: outfits, setItems, setTotal, loading, error, total } = list;

  // Cifras de la cabecera y de los filtros (si el backend es antiguo, no hay).
  const [summary, setSummary] = useState<OutfitSummary | null>(null);
  const refreshSummary = useCallback(() => {
    outfitsApi
      .summary()
      .then(setSummary)
      .catch(() => undefined);
  }, []);

  // Destacados: tus favoritos (y si no tienes, los últimos).
  const [featured, setFeatured] = useState<Outfit[]>([]);
  const refreshFeatured = useCallback(() => {
    outfitsApi
      .list(1, 8, { favorite: true })
      .then(async (res) => (res.data.length ? res.data : (await outfitsApi.list(1, 5)).data))
      .then(setFeatured)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshSummary();
    refreshFeatured();
  }, [refreshSummary, refreshFeatured]);

  // Hombre ↔ mujer: barrido sobre las fichas mientras cambia el maniquí.
  const [swapping, setSwapping] = useState(false);
  const firstSex = useRef(shape.sex);
  useEffect(() => {
    if (firstSex.current === shape.sex) return;
    firstSex.current = shape.sex;
    setSwapping(true);
    const t = window.setTimeout(() => setSwapping(false), 750);
    return () => window.clearTimeout(t);
  }, [shape.sex]);

  // Estado de cada ficha: recién llegada (duplicado) o saliendo (borrada).
  const [fresh, setFresh] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Outfit | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Comparar: modo selección y outfits elegidos.
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const togglePick = (id: string) => {
    play('click');
    setPicked((l) => {
      if (l.includes(id)) return l.filter((x) => x !== id);
      if (l.length >= MAX_COMPARE) {
        toast.show(t('Puedes comparar hasta {MAX_COMPARE} outfits.', { MAX_COMPARE }), { tone: 'info' });
        return l;
      }
      return [...l, id];
    });
  };
  const stopComparing = () => {
    setComparing(false);
    setPicked([]);
  };

  const dropFromList = (id: string) => {
    setLeaving((s) => new Set(s).add(id));
    window.setTimeout(() => {
      setItems((l) => l.filter((o) => o.id !== id));
      setTotal((t) => Math.max(0, t - 1));
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, LEAVE_MS);
  };

  const patchEverywhere = (id: string, patch: Partial<Outfit>) => {
    setItems((l) => l.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    setFeatured((l) => l.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  async function toggleFavorite(o: Outfit) {
    const next = !o.isFavorite;
    play('pop');
    patchEverywhere(o.id, { isFavorite: next });
    setSummary((s) => (s ? { ...s, favorites: Math.max(0, s.favorites + (next ? 1 : -1)) } : s));
    try {
      await outfitsApi.setFavorite(o.id, next);
      if (tab === 'fav' && !next) dropFromList(o.id);
      refreshFeatured();
    } catch (err) {
      patchEverywhere(o.id, { isFavorite: !next });
      setSummary((s) => (s ? { ...s, favorites: Math.max(0, s.favorites + (next ? -1 : 1)) } : s));
      toast.show(errorText(err), { tone: 'danger', sound: 'error' });
    }
  }

  async function duplicate(o: Outfit) {
    setBusyId(o.id);
    try {
      const copy = await outfitsApi.duplicate(o.id);
      if (tab !== 'fav') {
        setItems((l) => {
          const at = l.findIndex((x) => x.id === o.id);
          const next = [...l];
          next.splice(at + 1, 0, copy);
          return next;
        });
        setTotal((t) => t + 1);
        setFresh(copy.id);
      }
      refreshSummary();
      toast.show(t('Duplicado: «{name}»', { name: copy.name }), {
        icon: 'copy',
        sound: 'spray',
        action: { label: t('Editar'), run: () => navigate(`/outfits/${copy.id}`) },
      });
    } catch (err) {
      toast.show(errorText(err), { tone: 'danger', sound: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  async function removeConfirmed() {
    if (!confirm) return;
    const o = confirm;
    setDeleting(true);
    try {
      await outfitsApi.remove(o.id);
      setConfirm(null);
      dropFromList(o.id);
      setFeatured((l) => l.filter((x) => x.id !== o.id));
      refreshSummary();
      toast.show(t('«{name}» eliminado', { name: o.name }), { tone: 'danger', sound: 'swoosh' });
    } catch (err) {
      toast.show(errorText(err), { tone: 'danger', sound: 'error' });
    } finally {
      setDeleting(false);
    }
  }

  const clearFilters = () => {
    play('click');
    setTab('all');
    setStyle(null);
    setQuery('');
    setShoe(null);
  };

  const stylesUsed = summary ? OUTFIT_STYLE_KEYS.filter((k) => summary.byStyle[k] > 0).length : 0;
  const grandTotal = summary?.total ?? (filtered ? null : total);
  const showSpotlight = !filtered && featured.length > 0;
  const firstLoad = loading && outfits.length === 0;

  return (
    <section className="page fits ux ft">

      <header className="fits-hero ux-head">
        <div className="fits-title">
          <span className="wd-kicker">
            <Icon name="layers" size={12} /> {t('My outfits')}
          </span>
          <h1 className="wd-title ux-title" data-text={t('Outfits')}>
            {t('Outfits')}
          </h1>
          <p className="ux-lede">{t('Combina, guarda y estrena. Tu ropa, tus reglas.')}</p>
        </div>

        <div className="wd-head-actions">
          <SoundToggle />
          <Link to="/outfits/new" className="btn wd-add" onClick={() => play('spray')}>
            <Icon name="plus" size={16} /> <span>{t('Nuevo outfit')}</span>
          </Link>
        </div>
      </header>

      <ul className="wd-stats ux-stats" aria-label={t('Resumen')}>
        <li style={{ '--i': 0 } as CSSProperties}>
          <Icon name="layers" size={16} />
          <strong>{grandTotal === null ? '–' : <CountUp value={grandTotal} />}</strong>
          <span>{t('Fits')}</span>
        </li>
        <li style={{ '--i': 1 } as CSSProperties}>
          <Icon name="star" size={16} />
          <strong>{summary ? <CountUp value={summary.favorites} delay={120} /> : '–'}</strong>
          <span>{t('Favoritos')}</span>
        </li>
        <li style={{ '--i': 2 } as CSSProperties}>
          <Icon name="palette" size={16} />
          <strong>{summary ? <CountUp value={stylesUsed} delay={240} /> : '–'}</strong>
          <span>{t('Estilos')}</span>
        </li>
      </ul>

      {showSpotlight && (
        <section className="ux-section">
          <SectionHead n={1} title={featured.some((o) => o.isFavorite) ? t('Fit del día') : t('Lo último')} />
          <Spotlight outfits={featured} favorites={featured.some((o) => o.isFavorite)} />
        </section>
      )}

      <SectionHead n={showSpotlight ? 2 : 1} title={t('Tu colección')}>
        {!firstLoad && (
          <span className="ux-section-count">
            <CountUp value={total} />
          </span>
        )}
      </SectionHead>

      <div className="fits-filters" role="search">
        <div className="fits-row">
          <div className={`tab-switch is-${tab}`} role="tablist" aria-label={t('Qué outfits ver')}>
            <span className="tab-thumb" aria-hidden="true" />
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'all'}
              onClick={() => {
                play('click');
                setTab('all');
              }}
            >
              <Icon name="grid" size={14} /> {t('Todos')}
              {summary && <span className="count">{summary.total}</span>}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'fav'}
              onClick={() => {
                play('click');
                setTab('fav');
              }}
            >
              <Icon name="star" size={14} /> {t('Favoritos')}
              {summary && <span className="count">{summary.favorites}</span>}
            </button>
          </div>

          <label className="fits-search">
            <Icon name="search" />
            <input
              type="search"
              placeholder={t('Buscar outfit, ocasión…')}
              aria-label={t('Buscar outfit')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button type="button" className="icon-btn" aria-label={t('Borrar búsqueda')} onClick={() => setQuery('')}>
                <Icon name="close" size={14} />
              </button>
            )}
          </label>

          <div className="sort-pills" role="group" aria-label={t('Orden')}>
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-pressed={sort === s.id}
                onClick={() => {
                  play('click');
                  setSort(s.id);
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`compare-toggle${comparing ? ' is-on' : ''}`}
            aria-pressed={comparing}
            onClick={() => {
              play('click');
              if (comparing) stopComparing();
              else setComparing(true);
            }}
          >
            <Icon name="compare" size={14} /> {comparing ? t('Salir de comparar') : t('Comparar')}
          </button>
        </div>

        <div className="style-rail" role="group" aria-label={t('Estilo')}>
          <button
            type="button"
            className={`style-chip style-chip-all${style === null ? ' is-active' : ''}`}
            aria-pressed={style === null}
            onClick={() => {
              play('click');
              setStyle(null);
            }}
          >
            {t('Todos los estilos')}
          </button>
          {OUTFIT_STYLE_KEYS.map((k, i) => {
            const meta = OUTFIT_STYLES[k];
            const n = summary?.byStyle[k];
            return (
              <button
                key={k}
                type="button"
                className={`style-chip${style === k ? ' is-active' : ''}${n === 0 ? ' is-empty' : ''}`}
                style={{ '--c': meta.color, '--ink': meta.ink, '--tilt': `${stickerTilt(k)}deg`, '--i': i } as CSSProperties}
                aria-pressed={style === k}
                title={meta.hint}
                onClick={() => {
                  play('click');
                  setStyle(style === k ? null : k);
                }}
              >
                <span className="style-dot" aria-hidden="true" />
                {meta.label}
                {n !== undefined && <span className="count">{n}</span>}
              </button>
            );
          })}
        </div>

        {sneakers.length > 0 && (
          <div className="shoe-rail" role="group" aria-label={t('Con estas zapatillas')}>
            <span className="shoe-rail-label">
              <Icon name="shoe" size={14} /> {t('Con')}
            </span>
            {sneakers.map((x) => (
              <button
                key={x.id}
                type="button"
                className={`shoe-chip${shoe === x.id ? ' is-active' : ''}`}
                style={{ '--sw': x.color } as CSSProperties}
                aria-pressed={shoe === x.id}
                title={`${x.sneaker.brandLabel} ${x.sneaker.model}${x.sneaker.colorway ? ` · ${x.sneaker.colorway}` : ''}`}
                onClick={() => {
                  play('click');
                  setShoe(shoe === x.id ? null : x.id);
                }}
              >
                <i className="snk-swatch" aria-hidden="true" />
                <b>{x.sneaker.brandLabel}</b> {x.sneaker.model}
                <span className="count">{x.outfitCount}</span>
              </button>
            ))}
          </div>
        )}

        <BodySelector className="fits-body" />
      </div>

      <div className="fits-status" aria-live="polite">
        {!firstLoad && (
          <span>
            {filtered ? `${plural(total, t('resultado'), t('resultados'))}` : plural(total, t('outfit'), t('outfits'))}
            {style && <span className="status-tag">{OUTFIT_STYLES[style].label}</span>}
            {tab === 'fav' && <span className="status-tag">{t('Favoritos')}</span>}
            {search && <span className="status-tag">«{search}»</span>}
            {shoe && (
              <span className="status-tag">
                <Icon name="shoe" size={11} /> {sneakers.find((x) => x.id === shoe)?.sneaker.model ?? t('Zapatillas')}
              </span>
            )}
          </span>
        )}
        {filtered && (
          <button type="button" className="link-btn" onClick={clearFilters}>
            <Icon name="close" size={12} /> {t('Quitar filtros')}
          </button>
        )}
      </div>

      {outfits.length === 0 && <ErrorNote error={error} />}

      {firstLoad ? (
        <SprayLoader label={t('Sacando tus outfits…')} />
      ) : !loading && !error && outfits.length === 0 ? (
        filtered ? (
          <NoMatch title={t('Nada por aquí')} text={t('Ningún outfit con estos filtros. Prueba con otro estilo o busca otra palabra.')}>
            <button type="button" className="btn wd-btn-line" onClick={clearFilters}>
              {t('Ver todos')}
            </button>
          </NoMatch>
        ) : (
          <EmptyStage
            icon="layers"
            pieces={['hoodie', 'cap', 'shoe', 'pants', 'jacket', 'tshirt']}
            kicker={t('My outfits')}
            kickerIcon="layers"
            title={t('Pared en blanco')}
            text={t('Todavía no tienes outfits. Entra al vestidor, combina prendas de tus armarios y guárdalas juntas.')}
          >
            <Link to="/outfits/new" className="btn wd-add wd-add-big">
              <Icon name="plus" size={16} /> <span>{t('Crear el primero')}</span>
            </Link>
          </EmptyStage>
        )
      ) : (
        <div className={`fits-grid${swapping ? ' is-swapping' : ''}${comparing ? ' is-comparing' : ''}`}>
          {outfits.map((o, i) => (
            <FitCard
              key={o.id}
              outfit={o}
              index={i}
              stagger={i % PAGE_SIZE}
              fresh={fresh === o.id}
              leaving={leaving.has(o.id)}
              busy={busyId === o.id}
              comparing={comparing}
              picked={picked.includes(o.id)}
              onPick={() => togglePick(o.id)}
              onFavorite={() => toggleFavorite(o)}
              onDuplicate={() => duplicate(o)}
              onDelete={() => {
                play('click');
                setConfirm(o);
              }}
            />
          ))}
        </div>
      )}

      <InfiniteSentinel
        hasMore={list.hasMore}
        loading={loading}
        error={outfits.length > 0 ? error : null}
        onMore={list.loadMore}
        count={outfits.length}
        endLabel={total > PAGE_SIZE ? t('Ya están los {total}.', { total }) : undefined}
      />

      {comparing && (
        <div className="compare-tray" role="region" aria-label={t('Comparar outfits')}>
          <span className="compare-slots" aria-hidden="true">
            {Array.from({ length: MAX_COMPARE }, (_, i) => (
              <i key={i} className={i < picked.length ? 'is-on' : ''} />
            ))}
          </span>
          <span className="compare-tray-text">
            {picked.length < 2 ? t('Elige {v} más para comparar', { v: 2 - picked.length }) : t('{n} elegidos', { n: picked.length })}
          </span>
          <button
            type="button"
            className="btn wd-add"
            disabled={picked.length < 2}
            onClick={() => {
              play('swoosh');
              setShowCompare(true);
            }}
          >
            <Icon name="compare" size={14} /> {t('Comparar')}
          </button>
          <button type="button" className="icon-btn" onClick={stopComparing} aria-label={t('Cancelar')}>
            <Icon name="close" />
          </button>
        </div>
      )}

      {showCompare && (
        <CompareDialog
          ids={picked}
          onClose={() => setShowCompare(false)}
          onOpen={(id) => navigate(`/outfits/${id}`)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={t('¿Eliminar «{name}»?', { name: confirm.name })}
          confirmLabel={t('Eliminar outfit')}
          danger
          busy={deleting}
          onConfirm={removeConfirmed}
          onClose={() => setConfirm(null)}
        >
          <p>{t('Se borra el outfit, no las prendas: siguen en tus armarios.')}</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

/** Prendas del outfit como las lleva el maniquí. */
function useDressed(outfit: Outfit) {
  return useMemo(() => outfit.items.map((i) => ({ ...i.wardrobeItem, styling: i.styling })), [outfit.items]);
}

/** Pegatina del estilo del outfit. */
export function StyleSticker({ style, className = '' }: { style: OutfitStyle | null | undefined; className?: string }) {
  if (!style) return null;
  const meta = OUTFIT_STYLES[style];
  return (
    <span
      className={`style-sticker ${className}`}
      style={{ '--c': meta.color, '--ink': meta.ink, '--tilt': `${stickerTilt(style)}deg` } as CSSProperties}
    >
      {meta.label}
    </span>
  );
}

/**
 * Ficha de un outfit: el maniquí entero girando al pasar el ratón, la
 * pegatina del estilo, sus prendas, la fecha y las acciones (favorito,
 * editar, duplicar, eliminar). Se inclina un poco siguiendo al ratón.
 */
function FitCard({
  outfit,
  index,
  stagger,
  fresh,
  leaving,
  busy,
  comparing,
  picked,
  onPick,
  onFavorite,
  onDuplicate,
  onDelete,
}: {
  outfit: Outfit;
  index: number;
  stagger: number;
  fresh: boolean;
  leaving: boolean;
  busy: boolean;
  comparing: boolean;
  picked: boolean;
  onPick: () => void;
  onFavorite: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [active, setActive] = useState(false);
  const navigate = useNavigate();
  const { shape } = useBodyShape();
  const garments = useDressed(outfit);
  const tilt = useTilt<HTMLElement>(4);
  const [burst, setBurst] = useState(0);
  const open = () => (comparing ? onPick() : navigate(`/outfits/${outfit.id}`));
  const shown = garments.slice(0, 4);
  const wishCount = outfit.items.filter((e) => e.wardrobeItem.wishlistStatus).length;
  const meta = [outfit.occasion, outfit.season ? SEASON_LABEL[outfit.season] : null].filter(Boolean).join(' · ');
  const accent = outfit.style ? OUTFIT_STYLES[outfit.style].color : undefined;

  return (
    <article
      ref={tilt.ref}
      className={`fit-card${fresh ? ' is-fresh' : ''}${leaving ? ' is-leaving' : ''}${outfit.isFavorite ? ' is-fav' : ''}${picked ? ' is-picked' : ''}`}
      style={{ '--i': stagger, ...(accent ? { '--accent': accent } : {}) } as CSSProperties}
      onPointerMove={tilt.onPointerMove}
      onPointerLeave={(e) => {
        tilt.onPointerLeave();
        if (e.pointerType === 'mouse') setActive(false);
      }}
      onPointerEnter={() => setActive(true)}
    >
      <div
        className="fit-stage"
        role="link"
        tabIndex={0}
        aria-label={comparing ? t('{v} la comparativa: {name}', { v: picked ? t('Quitar de') : t('Añadir a'), name: outfit.name }) : t('Abrir {name}', { name: outfit.name })}
        onClick={open}
        onKeyDown={(e) => e.key === 'Enter' && open()}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
      >
        <span className="fit-floor" aria-hidden="true" />
        <OutfitView className="tile-view" garments={garments} shape={shape} active={active} distance={OUTFIT_TILE_DISTANCE} />
        <span className="fit-no" aria-hidden="true">
          #{String(index + 1).padStart(2, '0')}
        </span>
        <StyleSticker style={outfit.style} className="fit-sticker" />
        {outfit.hiddenByAdmin ? (
          <span className="fit-flag is-warn" title={t('Un admin lo ha ocultado de tu perfil por una denuncia')}>
            {t('Oculto por moderación')}
          </span>
        ) : (
          outfit.isShared && <span className="fit-flag">{t('En tu perfil')}</span>
        )}
        {wishCount > 0 && (
          <span className="fit-wish" title={t('Lleva prendas de tu wishlist que todavía no tienes')}>
            <Icon name="heart" size={11} /> {t('{wishCount} por comprar', { wishCount })}
          </span>
        )}
      </div>

      <div className="fit-body">
        <div className="fit-head">
          <h2 className="fit-name" title={outfit.name}>
            {outfit.name}
          </h2>
          <ScoreRing value={outfit.ratingScore} />
          <button
            type="button"
            className={`fav-btn${outfit.isFavorite ? ' is-on' : ''}`}
            aria-pressed={!!outfit.isFavorite}
            aria-label={outfit.isFavorite ? t('Quitar de favoritos') : t('Marcar como favorito')}
            title={outfit.isFavorite ? t('Quitar de favoritos') : t('Favorito')}
            onClick={() => {
              if (!outfit.isFavorite) setBurst((b) => b + 1);
              onFavorite();
            }}
          >
            <Icon name="star" size={18} />
            {burst > 0 && <span key={burst} className="fav-burst" aria-hidden="true" />}
          </button>
        </div>
        <p className="fit-meta">
          <time dateTime={outfit.createdAt}>{formatDate(outfit.createdAt)}</time>
          {meta && <span> · {meta}</span>}
        </p>

        <ul className="fit-pieces" aria-label={plural(garments.length, t('prenda'), t('prendas'))}>
          {shown.map((g) => (
            <li key={g.id} className={g.wishlistStatus ? 'is-wish' : undefined} title={`${g.name} · ${g.garmentType.name}${g.wishlistStatus ? t(' · de tu wishlist') : ''}`}>
              <span className="piece-swatch" style={{ background: g.color }} aria-hidden="true">
                <Icon name={SLOT_BY_ID[slotOf(g)].icon} size={11} />
              </span>
              <span className="piece-name">{g.name}</span>
            </li>
          ))}
          {garments.length > shown.length && <li className="piece-more">+{garments.length - shown.length}</li>}
        </ul>

        {comparing ? (
          <div className="fit-actions is-compare">
            <button type="button" className={`fit-act fit-pick${picked ? ' is-on' : ''}`} aria-pressed={picked} onClick={onPick}>
              <Icon name={picked ? 'check' : 'plus'} size={14} /> {picked ? t('Elegido') : t('Elegir para comparar')}
            </button>
          </div>
        ) : (
        <div className="fit-actions">
          <button type="button" className="fit-act" onClick={open}>
            <Icon name="edit" size={14} /> {t('Editar')}
          </button>
          <button type="button" className="fit-act" onClick={onDuplicate} disabled={busy}>
            <Icon name="copy" size={14} /> {busy ? t('Copiando…') : t('Duplicar')}
          </button>
          <button type="button" className="fit-act is-danger" onClick={onDelete} aria-label={t('Eliminar {name}', { name: outfit.name })}>
            <Icon name="trash" size={14} />
          </button>
        </div>
        )}
      </div>
    </article>
  );
}

/**
 * «Fit del día»: un outfit destacado bajo los focos (uno de tus favoritos,
 * distinto cada día). Las flechas pasan al siguiente.
 */
function Spotlight({ outfits, favorites }: { outfits: Outfit[]; favorites: boolean }) {
  const day = Math.floor(Date.now() / 86_400_000);
  const [at, setAt] = useState(() => day % outfits.length);
  const { shape } = useBodyShape();
  const navigate = useNavigate();
  const index = at % outfits.length;
  const o = outfits[index];
  const garments = useDressed(o);

  const go = (d: number) => {
    play('swoosh');
    setAt((a) => (a + d + outfits.length) % outfits.length);
  };

  return (
    <section className="spotlight" aria-label={t('Outfit destacado')}>
      <div className="spot-stage">
        <span className="spot-beam" aria-hidden="true" />
        <OutfitView key={o.id} className="tile-view" garments={garments} shape={shape} active distance={3.6} speed={0.45} />
      </div>
      <div key={o.id} className="spot-info">
        <span className="spot-label">{favorites ? t('Fit del día · de tus favoritos') : t('Lo último que has montado')}</span>
        <h2 className="spot-name">{o.name}</h2>
        <div className="spot-tags">
          {typeof o.ratingScore === 'number' && (
            <>
              <ScoreRing value={o.ratingScore} size={46} />
              <TierBadge score={o.ratingScore} />
            </>
          )}
          <StyleSticker style={o.style} />
          {o.occasion && <span className="status-tag">{o.occasion}</span>}
          {o.season && <span className="status-tag">{SEASON_LABEL[o.season]}</span>}
        </div>
        <ul className="spot-pieces">
          {garments.slice(0, 6).map((g) => (
            <li key={g.id}>
              <span className="piece-swatch" style={{ background: g.color }} aria-hidden="true">
                <Icon name={SLOT_BY_ID[slotOf(g)].icon} size={11} />
              </span>
              {g.name}
            </li>
          ))}
        </ul>
        <div className="spot-actions">
          <button type="button" className="btn wd-add" onClick={() => navigate(`/outfits/${o.id}`)}>
            {t('Entrar al vestidor')} <Icon name="forward" size={14} />
          </button>
          {outfits.length > 1 && (
            <span className="spot-nav">
              <button type="button" className="icon-btn" onClick={() => go(-1)} aria-label={t('Anterior')}>
                <Icon name="back" />
              </button>
              <span className="spot-count">
                {index + 1}/{outfits.length}
              </span>
              <button type="button" className="icon-btn" onClick={() => go(1)} aria-label={t('Siguiente')}>
                <Icon name="forward" />
              </button>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/** Ficha sencilla (inicio): el maniquí vestido y el nombre. */
export function OutfitCard({ outfit, index = 0, distance }: { outfit: Outfit; index?: number; distance?: number }) {
  const [active, setActive] = useState(false);
  const navigate = useNavigate();
  const { shape } = useBodyShape();
  const garments = useDressed(outfit);
  const meta = [outfit.occasion, outfit.season ? SEASON_LABEL[outfit.season] : null, plural(garments.length, t('prenda'), t('prendas'))]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      className="tile tile-outfit tile-in"
      style={{ '--i': index } as CSSProperties}
      role="link"
      tabIndex={0}
      aria-label={`${outfit.name}. ${meta}`}
      onClick={() => navigate(`/outfits/${outfit.id}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/outfits/${outfit.id}`)}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div className="tile-stage">
        <OutfitView className="tile-view" garments={garments} shape={shape} active={active} distance={distance} />
      </div>
      <div className="tile-caption">
        <span className="tile-name">{outfit.name}</span>
        {outfit.hiddenByAdmin ? (
          <span className="tile-badge is-warn" title={t('Un admin lo ha ocultado de tu perfil por una denuncia')}>
            {t('Oculto por moderación')}
          </span>
        ) : (
          outfit.isShared && <span className="tile-badge">{t('En tu perfil')}</span>
        )}
      </div>
      <span className="tile-meta">{meta}</span>
    </div>
  );
}
