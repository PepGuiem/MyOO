import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { itemsApi, wardrobesApi } from '../api/endpoints';
import type { ColorGroup, GarmentCategory, ItemSort, Season, WardrobeItem } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { ConfirmDialog } from '../components/fx/ConfirmDialog';
import { useToast } from '../components/fx/Toast';
import { Icon, type IconName } from '../components/Icon';
import { InfiniteSentinel } from '../components/InfiniteSentinel';
import { ItemEditor } from '../components/ItemEditor';
import { useAppData } from '../components/Layout';
import { Select } from '../components/Select';
import { CountUp } from '../components/street/Street';
import { GarmentCard, GarmentCardSkeletons, type WardrobeView } from '../components/wardrobe/GarmentCard';
import { GarmentDetail } from '../components/wardrobe/GarmentDetail';
import { t } from '../i18n';
import { COLOR_GROUP, COLOR_GROUPS } from '../lib/colors';
import { relativeDay, toKey } from '../lib/dates';
import { CATEGORY_FILTERS, CATEGORY_LABEL, SEASONS, SEASON_LABEL } from '../lib/labels';
import { useAsync } from '../lib/useAsync';
import { usePagedList } from '../lib/usePagedList';

const PAGE_SIZE = 24;

/** Acciones de una ficha del armario (ver handlersFor). */
interface CardHandlers {
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFavorite: (on: boolean) => void;
}
const VIEW_KEY = 'myout.wardrobe.view';
const VIEWS: { value: WardrobeView; label: string; icon: IconName }[] = [
  { value: 'grid', label: t('Cuadrícula'), icon: 'grid' },
  { value: 'compact', label: t('Compacta'), icon: 'gridSmall' },
  { value: 'catalog', label: t('Catálogo'), icon: 'rows' },
];
const SORTS: { value: ItemSort; label: string }[] = [
  { value: 'newest', label: t('Más recientes') },
  { value: 'oldest', label: t('Más antiguas') },
  { value: 'name', label: t('Nombre (A-Z)') },
  { value: 'favorites', label: t('Favoritas primero') },
];
const CATEGORY_ICON: Record<string, IconName> = {
  ALL: 'hanger',
  TOP: 'tshirt',
  BOTTOM: 'pants',
  FULL_BODY: 'dress',
  OUTERWEAR: 'jacket',
  FOOTWEAR: 'shoe',
  ACCESSORY: 'cap',
};
/** Claves de la URL de los filtros «avanzados» (además de categoría y armario). */
const EXTRA_FILTERS = ['color', 'brand', 'season', 'type', 'fav'] as const;

function readView(): WardrobeView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === 'grid' || v === 'compact' || v === 'catalog') return v;
  } catch {
    /* sin almacenamiento: vista por defecto */
  }
  return 'grid';
}

export function WardrobePage() {
  const { wardrobes, garmentTypes, reloadWardrobes } = useAppData();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  // --- Filtros (en la URL, para poder volver atrás o compartir el enlace) ---
  const wardrobeId = params.get('w') ?? undefined;
  const category = (params.get('cat') as GarmentCategory | null) ?? undefined;
  const colorParam = params.get('color');
  const color = colorParam && (COLOR_GROUPS as string[]).includes(colorParam) ? (colorParam as ColorGroup) : undefined;
  const brand = params.get('brand') || undefined;
  const seasonParam = params.get('season');
  const season = seasonParam && (SEASONS as string[]).includes(seasonParam) ? (seasonParam as Season) : undefined;
  const typeId = params.get('type') || undefined;
  const favOnly = params.get('fav') === '1';
  const sortParam = params.get('sort');
  const sort: ItemSort = SORTS.some((s) => s.value === sortParam) ? (sortParam as ItemSort) : 'newest';
  const wardrobe = wardrobes.find((w) => w.id === wardrobeId);

  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<WardrobeItem | 'new' | null>(null);
  const [detail, setDetail] = useState<WardrobeItem | null>(null);
  const [deleting, setDeleting] = useState<WardrobeItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [view, setViewState] = useState<WardrobeView>(readView);
  const extraCount = EXTRA_FILTERS.filter((k) => params.get(k)).length;
  const [showFilters, setShowFilters] = useState(extraCount > 0);

  function setView(v: WardrobeView) {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* sin almacenamiento: solo para esta visita */
    }
  }

  // Retrasamos la búsqueda 250 ms para no lanzar una petición por tecla.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Scroll infinito: 24 prendas por tanda; la siguiente llega al acercarse al final.
  const list = usePagedList(
    (page) =>
      itemsApi.list({
        wardrobeId,
        category,
        search: query || undefined,
        color,
        brand,
        season,
        garmentTypeId: typeId,
        favorite: favOnly || undefined,
        sort,
        page,
        pageSize: PAGE_SIZE,
      }),
    [wardrobeId, category, query, color, brand, season, typeId, favOnly, sort],
  );
  const { items, total, loading, error } = list;

  // Resumen real del armario (barra de información y valores de los filtros).
  const [facetsVersion, setFacetsVersion] = useState(0);
  const facets = useAsync(() => itemsApi.facets(wardrobeId), [wardrobeId, facetsVersion]);
  const f = facets.data;

  // Al cambiar de filtro, las fichas anteriores se desvanecen mientras llegan las nuevas.
  const previous = useRef<WardrobeItem[]>([]);
  useEffect(() => {
    if (items.length) previous.current = items;
  }, [items]);
  const leaving = items.length === 0 && loading && previous.current.length > 0;
  const shown = leaving ? previous.current : items;

  // Desde el inicio, «Añadir prenda» llega con ?nueva=1: abrimos el editor.
  useEffect(() => {
    if (params.get('nueva') !== '1' || garmentTypes.length === 0) return;
    setEditing('new');
    const next = new URLSearchParams(params);
    next.delete('nueva');
    setParams(next, { replace: true });
  }, [params, setParams, garmentTypes.length]);

  function setFilter(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // Un tipo de prenda de otra categoría ya no tiene sentido.
    if (key === 'cat') next.delete('type');
    setParams(next);
  }

  function clearFilters() {
    const next = new URLSearchParams();
    if (wardrobeId) next.set('w', wardrobeId);
    if (params.get('sort')) next.set('sort', params.get('sort')!);
    setParams(next);
    setSearch('');
  }

  const refreshFacets = useCallback(() => setFacetsVersion((v) => v + 1), []);

  function refreshAfterChange() {
    void reloadWardrobes();
    list.reload();
    refreshFacets();
  }

  /** Cambia una prenda en la lista y en la ficha abierta. */
  function patchItem(id: string, patch: Partial<WardrobeItem>) {
    list.setItems((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setDetail((d) => (d && d.id === id ? { ...d, ...patch } : d));
  }

  async function toggleFavorite(item: WardrobeItem, on: boolean) {
    patchItem(item.id, { isFavorite: on });
    facets.setData((prev) => (prev ? { ...prev, favorites: Math.max(0, prev.favorites + (on ? 1 : -1)) } : prev));
    try {
      await itemsApi.setFavorite(item.id, on);
      if (on) toast.show(t('«{name}» en favoritas', { name: item.name }), { tone: 'ok', icon: 'heart', sound: 'pop' });
    } catch {
      patchItem(item.id, { isFavorite: !on });
      refreshFacets();
      toast.show(t('No se ha podido guardar la favorita.'), { tone: 'danger' });
    }
  }

  // Acciones de cada ficha con identidad estable (una por prenda): así las
  // fichas memorizadas no se repintan cada vez que se repinta la página.
  const cardActions = useRef({ open: setDetail, edit: setEditing, remove: setDeleting, favorite: toggleFavorite });
  cardActions.current = { open: setDetail, edit: setEditing, remove: setDeleting, favorite: toggleFavorite };
  const cardHandlers = useRef(new WeakMap<WardrobeItem, CardHandlers>());
  function handlersFor(item: WardrobeItem): CardHandlers {
    let h = cardHandlers.current.get(item);
    if (!h) {
      h = {
        onOpen: () => cardActions.current.open(item),
        onEdit: () => cardActions.current.edit(item),
        onDelete: () => cardActions.current.remove(item),
        onFavorite: (on: boolean) => void cardActions.current.favorite(item, on),
      };
      cardHandlers.current.set(item, h);
    }
    return h;
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await itemsApi.remove(deleting.id);
      const gone = deleting;
      list.setItems((l) => l.filter((x) => x.id !== gone.id));
      list.setTotal((n) => Math.max(0, n - 1));
      setDetail((d) => (d?.id === gone.id ? null : d));
      setDeleting(null);
      refreshFacets();
      void reloadWardrobes();
      toast.show(t('«{name}» eliminada', { name: gone.name }), { tone: 'info', icon: 'trash' });
    } catch (err) {
      toast.show(err instanceof Error ? err.message : t('No se ha podido eliminar.'), { tone: 'danger' });
    } finally {
      setDeleteBusy(false);
    }
  }

  async function openLast() {
    if (!f?.lastAdded) return;
    const local = items.find((x) => x.id === f.lastAdded!.id);
    if (local) return setDetail(local);
    try {
      setDetail(await itemsApi.get(f.lastAdded.id));
    } catch {
      /* si ya no existe, no pasa nada */
    }
  }

  const typeOptions = useMemo(
    () => (f?.garmentTypes ?? []).filter((g) => !category || g.category === category),
    [f?.garmentTypes, category],
  );

  if (wardrobes.length === 0 && !loading) {
    return <FirstWardrobe onCreated={reloadWardrobes} />;
  }

  const title = wardrobe?.name ?? t('Todo el armario');
  const anyFilter = !!(category || query || extraCount);
  const wardrobeEmpty = f?.total === 0 && !anyFilter;
  const activePills: { key: string; label: string; swatch?: string }[] = [
    ...(color ? [{ key: 'color', label: COLOR_GROUP[color].label, swatch: COLOR_GROUP[color].swatch }] : []),
    ...(brand ? [{ key: 'brand', label: brand }] : []),
    ...(season ? [{ key: 'season', label: SEASON_LABEL[season] }] : []),
    ...(typeId ? [{ key: 'type', label: f?.garmentTypes.find((g) => g.id === typeId)?.name ?? t('Tipo de prenda') }] : []),
    ...(favOnly ? [{ key: 'fav', label: t('Favoritas') }] : []),
  ];

  return (
    <section className="page wd">
      <header className="wd-head">
        <div className="wd-head-main">
          <span className="wd-kicker">
            <Icon name="hanger" size={12} /> {t('My collection')}
          </span>
          <h1 className="wd-title" data-text={title}>
            {title}
          </h1>
          {wardrobe?.description && <p className="wd-desc">{wardrobe.description}</p>}
        </div>
        <div className="wd-counter" aria-live="polite">
          <strong>{f ? <CountUp value={f.total} duration={1000} /> : '—'}</strong>
          <span>{f && f.total === 1 ? t('prenda') : t('prendas')}</span>
        </div>
        <div className="wd-head-actions">
          {wardrobe && (
            <WardrobeMenu
              id={wardrobe.id}
              name={wardrobe.name}
              onChanged={reloadWardrobes}
              onDeleted={async () => {
                await reloadWardrobes();
                navigate('/armario');
              }}
            />
          )}
          <button type="button" className="btn wd-add" onClick={() => setEditing('new')} disabled={garmentTypes.length === 0}>
            <Icon name="plus" size={15} /> <span>{t('Añadir prenda')}</span>
          </button>
        </div>
      </header>

      {f && f.total > 0 && (
        <ul className="wd-stats" aria-label={t('Resumen del armario')}>
          <li style={{ '--i': 0 } as CSSProperties}>
            <Icon name="hanger" size={16} />
            <strong>
              <CountUp value={f.total} />
            </strong>
            <span>{t('Prendas')}</span>
          </li>
          <li style={{ '--i': 1 } as CSSProperties}>
            <Icon name="grid" size={16} />
            <strong>
              <CountUp value={f.categories} />
            </strong>
            <span>{f.categories === 1 ? t('Categoría') : t('Categorías')}</span>
          </li>
          <li style={{ '--i': 2 } as CSSProperties}>
            <Icon name="heart" size={16} />
            <strong>
              <CountUp value={f.favorites} />
            </strong>
            <span>{f.favorites === 1 ? t('Favorita') : t('Favoritas')}</span>
          </li>
          {f.lastAdded && (
            <li className="wd-stats-last" style={{ '--i': 3 } as CSSProperties}>
              <Icon name="sparkles" size={16} />
              <button type="button" onClick={() => void openLast()} title={t('Ver la última prenda añadida')}>
                <strong>{f.lastAdded.name}</strong>
                <span>
                  {t('Última añadida')} · {relativeDay(toKey(new Date(f.lastAdded.createdAt)))}
                </span>
              </button>
            </li>
          )}
        </ul>
      )}

      {!wardrobeEmpty && (
        <div className="wd-toolbar">
          <div className="mobile-only toolbar-select">
            <Select
              ariaLabel={t('Armario')}
              value={wardrobeId ?? ''}
              options={[{ value: '', label: t('Todo el armario') }, ...wardrobes.map((w) => ({ value: w.id, label: w.name }))]}
              onChange={(v) => setFilter('w', v || null)}
            />
          </div>

          <div className="wd-tags" role="group" aria-label={t('Filtrar por categoría')}>
            {CATEGORY_FILTERS.map((c) => {
              const on = (c.value ?? undefined) === category;
              const n = f ? (c.value ? (f.byCategory[c.value] ?? 0) : f.total) : null;
              return (
                <button
                  key={c.label}
                  type="button"
                  className={`wd-tag${on ? ' is-active' : ''}`}
                  aria-pressed={on}
                  onClick={() => setFilter('cat', c.value)}
                >
                  <Icon name={CATEGORY_ICON[c.value ?? 'ALL']} size={14} />
                  <span>{c.label}</span>
                  {n !== null && <small>{n}</small>}
                </button>
              );
            })}
          </div>

          <div className="wd-controls">
            <label className="search wd-search">
              <Icon name="search" />
              <input
                type="search"
                placeholder={t('Buscar por nombre')}
                aria-label={t('Buscar prendas por nombre')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <button
              type="button"
              className={`wd-filter-btn${showFilters ? ' is-open' : ''}${extraCount ? ' has-active' : ''}`}
              aria-expanded={showFilters}
              aria-controls="wd-filters"
              onClick={() => setShowFilters((v) => !v)}
            >
              <Icon name="filter" size={14} /> <span>{t('Filtros')}</span>
              {extraCount > 0 && <small>{extraCount}</small>}
            </button>
            <Select size="sm" className="wd-sort" ariaLabel={t('Ordenar')} value={sort} options={SORTS} onChange={(v) => setFilter('sort', v === 'newest' ? null : v)} />
            <div className="wd-views" role="radiogroup" aria-label={t('Vista')}>
              {VIEWS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  role="radio"
                  aria-checked={view === v.value}
                  className={view === v.value ? 'is-active' : undefined}
                  title={v.label}
                  onClick={() => setView(v.value)}
                >
                  <Icon name={v.icon} size={15} />
                  <span className="visually-hidden">{v.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div id="wd-filters" className={`wd-filters${showFilters ? ' is-open' : ''}`}>
            <div>
              <div className="wd-filter-grid">
                <div className="wd-filter wd-filter-colors">
                  <span className="wd-filter-label">{t('Color')}</span>
                  <div className="wd-swatches">
                    {(f?.colors ?? []).map((c) => {
                      const on = color === c.value;
                      return (
                        <button
                          key={c.value}
                          type="button"
                          className={`wd-swatch-btn${on ? ' is-active' : ''}`}
                          style={{ '--c': COLOR_GROUP[c.value].swatch } as CSSProperties}
                          aria-pressed={on}
                          title={`${COLOR_GROUP[c.value].label} (${c.count})`}
                          onClick={() => setFilter('color', on ? null : c.value)}
                        >
                          <span className="visually-hidden">{COLOR_GROUP[c.value].label}</span>
                        </button>
                      );
                    })}
                    {f && f.colors.length === 0 && <small className="muted">{t('Sin prendas todavía')}</small>}
                  </div>
                </div>
                <div className="wd-filter">
                  <span className="wd-filter-label">{t('Marca')}</span>
                  <Select
                    size="sm"
                    ariaLabel={t('Marca')}
                    value={brand ?? ''}
                    disabled={!f || f.brands.length === 0}
                    options={[
                      { value: '', label: f && f.brands.length === 0 ? t('Ninguna prenda tiene marca') : t('Todas las marcas') },
                      ...(f?.brands ?? []).map((b) => ({ value: b.value, label: `${b.value} (${b.count})` })),
                    ]}
                    onChange={(v) => setFilter('brand', v || null)}
                  />
                </div>
                <div className="wd-filter">
                  <span className="wd-filter-label">{t('Temporada')}</span>
                  <Select
                    size="sm"
                    ariaLabel={t('Temporada')}
                    value={season ?? ''}
                    options={[
                      { value: '', label: t('Todas las temporadas') },
                      ...(f?.seasons ?? []).map((s) => ({ value: s.value, label: `${SEASON_LABEL[s.value]} (${s.count})` })),
                    ]}
                    onChange={(v) => setFilter('season', v || null)}
                  />
                </div>
                <div className="wd-filter">
                  <span className="wd-filter-label">{t('Tipo de prenda')}</span>
                  <Select
                    size="sm"
                    ariaLabel={t('Tipo de prenda')}
                    value={typeId ?? ''}
                    options={[
                      { value: '', label: t('Todos los tipos') },
                      ...typeOptions.map((g) => ({ value: g.id, label: `${g.name} (${g.count})`, group: CATEGORY_LABEL[g.category] })),
                    ]}
                    onChange={(v) => setFilter('type', v || null)}
                  />
                </div>
                <div className="wd-filter">
                  <span className="wd-filter-label">{t('Favoritas')}</span>
                  <button type="button" className={`wd-fav-filter${favOnly ? ' is-active' : ''}`} aria-pressed={favOnly} onClick={() => setFilter('fav', favOnly ? null : '1')}>
                    <Icon name="heart" size={14} /> {t('Solo favoritas')}
                    {f && <small>{f.favorites}</small>}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {(activePills.length > 0 || query || category) && (
            <div className="wd-pills" aria-label={t('Filtros activos')}>
              {category && (
                <button type="button" className="wd-pill" onClick={() => setFilter('cat', null)}>
                  {CATEGORY_LABEL[category]} <Icon name="close" size={11} />
                </button>
              )}
              {activePills.map((p) => (
                <button key={p.key} type="button" className="wd-pill" onClick={() => setFilter(p.key, null)}>
                  {p.swatch && <span className="wd-swatch" style={{ background: p.swatch }} aria-hidden="true" />}
                  {p.label} <Icon name="close" size={11} />
                </button>
              ))}
              {query && (
                <button type="button" className="wd-pill" onClick={() => setSearch('')}>
                  «{query}» <Icon name="close" size={11} />
                </button>
              )}
              <button type="button" className="wd-clear" onClick={clearFilters}>
                {t('Limpiar filtros')}
              </button>
              <span className="wd-results">{loading ? t('Buscando…') : t('{n} resultados', { n: total })}</span>
            </div>
          )}
        </div>
      )}

      {items.length === 0 && !leaving && <ErrorNote error={error} />}

      {wardrobeEmpty ? (
        <WardrobeEmpty onAdd={() => setEditing('new')} disabled={garmentTypes.length === 0} />
      ) : items.length === 0 && !loading && !error ? (
        <div className="wd-nomatch">
          <Icon name="search" size={28} />
          <h2>{t('Nada por aquí')}</h2>
          <p className="muted">{t('Ninguna prenda coincide con estos filtros.')}</p>
          <button type="button" className="btn wd-btn-line" onClick={clearFilters}>
            {t('Limpiar filtros')}
          </button>
        </div>
      ) : (
        <div className={`wd-grid view-${view}${leaving ? ' is-leaving' : ''}`} aria-busy={loading && items.length === 0}>
          {loading && shown.length === 0 && <GarmentCardSkeletons count={view === 'compact' ? 12 : 8} />}
          {shown.map((item, i) => (
            <GarmentCard
              key={item.id}
              item={item}
              index={i % PAGE_SIZE}
              view={view}
              {...handlersFor(item)}
            />
          ))}
        </div>
      )}

      {!wardrobeEmpty && (
        <InfiniteSentinel
          hasMore={list.hasMore}
          loading={loading}
          error={items.length > 0 ? error : null}
          onMore={list.loadMore}
          count={items.length}
          endLabel={total > PAGE_SIZE ? t('Ya están las {total} prendas.', { total }) : undefined}
        />
      )}

      {detail && (
        <GarmentDetail
          item={detail}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setDetail(null);
            setEditing(detail);
          }}
          onDelete={() => setDeleting(detail)}
          onFavorite={(on) => void toggleFavorite(detail, on)}
          onAddToOutfit={() => navigate(`/outfits/new?with=${encodeURIComponent(detail.id)}`)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('¿Eliminar «{name}»?', { name: deleting.name })}
          confirmLabel={t('Eliminar')}
          danger
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onClose={() => setDeleting(null)}
        >
          {t('Se quitará de tu armario y de los outfits donde aparezca. No se puede deshacer.')}
        </ConfirmDialog>
      )}

      {editing && (
        <ItemEditor
          item={editing === 'new' ? undefined : editing}
          wardrobes={wardrobes}
          garmentTypes={garmentTypes}
          defaultWardrobeId={wardrobeId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refreshAfterChange();
          }}
          onDeleted={() => {
            setEditing(null);
            refreshAfterChange();
          }}
        />
      )}
    </section>
  );
}

/** Armario sin prendas: composición de prendas flotando y una llamada clara. */
function WardrobeEmpty({ onAdd, disabled }: { onAdd: () => void; disabled: boolean }) {
  const pieces: { icon: IconName; x: number; y: number; r: number; d: number }[] = [
    { icon: 'hoodie', x: 14, y: 22, r: -12, d: 0 },
    { icon: 'cap', x: 78, y: 16, r: 14, d: 0.6 },
    { icon: 'shoe', x: 84, y: 66, r: -8, d: 1.2 },
    { icon: 'pants', x: 10, y: 70, r: 10, d: 0.3 },
    { icon: 'jacket', x: 60, y: 82, r: 6, d: 0.9 },
    { icon: 'tshirt', x: 34, y: 86, r: -6, d: 1.5 },
  ];
  return (
    <div className="wd-empty">
      <div className="wd-empty-art" aria-hidden="true">
        <span className="wd-empty-ring" />
        <span className="wd-empty-rail" />
        <span className="wd-empty-hanger">
          <Icon name="hanger" size={88} />
        </span>
        {pieces.map((p, i) => (
          <span
            key={i}
            className="wd-empty-piece"
            style={{ left: `${p.x}%`, top: `${p.y}%`, '--r': `${p.r}deg`, '--d': `${p.d}s` } as CSSProperties}
          >
            <Icon name={p.icon} size={30} />
          </span>
        ))}
      </div>
      <span className="wd-kicker">
        <Icon name="sparkles" size={12} /> {t('My collection')}
      </span>
      <h2 className="wd-empty-title">{t('Tu armario está esperando')}</h2>
      <p className="muted">{t('Añade tu primera prenda: la verás en 3D, podrás combinarla en outfits y llevar la cuenta de todo lo que tienes.')}</p>
      <button type="button" className="btn wd-add wd-add-big" onClick={onAdd} disabled={disabled}>
        <Icon name="plus" size={16} /> <span>{t('Añadir mi primera prenda')}</span>
      </button>
    </div>
  );
}

function WardrobeMenu({
  id,
  name,
  onChanged,
  onDeleted,
}: {
  id: string;
  name: string;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'idle' | 'rename' | 'delete'>('idle');
  const [value, setValue] = useState(name);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setMode('idle');
    setValue(name);
    setError(null);
  }, [id, name]);

  async function rename(e: FormEvent) {
    e.preventDefault();
    try {
      await wardrobesApi.update(id, { name: value.trim() });
      await onChanged();
      setMode('idle');
    } catch (err) {
      setError(err);
    }
  }

  async function remove() {
    try {
      await wardrobesApi.remove(id);
      await onDeleted();
    } catch (err) {
      setError(err);
    }
  }

  if (mode === 'rename') {
    return (
      <form className="inline-form" onSubmit={rename}>
        <input autoFocus value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} aria-label={t('Nuevo nombre')} />
        <button type="submit" className="btn">{t('Guardar')}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setMode('idle')}>{t('Cancelar')}</button>
        <ErrorNote error={error} />
      </form>
    );
  }
  if (mode === 'delete') {
    return (
      <div className="inline-form">
        <span className="muted">{t('Se borrarán también sus prendas.')}</span>
        <button type="button" className="btn btn-danger" onClick={remove}>{t('Eliminar armario')}</button>
        <button type="button" className="btn btn-ghost" onClick={() => setMode('idle')}>{t('Cancelar')}</button>
        <ErrorNote error={error} />
      </div>
    );
  }
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setMode('rename')}>{t('Renombrar')}</button>
      <button type="button" className="btn btn-ghost" onClick={() => setMode('delete')}>{t('Eliminar')}</button>
    </>
  );
}

export function FirstWardrobe({ onCreated, embedded = false }: { onCreated: () => Promise<void>; embedded?: boolean }) {
  const [name, setName] = useState(t('Armario principal'));
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await wardrobesApi.create({ name: name.trim() });
      await onCreated();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section className={embedded ? 'first-run first-run-embedded' : 'page first-run'}>
      {embedded ? <h2>{t('Empieza por un armario')}</h2> : <h1>{t('Empieza por un armario')}</h1>}
      <p className="muted">{t('Un armario agrupa prendas: el de casa, una maleta, la ropa de deporte.')}</p>
      <form className="inline-form" onSubmit={submit}>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label={t('Nombre del armario')} />
        <button type="submit" className="btn btn-primary">{t('Crear armario')}</button>
      </form>
      <ErrorNote error={error} />
    </section>
  );
}
