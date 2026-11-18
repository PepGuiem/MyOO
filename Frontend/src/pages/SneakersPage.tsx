import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { sneakersApi } from '../api/endpoints';
import type { Sneaker, SneakerBrand, SneakerCondition, SneakerStats, WardrobeItem } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { SoundToggle } from '../components/fx/SoundToggle';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { useAppData } from '../components/Layout';
import { Select } from '../components/Select';
import { SneakerCard } from '../components/sneakers/SneakerCard';
import { SneakerDashboard } from '../components/sneakers/SneakerDashboard';
import { SneakerForm, type SneakerFormMode } from '../components/sneakers/SneakerForm';
import { EmptyStage, NoMatch } from '../components/street/EmptyStage';
import { SectionHead } from '../components/street/SectionHead';
import { CountUp } from '../components/street/Street';
import { play } from '../lib/sfx';
import { withTransition } from '../lib/motion';
import { BRAND_LABEL, CONDITION, SNEAKER_BRANDS, SNEAKER_CONDITIONS, SNEAKER_SORTS, sortSizes, sortSneakers, type SneakerSort } from '../lib/sneakers';
import { t, tn } from '../i18n';

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
    withTransition(() => {
      clearFilters();
      setTab(t);
    });
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
      created ? (isWish ? t('{brandLabel} {model} a tu wishlist', { brandLabel: s.sneaker.brandLabel, model: s.sneaker.model }) : t('{brandLabel} {model} entran en tu colección', { brandLabel: s.sneaker.brandLabel, model: s.sneaker.model })) : t('Cambios guardados'),
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
          label: t('Deshacer'),
          run: () =>
            void sneakersApi
              .wear(s.id, -1)
              .then((d) => setOwned((prev) => (prev ?? []).map((x) => (x.id === d.id ? d : x))))
              .then(loadStats),
        },
      });
      loadStats();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : t('No se pudo apuntar'), { tone: 'danger', sound: 'error' });
    }
  }

  const loading = !owned || !wish;

  return (
    <section className="page snk ux sk">
      <span className="snk-spot" aria-hidden="true" />

      <header className="fits-hero snk-hero ux-head">
        <div className="fits-title">
          <span className="wd-kicker">
            <Icon name="shoe" size={12} /> {t('My rotation')}
          </span>
          <h1 className="wd-title ux-title" data-text={t('Sneakers')}>
            {t('Sneakers')}
          </h1>
          <p className="ux-lede">{t('Tu colección, lo que te falta y con qué lo combinas.')}</p>
        </div>

        <div className="wd-head-actions snk-actions-top">
          <SoundToggle />
          <button
            type="button"
            className="btn wd-btn-line"
            onClick={() => {
              play('click');
              setForm({ kind: 'create', scope: 'wish' });
            }}
          >
            <Icon name="heart" size={14} /> {t('Quiero unas')}
          </button>
          <button
            type="button"
            className="btn wd-add"
            onClick={() => {
              play('spray');
              setForm({ kind: 'create', scope: 'owned' });
            }}
          >
            <Icon name="plus" size={16} /> <span>{t('Añadir par')}</span>
          </button>
        </div>
      </header>

      <ul className="wd-stats ux-stats" aria-label={t('Resumen')}>
        <li style={{ '--i': 0 } as CSSProperties}>
          <Icon name="shoe" size={16} />
          <strong>{owned ? <CountUp value={owned.length} /> : '–'}</strong>
          <span>{t('Pares')}</span>
        </li>
        <li style={{ '--i': 1 } as CSSProperties}>
          <Icon name="pulse" size={16} />
          <strong>{stats ? <CountUp value={stats.totalUses} delay={120} /> : '–'}</strong>
          <span>{t('Usos')}</span>
        </li>
        <li style={{ '--i': 2 } as CSSProperties}>
          <Icon name="heart" size={16} />
          <strong>{wish ? <CountUp value={wish.length} delay={240} /> : '–'}</strong>
          <span>{t('Quiero')}</span>
        </li>
      </ul>

      <div className="snk-tabs" role="tablist" aria-label={t('Sección')}>
        {(
          [
            ['owned', t('Mi colección'), 'shoe', owned?.length],
            ['wish', t('Quiero conseguir'), 'heart', wish?.length],
            ['stats', t('Dashboard'), 'pulse', undefined],
          ] as const
        ).map(([k, label, icon, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`snk-tab is-${k}`} onClick={() => switchTab(k)}>
            <Icon name={icon} size={15} /> {label}
            {n !== undefined && <span className="count">{n}</span>}
          </button>
        ))}
      </div>

      <SectionHead n={1} title={tab === 'owned' ? t('Mi colección') : tab === 'wish' ? t('Quiero conseguir') : t('Dashboard')}>
        {tab !== 'stats' && list && (
          <span className="ux-section-count">
            <CountUp value={list.length} />
          </span>
        )}
      </SectionHead>

      <ErrorNote error={error} />

      {tab === 'stats' ? (
        stats ? (
          <SneakerDashboard stats={stats} />
        ) : (
          !error && <SprayLoader label={t('Contando tus pares…')} />
        )
      ) : (
        <>
          {tab === 'owned' && candidates.length > 0 && (
            <aside className="snk-adopt" aria-label={t('Zapatillas de tu armario sin ficha')}>
              <p>
                <Icon name="hanger" size={15} /> {t('Tienes')}{' '}
                <b>
                  {tn(candidates.length, '{n} par', '{n} pares')}
                </b>{' '}
                {t('en tu armario sin ficha de colección. Añádeles marca y modelo (no se duplican):')}
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
              <div className="snk-brand-rail" role="group" aria-label={t('Marca')}>
                <button
                  type="button"
                  className={`snk-brand-tag${brand === null ? ' is-active' : ''}`}
                  aria-pressed={brand === null}
                  onClick={() => {
                    play('click');
                    setBrand(null);
                  }}
                >
                  {t('Todas')}
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
                      withTransition(() => setBrand(brand === b ? null : b));
                    }}
                  >
                    {BRAND_LABEL[b]} <span className="count">{brandCount.get(b)}</span>
                  </button>
                ))}
              </div>

              <div className="fits-row">
                <label className="fits-search">
                  <Icon name="search" />
                  <input type="search" placeholder={t('Buscar modelo, colorway, notas…')} aria-label={t('Buscar zapatillas')} value={query} onChange={(e) => setQuery(e.target.value)} />
                  {query && (
                    <button type="button" className="icon-btn" aria-label={t('Borrar búsqueda')} onClick={() => setQuery('')}>
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </label>
                <Select
                  size="sm"
                  ariaLabel={t('Modelo')}
                  className="snk-select"
                  value={model}
                  options={[{ value: '', label: t('Todos los modelos') }, ...models.map((m) => ({ value: m, label: m }))]}
                  onChange={setModel}
                />
                <Select
                  size="sm"
                  ariaLabel={t('Talla')}
                  className="snk-select is-size"
                  value={size}
                  options={[{ value: '', label: t('Todas las tallas') }, ...sizes.map((s) => ({ value: s, label: t('Talla {size}', { size: s }) }))]}
                  onChange={setSize}
                />
                <div className="sort-pills" role="group" aria-label={t('Orden')}>
                  {SNEAKER_SORTS.filter((o) => tab === 'owned' || (o.id !== 'most' && o.id !== 'least')).map((o) => (
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

              <div className="fits-row snk-row2">
                <div className="snk-color-rail" role="group" aria-label={t('Color')}>
                  {colors.map(([name, c]) => (
                    <button
                      key={name}
                      type="button"
                      className={`snk-color-chip${color === name ? ' is-active' : ''}`}
                      aria-pressed={color === name}
                      title={`${name} (${c.count})`}
                      onClick={() => {
                        play('click');
                        withTransition(() => setColor(color === name ? null : name));
                      }}
                    >
                      <i style={{ background: c.hex }} aria-hidden="true" />
                      <span className="cap">{name}</span>
                    </button>
                  ))}
                </div>
                <div className="snk-cond-rail" role="group" aria-label={t('Estado')}>
                  {SNEAKER_CONDITIONS.filter((c) => all.some((s) => s.sneaker.condition === c)).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`snk-cond-chip is-small${condition === c ? ' is-active' : ''}`}
                      aria-pressed={condition === c}
                      title={CONDITION[c].hint}
                      onClick={() => {
                        play('click');
                        withTransition(() => setCondition(condition === c ? null : c));
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
                {tn(visible.length, '{n} par', '{n} pares')}
                {tab === 'wish' && <span className="status-tag">{t('Wishlist')}</span>}
                {brand && <span className="status-tag">{BRAND_LABEL[brand]}</span>}
                {model && <span className="status-tag">{model}</span>}
                {size && <span className="status-tag">{t('Talla {size}', { size })}</span>}
                {color && <span className="status-tag cap">{color}</span>}
                {condition && <span className="status-tag">{CONDITION[condition].short}</span>}
              </span>
            )}
            {filtered && (
              <button type="button" className="link-btn" onClick={clearFilters}>
                <Icon name="close" size={12} /> {t('Quitar filtros')}
              </button>
            )}
          </div>

          {loading ? (
            !error && <SprayLoader label={t('Sacando tus zapatillas…')} />
          ) : all.length === 0 ? (
            <EmptyStage
              icon="shoe"
              pieces={['shoe', 'tag', 'heart', 'shoe', 'sparkles', 'bag']}
              kicker={t('My rotation')}
              kickerIcon="shoe"
              title={tab === 'wish' ? t('Nada fichado') : t('Estantería vacía')}
              text={
                tab === 'wish'
                  ? t('Guarda aquí los pares que quieres conseguir: marca, modelo, colorway, talla, precio y tu foto.')
                  : t('Añade tus zapatillas con tu foto, marca, modelo, colorway, talla, fecha y precio de compra. Luego podrás usarlas en tus outfits.')
              }
            >
              <button type="button" className="btn wd-add wd-add-big" onClick={() => setForm({ kind: 'create', scope: tab === 'wish' ? 'wish' : 'owned' })}>
                <Icon name={tab === 'wish' ? 'heart' : 'plus'} size={16} /> <span>{tab === 'wish' ? t('Añadir a la wishlist') : t('Añadir el primer par')}</span>
              </button>
            </EmptyStage>
          ) : visible.length === 0 ? (
            <NoMatch title={t('Nada por aquí')} text={t('Ningún par con estos filtros.')}>
              <button type="button" className="btn wd-btn-line" onClick={clearFilters}>
                {t('Ver todos')}
              </button>
            </NoMatch>
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
