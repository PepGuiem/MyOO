import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { sneakersApi } from '../api/endpoints';
import type { Sneaker, SneakerBrand, SneakerCondition, SneakerStats, WardrobeItem } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { NeonScene } from '../components/fx/NeonScene';
import { SoundToggle } from '../components/fx/SoundToggle';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { useAppData } from '../components/Layout';
import { Select } from '../components/Select';
import { SneakerCard } from '../components/sneakers/SneakerCard';
import { SneakerDashboard } from '../components/sneakers/SneakerDashboard';
import { SneakerForm, type SneakerFormMode } from '../components/sneakers/SneakerForm';
import { CountUp } from '../components/street/Street';
import { play } from '../lib/sfx';
import { BRAND_LABEL, CONDITION, SNEAKER_BRANDS, SNEAKER_CONDITIONS, SNEAKER_SORTS, sortSizes, sortSneakers, type SneakerSort } from '../lib/sneakers';

type Tab = 'owned' | 'wish' | 'stats';

/**
 * SNEAKER COLLECTION: tu colección de zapatillas como una galería, la
 * wishlist de sneakers (separada) y un dashboard. Cada par es una prenda de
 * tu armario con su ficha, así que también sirve para outfits.
 */
export function SneakersPage() {
  const { garmentTypes, reloadWardrobes } = useAppData();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('owned');
  const [owned, setOwned] = useState<Sneaker[] | null>(null);
  const [wish, setWish] = useState<Sneaker[] | null>(null);
  const [stats, setStats] = useState<SneakerStats | null>(null);
  const [candidates, setCandidates] = useState<WardrobeItem[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [form, setForm] = useState<SneakerFormMode | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  // Filtros
  const [brand, setBrand] = useState<SneakerBrand | null>(null);
  const [size, setSize] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [condition, setCondition] = useState<SneakerCondition | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SneakerSort>('new');

  const loadStats = useCallback(() => {
    sneakersApi
      .stats()
      .then(setStats)
      .catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    Promise.all([sneakersApi.listAll('owned'), sneakersApi.listAll('wish'), sneakersApi.stats(), sneakersApi.candidates().catch(() => [])])
      .then(([o, w, s, c]) => {
        setOwned(o);
        setWish(w);
        setStats(s);
        setCandidates(c);
        setError(null);
      })
      .catch((e: unknown) => setError(e));
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const list = tab === 'wish' ? wish : owned;
  const all = list ?? [];
  // Opciones de los filtros: solo lo que hay en tu lista (con recuentos).
  const brandCount = useMemo(() => {
    const m = new Map<SneakerBrand, number>();
    for (const s of all) m.set(s.sneaker.brand, (m.get(s.sneaker.brand) ?? 0) + 1);
    return m;
  }, [all]);
  const sizes = useMemo(() => sortSizes(all.map((s) => s.size).filter((x): x is string => !!x)), [all]);
  const colors = useMemo(() => {
    const m = new Map<string, { hex: string; count: number }>();
    for (const s of all) {
      const e = m.get(s.colorName) ?? { hex: s.color, count: 0 };
      e.count++;
      m.set(s.colorName, e);
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [all]);
  const models = useMemo(() => [...new Set(all.map((s) => s.sneaker.model))].sort((a, b) => a.localeCompare(b, 'es')), [all]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      sortSneakers(
        all.filter(
          (s) =>
            (!brand || s.sneaker.brand === brand) &&
            (!size || s.size === size) &&
            (!color || s.colorName === color) &&
            (!model || s.sneaker.model === model) &&
            (!condition || s.sneaker.condition === condition) &&
            (!q || [s.sneaker.model, s.sneaker.colorway, s.sneaker.brandLabel, s.notes].some((t) => t?.toLowerCase().includes(q))),
        ),
        sort,
      ),
    [all, brand, size, color, model, condition, q, sort],
  );
  const filtered = !!(brand || size || color || model || condition || q);
  const clearFilters = () => {
    setBrand(null);
    setSize('');
    setColor(null);
    setModel('');
    setCondition(null);
    setQuery('');
  };

  function switchTab(t: Tab) {
    if (t === tab) return;
    play('click');
    clearFilters();
    setTab(t);
  }

  function onSaved(s: Sneaker, created: boolean) {
    setForm(null);
    const isWish = !!s.wishlistStatus;
    const setL = isWish ? setWish : setOwned;
    setL((prev) => (created ? [s, ...(prev ?? []).filter((x) => x.id !== s.id)] : (prev ?? []).map((x) => (x.id === s.id ? s : x))));
    setCandidates((c) => c.filter((x) => x.id !== s.id));
    if (created) {
      setFresh(s.id);
      clearFilters();
      setSort('new');
      setTab(isWish ? 'wish' : 'owned');
      void reloadWardrobes();
    }
    play(created ? 'spray' : 'success');
    toast.show(
      created ? (isWish ? `${s.sneaker.brandLabel} ${s.sneaker.model} a tu wishlist` : `${s.sneaker.brandLabel} ${s.sneaker.model} entran en tu colección`) : 'Cambios guardados',
      { tone: 'ok', icon: created ? (isWish ? 'heart' : 'shoe') : 'check' },
    );
    loadStats();
  }

  async function wear(s: Sneaker) {
    play('pop');
    try {
      const u = await sneakersApi.wear(s.id, 1);
      setOwned((prev) => (prev ?? []).map((x) => (x.id === u.id ? u : x)));
      toast.show(`+1 uso · ${u.sneaker.model} (${u.uses.total})`, {
        tone: 'info',
        icon: 'shoe',
        action: {
          label: 'Deshacer',
          run: () =>
            void sneakersApi
              .wear(s.id, -1)
              .then((d) => setOwned((prev) => (prev ?? []).map((x) => (x.id === d.id ? d : x))))
              .then(loadStats),
        },
      });
      loadStats();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'No se pudo apuntar', { tone: 'danger', sound: 'error' });
    }
  }

  const loading = !owned || !wish;

  return (
    <section className="page snk">
      <NeonScene />
      <span className="snk-spot" aria-hidden="true" />

      <header className="fits-hero snk-hero">
        <div className="fits-title">
          <span className="fits-kicker">
            <span className="rec-dot" aria-hidden="true" /> Colección personal · guardada en tu cuenta
          </span>
          <h1 className="fits-h1" data-text="Sneakers">
            Sneakers
          </h1>
          <p className="fits-sub">Tu colección, lo que te falta y con qué lo combinas.</p>
        </div>

        <dl className="fits-stats">
          <div>
            <dt>Pares</dt>
            <dd>{owned ? <CountUp value={owned.length} /> : '—'}</dd>
          </div>
          <div>
            <dt>Usos</dt>
            <dd>{stats ? <CountUp value={stats.totalUses} delay={120} /> : '—'}</dd>
          </div>
          <div>
            <dt>Quiero</dt>
            <dd>{wish ? <CountUp value={wish.length} delay={240} /> : '—'}</dd>
          </div>
        </dl>

        <div className="fits-actions snk-actions-top">
          <SoundToggle />
          <button
            type="button"
            className="btn btn-street btn-ghost"
            onClick={() => {
              play('click');
              setForm({ kind: 'create', scope: 'wish' });
            }}
          >
            <Icon name="heart" size={14} /> Quiero unas
          </button>
          <button
            type="button"
            className="btn btn-primary btn-street btn-new"
            onClick={() => {
              play('spray');
              setForm({ kind: 'create', scope: 'owned' });
            }}
          >
            <Icon name="plus" size={16} /> Añadir par
          </button>
        </div>
      </header>

      <div className="snk-tabs" role="tablist" aria-label="Sección">
        {(
          [
            ['owned', 'Mi colección', 'shoe', owned?.length],
            ['wish', 'Quiero conseguir', 'heart', wish?.length],
            ['stats', 'Dashboard', 'pulse', undefined],
          ] as const
        ).map(([k, label, icon, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`snk-tab is-${k}`} onClick={() => switchTab(k)}>
            <Icon name={icon} size={15} /> {label}
            {n !== undefined && <span className="count">{n}</span>}
          </button>
        ))}
      </div>

      <ErrorNote error={error} />

      {tab === 'stats' ? (
        stats ? (
          <SneakerDashboard stats={stats} />
        ) : (
          !error && <SprayLoader label="Contando tus pares…" />
        )
      ) : (
        <>
          {tab === 'owned' && candidates.length > 0 && (
            <aside className="snk-adopt" aria-label="Zapatillas de tu armario sin ficha">
              <p>
                <Icon name="hanger" size={15} /> Tienes{' '}
                <b>
                  {candidates.length} {candidates.length === 1 ? 'par' : 'pares'}
                </b>{' '}
                en tu armario sin ficha de colección. Añádeles marca y modelo (no se duplican):
              </p>
              <ul>
                {candidates.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="snk-adopt-chip"
                      style={{ '--sw': c.color } as CSSProperties}
                      onClick={() => {
                        play('click');
                        setForm({ kind: 'adopt', item: c });
                      }}
                    >
                      <i className="snk-swatch" aria-hidden="true" /> {c.name}
                      {c.size && <small> · {c.size}</small>}
                      <Icon name="plus" size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          {all.length > 0 && (
            <div className="fits-filters snk-filters" role="search">
              <div className="snk-brand-rail" role="group" aria-label="Marca">
                <button
                  type="button"
                  className={`snk-brand-tag${brand === null ? ' is-active' : ''}`}
                  aria-pressed={brand === null}
                  onClick={() => {
                    play('click');
                    setBrand(null);
                  }}
                >
                  Todas
                </button>
                {SNEAKER_BRANDS.filter((b) => brandCount.get(b)).map((b, i) => (
                  <button
                    key={b}
                    type="button"
                    className={`snk-brand-tag${brand === b ? ' is-active' : ''}`}
                    style={{ '--i': i } as CSSProperties}
                    aria-pressed={brand === b}
                    onClick={() => {
                      play('click');
                      setBrand(brand === b ? null : b);
                    }}
                  >
                    {BRAND_LABEL[b]} <span className="count">{brandCount.get(b)}</span>
                  </button>
                ))}
              </div>

              <div className="fits-row">
                <label className="fits-search">
                  <Icon name="search" />
                  <input type="search" placeholder="Buscar modelo, colorway, notas…" aria-label="Buscar zapatillas" value={query} onChange={(e) => setQuery(e.target.value)} />
                  {query && (
                    <button type="button" className="icon-btn" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </label>
                <Select
                  size="sm"
                  ariaLabel="Modelo"
                  className="snk-select"
                  value={model}
                  options={[{ value: '', label: 'Todos los modelos' }, ...models.map((m) => ({ value: m, label: m }))]}
                  onChange={setModel}
                />
                <Select
                  size="sm"
                  ariaLabel="Talla"
                  className="snk-select is-size"
                  value={size}
                  options={[{ value: '', label: 'Todas las tallas' }, ...sizes.map((s) => ({ value: s, label: `Talla ${s}` }))]}
                  onChange={setSize}
                />
                <div className="sort-pills" role="group" aria-label="Orden">
                  {SNEAKER_SORTS.filter((o) => tab === 'owned' || (o.id !== 'most' && o.id !== 'least')).map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={sort === o.id}
                      onClick={() => {
                        play('click');
                        setSort(o.id);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="fits-row snk-row2">
                <div className="snk-color-rail" role="group" aria-label="Color">
                  {colors.map(([name, c]) => (
                    <button
                      key={name}
                      type="button"
                      className={`snk-color-chip${color === name ? ' is-active' : ''}`}
                      aria-pressed={color === name}
                      title={`${name} (${c.count})`}
                      onClick={() => {
                        play('click');
                        setColor(color === name ? null : name);
                      }}
                    >
                      <i style={{ background: c.hex }} aria-hidden="true" />
                      <span className="cap">{name}</span>
                    </button>
                  ))}
                </div>
                <div className="snk-cond-rail" role="group" aria-label="Estado">
                  {SNEAKER_CONDITIONS.filter((c) => all.some((s) => s.sneaker.condition === c)).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`snk-cond-chip is-small${condition === c ? ' is-active' : ''}`}
                      aria-pressed={condition === c}
                      title={CONDITION[c].hint}
                      onClick={() => {
                        play('click');
                        setCondition(condition === c ? null : c);
                      }}
                    >
                      <span className="snk-cond-dots" aria-hidden="true">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <i key={n} className={n <= CONDITION[c].level ? 'is-on' : ''} />
                        ))}
                      </span>
                      {CONDITION[c].short}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="fits-status" aria-live="polite">
            {list && (
              <span>
                {visible.length} {visible.length === 1 ? 'par' : 'pares'}
                {tab === 'wish' && <span className="status-tag">Wishlist</span>}
                {brand && <span className="status-tag">{BRAND_LABEL[brand]}</span>}
                {model && <span className="status-tag">{model}</span>}
                {size && <span className="status-tag">Talla {size}</span>}
                {color && <span className="status-tag cap">{color}</span>}
                {condition && <span className="status-tag">{CONDITION[condition].short}</span>}
              </span>
            )}
            {filtered && (
              <button type="button" className="link-btn" onClick={clearFilters}>
                <Icon name="close" size={12} /> Quitar filtros
              </button>
            )}
          </div>

          {loading ? (
            !error && <SprayLoader label="Sacando tus zapatillas…" />
          ) : all.length === 0 ? (
            <div className="fits-empty snk-empty">
              <span className="fits-empty-tag">{tab === 'wish' ? 'Nada fichado' : 'Estantería vacía'}</span>
              <p>
                {tab === 'wish'
                  ? 'Guarda aquí los pares que quieres conseguir: marca, modelo, colorway, talla, precio y tu foto.'
                  : 'Añade tus zapatillas con tu foto, marca, modelo, colorway, talla, fecha y precio de compra. Luego podrás usarlas en tus outfits.'}
              </p>
              <button type="button" className="btn btn-primary btn-street btn-new" onClick={() => setForm({ kind: 'create', scope: tab === 'wish' ? 'wish' : 'owned' })}>
                <Icon name={tab === 'wish' ? 'heart' : 'plus'} size={16} /> {tab === 'wish' ? 'Añadir a la wishlist' : 'Añadir el primer par'}
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="fits-empty is-filtered">
              <span className="fits-empty-tag">Nada por aquí</span>
              <p>Ningún par con estos filtros.</p>
              <button type="button" className="btn btn-street" onClick={clearFilters}>
                Ver todos
              </button>
            </div>
          ) : (
            <div className={`snk-grid${tab === 'wish' ? ' is-wish' : ''}`}>
              {visible.map((s, i) => (
                <SneakerCard
                  key={s.id}
                  s={s}
                  index={Math.min(i, 14)}
                  fresh={fresh === s.id}
                  onWear={tab === 'owned' ? () => void wear(s) : undefined}
                  onEdit={() => setForm({ kind: 'edit', sneaker: s })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {form && <SneakerForm mode={form} garmentTypes={garmentTypes} onClose={() => setForm(null)} onSaved={onSaved} />}
    </section>
  );
}
