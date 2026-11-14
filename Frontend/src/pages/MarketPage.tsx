import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { itemsApi, marketApi } from '../api/endpoints';
import type { Listing, ListingKind, MarketQuery, MarketSort, MarketSummary, WardrobeItem, WishlistCategory } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { InfiniteSentinel } from '../components/InfiniteSentinel';
import { ListingCard } from '../components/market/ListingCard';
import { ListingForm, type ListingFormMode } from '../components/market/ListingForm';
import { CountUp } from '../components/street/Street';
import { LISTING_KIND, MARKET_SORTS } from '../lib/market';
import { withTransition } from '../lib/motion';
import { play } from '../lib/sfx';
import { usePagedList } from '../lib/usePagedList';
import { WISH_CATEGORIES, WISH_CATEGORY } from '../lib/wishlist';

type Scope = 'all' | 'mine' | 'favorites';

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * STREET MARKET: anuncios de la comunidad para vender o intercambiar ropa y
 * zapatillas. Sin pagos en la app: se contacta por el chat.
 */
export function MarketPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [scope, setScope] = useState<Scope>('all');
  const [category, setCategory] = useState<WishlistCategory | null>(null);
  const [kind, setKind] = useState<ListingKind | null>(null);
  const [query, setQuery] = useState('');
  const [size, setSize] = useState('');
  const [city, setCity] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sort, setSort] = useState<MarketSort>('new');
  const [summary, setSummary] = useState<MarketSummary | null>(null);
  const [form, setForm] = useState<ListingFormMode | null>(null);
  const [sellError, setSellError] = useState<unknown>(null);

  const search = useDebounced(query.trim());
  const sizeQ = useDebounced(size.trim());
  const cityQ = useDebounced(city.trim());
  const minQ = useDebounced(minPrice.trim());
  const maxQ = useDebounced(maxPrice.trim());

  const q: MarketQuery = useMemo(() => {
    const num = (s: string) => {
      const n = Number(s.replace(',', '.'));
      return s && Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    return {
      scope,
      category: category ?? undefined,
      kind: kind ?? undefined,
      search: search || undefined,
      size: sizeQ || undefined,
      city: cityQ || undefined,
      minPrice: num(minQ),
      maxPrice: num(maxQ),
      sort,
    };
  }, [scope, category, kind, search, sizeQ, cityQ, minQ, maxQ, sort]);
  const filterKey = JSON.stringify(q);

  const list = usePagedList((page) => marketApi.list({ ...q, page }), [filterKey]);
  const { items, loading, error } = list;

  const loadSummary = () => {
    marketApi
      .summary()
      .then(setSummary)
      .catch(() => undefined);
  };
  useEffect(loadSummary, []);

  // «Vender» desde el armario o la colección de sneakers: /market?sell=<id de la prenda>
  const sellId = params.get('sell');
  useEffect(() => {
    if (!sellId) return;
    let alive = true;
    itemsApi
      .get(sellId)
      .then((item: WardrobeItem) => alive && setForm({ kind: 'create', item }))
      .catch((err: unknown) => alive && setSellError(err))
      .finally(() => {
        if (!alive) return;
        params.delete('sell');
        setParams(params, { replace: true });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellId]);

  const update = (l: Listing) => list.setItems((xs) => xs.map((x) => (x.id === l.id ? l : x)));
  const filtered = !!(category || kind || search || sizeQ || cityQ || minQ || maxQ);

  return (
    <section className="page mk">
      <header className="fits-hero mk-hero">
        <div className="fits-title">
          <span className="fits-kicker">
            <span className="rec-dot" aria-hidden="true" /> Compra, vende y cambia · sin pagos en la app
          </span>
          <h1 className="fits-h1" data-text="Street Market">
            Street Market
          </h1>
          <p className="fits-sub">Ropa y zapatillas de la comunidad. Habla con quien vende por el chat y cerrad el trato vosotros.</p>
        </div>

        <dl className="fits-stats">
          <div>
            <dt>Anuncios</dt>
            <dd>{scope === 'all' && !loading ? <CountUp value={list.total} /> : '—'}</dd>
          </div>
          <div>
            <dt>Tuyos</dt>
            <dd>{summary ? <CountUp value={summary.active + summary.reserved} delay={120} /> : '—'}</dd>
          </div>
          <div>
            <dt>Guardados</dt>
            <dd>{summary ? <CountUp value={summary.favorites} delay={240} /> : '—'}</dd>
          </div>
        </dl>

        <div className="fits-actions">
          <button
            type="button"
            className="btn btn-primary btn-street btn-new"
            onClick={() => {
              play('spray');
              setForm({ kind: 'create' });
            }}
          >
            <Icon name="plus" size={16} /> Publicar anuncio
          </button>
        </div>
      </header>

      <div className="snk-tabs mk-tabs" role="tablist" aria-label="Sección">
        {(
          [
            ['all', 'Market', 'store', undefined],
            ['mine', 'Mis anuncios', 'tag', summary ? summary.active + summary.reserved + summary.sold : undefined],
            ['favorites', 'Guardados', 'heart', summary?.favorites],
          ] as const
        ).map(([k, label, icon, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={scope === k}
            className={`snk-tab is-${k}`}
            onClick={() => {
              play('click');
              withTransition(() => setScope(k));
            }}
          >
            <Icon name={icon} size={15} /> {label}
            {n !== undefined && <span className="count">{n}</span>}
          </button>
        ))}
      </div>

      <div className="fits-filters wl-filters mk-filters" role="search">
        <div className="fits-row">
          <div className="wl-status-rail" role="tablist" aria-label="Tipo">
            {([null, 'SELL', 'SWAP'] as const).map((k) => (
              <button
                key={k ?? 'all'}
                type="button"
                role="tab"
                aria-selected={kind === k}
                className="wl-tab"
                onClick={() => {
                  play('click');
                  withTransition(() => setKind(k));
                }}
              >
                {k ? (
                  <>
                    <Icon name={LISTING_KIND[k].icon} size={13} /> {LISTING_KIND[k].label}
                  </>
                ) : (
                  'Todo'
                )}
              </button>
            ))}
          </div>

          <label className="fits-search">
            <Icon name="search" />
            <input type="search" placeholder="Buscar prenda, marca…" aria-label="Buscar en el market" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button type="button" className="icon-btn" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>
                <Icon name="close" size={14} />
              </button>
            )}
          </label>

          <div className="sort-pills" role="group" aria-label="Orden">
            {MARKET_SORTS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={sort === o.id}
                onClick={() => {
                  play('click');
                  withTransition(() => setSort(o.id));
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mk-fields">
          <label>
            <span>Talla</span>
            <input value={size} maxLength={20} placeholder="M, 42…" onChange={(e) => setSize(e.target.value)} />
          </label>
          <label>
            <span>Ciudad</span>
            <input value={city} maxLength={60} placeholder="Cualquiera" onChange={(e) => setCity(e.target.value)} />
          </label>
          <label>
            <span>Precio mín.</span>
            <input inputMode="decimal" value={minPrice} placeholder="0" onChange={(e) => setMinPrice(e.target.value)} />
          </label>
          <label>
            <span>Precio máx.</span>
            <input inputMode="decimal" value={maxPrice} placeholder="Sin límite" onChange={(e) => setMaxPrice(e.target.value)} />
          </label>
          {filtered && (
            <button
              type="button"
              className="link-btn"
              onClick={() =>
                withTransition(() => {
                  setCategory(null);
                  setKind(null);
                  setQuery('');
                  setSize('');
                  setCity('');
                  setMinPrice('');
                  setMaxPrice('');
                })
              }
            >
              Quitar filtros
            </button>
          )}
        </div>

        <div className="wl-cat-rail" role="group" aria-label="Categoría">
          <button
            type="button"
            className={`wl-cat-chip${category === null ? ' is-active' : ''}`}
            aria-pressed={category === null}
            onClick={() => {
              play('click');
              withTransition(() => setCategory(null));
            }}
          >
            Todas
          </button>
          {WISH_CATEGORIES.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`wl-cat-chip${category === c ? ' is-active' : ''}`}
              style={{ '--i': i } as CSSProperties}
              aria-pressed={category === c}
              onClick={() => {
                play('click');
                withTransition(() => setCategory(category === c ? null : c));
              }}
            >
              <Icon name={WISH_CATEGORY[c].icon} size={15} /> {WISH_CATEGORY[c].label}
            </button>
          ))}
        </div>
      </div>

      <ErrorNote error={sellError} />
      {!!error && items.length === 0 && <ErrorNote error={error} />}
      {loading && items.length === 0 && !error && <SprayLoader label="Abriendo el market…" />}
      {!loading && !error && items.length === 0 && (
        <div className="empty mk-empty">
          <Icon name={scope === 'favorites' ? 'heart' : 'store'} size={34} />
          <p>
            {filtered
              ? 'Nada con esos filtros. Prueba a quitar alguno.'
              : scope === 'mine'
                ? 'Aún no has publicado nada. Usa «Vender» en una prenda o unas zapatillas, o publica a mano.'
                : scope === 'favorites'
                  ? 'Guarda anuncios con el corazón para tenerlos a mano.'
                  : 'Todavía no hay anuncios. ¡Estrena el market!'}
          </p>
        </div>
      )}

      <div key={filterKey} className="mk-grid">
        {items.map((l, i) => (
          <ListingCard key={l.id} listing={l} index={i % 24} onChange={update} />
        ))}
      </div>
      <InfiniteSentinel hasMore={list.hasMore} loading={loading} error={error} onMore={list.loadMore} count={items.length} />

      {form && (
        <ListingForm
          mode={form}
          onClose={() => setForm(null)}
          onSaved={(l, created) => {
            setForm(null);
            play('success');
            toast.show(created ? 'Anuncio publicado' : 'Anuncio guardado', { tone: 'ok' });
            loadSummary();
            navigate(`/market/${l.id}`);
          }}
        />
      )}
    </section>
  );
}
