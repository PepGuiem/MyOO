import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { wishlistApi } from '../api/endpoints';
import type { WishlistCategory, WishlistItem, WishlistSort, WishlistStatus, WishlistSummary } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { NeonScene } from '../components/fx/NeonScene';
import { SoundToggle } from '../components/fx/SoundToggle';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { useAppData } from '../components/Layout';
import { Select } from '../components/Select';
import { CountUp } from '../components/street/Street';
import { PriceSpark } from '../components/wishlist/PriceChart';
import { WishForm } from '../components/wishlist/WishForm';
import { WishMedia } from '../components/wishlist/WishMedia';
import { play } from '../lib/sfx';
import { atTarget, brandOf, CURRENCIES, hostOf, money, num, WISH_CATEGORIES, WISH_CATEGORY, WISH_SORTS, WISH_STATUS, WISH_STATUSES } from '../lib/wishlist';

function sortItems(items: WishlistItem[], sort: WishlistSort): WishlistItem[] {
  const byPrice = (dir: 1 | -1) => (a: WishlistItem, b: WishlistItem) => {
    const pa = num(a.currentPrice);
    const pb = num(b.currentPrice);
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1;
    if (pb === null) return -1;
    return (pa - pb) * dir;
  };
  const copy = [...items];
  if (sort === 'price_asc') return copy.sort(byPrice(1));
  if (sort === 'price_desc') return copy.sort(byPrice(-1));
  if (sort === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * WISHLIST: las prendas y zapatillas que quieres comprar, como una colección.
 * Cada artículo vive en tu cuenta (sincronizado entre dispositivos), con su
 * estado, su historial de precios y un presupuesto. Los precios los apuntas
 * tú: no se consultan tiendas ni se inventan precios ni disponibilidad.
 */
export function WishlistPage() {
  const { garmentTypes, wardrobes, reloadWardrobes } = useAppData();
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [summary, setSummary] = useState<WishlistSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<WishlistStatus | 'ALL'>('ALL');
  const [category, setCategory] = useState<WishlistCategory | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<WishlistSort>('new');
  const [form, setForm] = useState<{ item: WishlistItem | null } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bumped, setBumped] = useState<string | null>(null);

  const loadSummary = useCallback(() => {
    wishlistApi
      .summary()
      .then(setSummary)
      .catch(() => undefined);
  }, []);

  const load = useCallback(() => {
    Promise.all([wishlistApi.listAll(), wishlistApi.summary()])
      .then(([list, sum]) => {
        setItems(list);
        setSummary(sum);
        setError(null);
      })
      .catch((e: unknown) => setError(e));
  }, []);

  useEffect(() => {
    load();
    // Al volver a la pestaña (por si lo cambiaste en otro dispositivo).
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!items) return [];
    const list = items.filter(
      (i) =>
        (status === 'ALL' || i.wishlistStatus === status) &&
        (!category || (i.wishlistCategory ?? 'OTHER') === category) &&
        (!q || [i.name, brandOf(i), i.storeName, i.notes].some((t) => t?.toLowerCase().includes(q))),
    );
    return sortItems(list, sort);
  }, [items, status, category, q, sort]);

  const catCount = useMemo(() => {
    const c = Object.fromEntries(WISH_CATEGORIES.map((k) => [k, 0])) as Record<WishlistCategory, number>;
    for (const i of items ?? []) if (status === 'ALL' || i.wishlistStatus === status) c[i.wishlistCategory ?? 'OTHER']++;
    return c;
  }, [items, status]);

  const filtered = status !== 'ALL' || !!category || !!q;
  const clearFilters = () => {
    setStatus('ALL');
    setCategory(null);
    setQuery('');
  };

  function onSaved(item: WishlistItem, created: boolean) {
    setForm(null);
    setItems((prev) => (created ? [item, ...(prev ?? [])] : (prev ?? []).map((i) => (i.id === item.id ? item : i))));
    if (created) {
      setFresh(item.id);
      // Que se vea al guardarlo aunque haya filtros puestos.
      clearFilters();
      setSort('new');
      void reloadWardrobes();
    }
    play(created ? 'spray' : 'success');
    toast.show(created ? `«${item.name}» guardado en tu wishlist` : 'Cambios guardados', { tone: 'ok', icon: created ? 'heart' : 'check' });
    loadSummary();
  }

  async function quickStatus(item: WishlistItem, next: WishlistStatus) {
    if (item.wishlistStatus === next) return;
    setBusyId(item.id);
    const before = item.wishlistStatus;
    try {
      const updated = await wishlistApi.update(item.id, { status: next });
      setItems((prev) => (prev ?? []).map((i) => (i.id === item.id ? updated : i)));
      setBumped(item.id);
      play(next === 'PURCHASED' ? 'success' : 'pop');
      toast.show(next === 'PURCHASED' ? `¡«${item.name}» comprado! Pásalo a tu armario desde su ficha.` : `${item.name}: ${WISH_STATUS[next].label}`, {
        tone: next === 'PURCHASED' ? 'ok' : 'info',
        icon: WISH_STATUS[next].icon,
        action:
          next === 'PURCHASED'
            ? { label: 'Al armario', run: () => navigate(`/wishlist/${item.id}#armario`) }
            : {
                label: 'Deshacer',
                run: () => void wishlistApi.update(item.id, { status: before }).then((u) => setItems((p) => (p ?? []).map((i) => (i.id === u.id ? u : i)))).then(loadSummary),
              },
      });
      loadSummary();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'No se pudo cambiar el estado', { tone: 'danger', sound: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const s = summary;
  const cur = s?.currency ?? 'EUR';

  return (
    <section className="page wl">
      <NeonScene />

      <header className="fits-hero wl-hero">
        <div className="fits-title">
          <span className="fits-kicker">
            <span className="rec-dot" aria-hidden="true" /> Lista de deseos · guardada en tu cuenta
          </span>
          <h1 className="fits-h1" data-text="Wishlist">
            Wishlist
          </h1>
          <p className="fits-sub">Lo que quieres, lo que cuesta y lo que te falta para tenerlo.</p>
        </div>

        <dl className="fits-stats">
          <div>
            <dt>Deseos</dt>
            <dd>{s ? <CountUp value={s.counts.pending} /> : '—'}</dd>
          </div>
          <div>
            <dt>Comprados</dt>
            <dd>{s ? <CountUp value={s.counts.purchased} delay={120} /> : '—'}</dd>
          </div>
          <div className="wl-stat-money">
            <dt>Valor</dt>
            <dd>{s ? money(s.money.totalValue, cur, { compact: true }) : '—'}</dd>
          </div>
        </dl>

        <div className="fits-actions">
          <SoundToggle />
          <button
            type="button"
            className="btn btn-primary btn-street btn-new"
            onClick={() => {
              play('spray');
              setForm({ item: null });
            }}
          >
            <Icon name="plus" size={16} /> Añadir deseo
          </button>
        </div>
      </header>

      {s && items && items.length + s.counts.movedToWardrobe > 0 && <BudgetPanel summary={s} onChange={setSummary} tracked={items.filter((i) => i.trackPrice).length} />}

      <div className="fits-filters wl-filters" role="search">
        <div className="fits-row">
          <div className="wl-status-rail" role="tablist" aria-label="Estado">
            <button
              type="button"
              role="tab"
              aria-selected={status === 'ALL'}
              className="wl-tab"
              onClick={() => {
                play('click');
                setStatus('ALL');
              }}
            >
              Todo <span className="count">{s?.counts.total ?? '–'}</span>
            </button>
            {WISH_STATUSES.map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={status === k}
                className="wl-tab"
                style={{ '--st': WISH_STATUS[k].color } as CSSProperties}
                onClick={() => {
                  play('click');
                  setStatus(status === k ? 'ALL' : k);
                }}
              >
                <i className="wl-dot" aria-hidden="true" />
                <Icon name={WISH_STATUS[k].icon} size={13} /> {WISH_STATUS[k].short}
                <span className="count">{s?.counts.byStatus[k] ?? '–'}</span>
              </button>
            ))}
          </div>

          <label className="fits-search">
            <Icon name="search" />
            <input type="search" placeholder="Buscar nombre, marca, tienda…" aria-label="Buscar en la wishlist" value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button type="button" className="icon-btn" aria-label="Borrar búsqueda" onClick={() => setQuery('')}>
                <Icon name="close" size={14} />
              </button>
            )}
          </label>

          <div className="sort-pills" role="group" aria-label="Orden">
            {WISH_SORTS.map((o) => (
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

        <div className="wl-cat-rail" role="group" aria-label="Categoría">
          <button
            type="button"
            className={`wl-cat-chip${category === null ? ' is-active' : ''}`}
            aria-pressed={category === null}
            onClick={() => {
              play('click');
              setCategory(null);
            }}
          >
            Todas
          </button>
          {WISH_CATEGORIES.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`wl-cat-chip${category === c ? ' is-active' : ''}${catCount[c] === 0 ? ' is-empty' : ''}`}
              style={{ '--i': i } as CSSProperties}
              aria-pressed={category === c}
              onClick={() => {
                play('click');
                setCategory(category === c ? null : c);
              }}
            >
              <Icon name={WISH_CATEGORY[c].icon} size={15} /> {WISH_CATEGORY[c].label}
              <span className="count">{catCount[c]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="fits-status" aria-live="polite">
        {items && (
          <span>
            {visible.length} {visible.length === 1 ? 'artículo' : 'artículos'}
            {status !== 'ALL' && <span className="status-tag">{WISH_STATUS[status].label}</span>}
            {category && <span className="status-tag">{WISH_CATEGORY[category].label}</span>}
            {q && <span className="status-tag">«{query.trim()}»</span>}
          </span>
        )}
        {filtered && (
          <button type="button" className="link-btn" onClick={clearFilters}>
            <Icon name="close" size={12} /> Quitar filtros
          </button>
        )}
      </div>

      <ErrorNote error={error} />

      {!items ? (
        !error && <SprayLoader label="Abriendo tu wishlist…" />
      ) : items.length === 0 ? (
        <div className="fits-empty wl-empty">
          <span className="fits-empty-tag">Lista en blanco</span>
          <p>Guarda aquí las zapas, sudaderas y prendas que tienes fichadas: con foto, talla, precio y enlace. Te ayudamos a ver cuánto te falta.</p>
          <button type="button" className="btn btn-primary btn-street btn-new" onClick={() => setForm({ item: null })}>
            <Icon name="plus" size={16} /> Añadir el primero
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="fits-empty is-filtered">
          <span className="fits-empty-tag">Nada por aquí</span>
          <p>Ningún artículo con estos filtros.</p>
          <button type="button" className="btn btn-street" onClick={clearFilters}>
            Ver todo
          </button>
        </div>
      ) : (
        <div className="wl-grid">
          {visible.map((item, i) => (
            <WishCard
              key={item.id}
              item={item}
              index={Math.min(i, 16)}
              fresh={fresh === item.id}
              bumped={bumped === item.id}
              busy={busyId === item.id}
              onEdit={() => setForm({ item })}
              onStatus={(st) => void quickStatus(item, st)}
            />
          ))}
        </div>
      )}

      {form && (
        <WishForm
          item={form.item}
          garmentTypes={garmentTypes}
          wardrobes={wardrobes}
          defaultCurrency={cur}
          onClose={() => setForm(null)}
          onSaved={onSaved}
        />
      )}
    </section>
  );
}

function WishCard({
  item,
  index,
  fresh,
  bumped,
  busy,
  onEdit,
  onStatus,
}: {
  item: WishlistItem;
  index: number;
  fresh: boolean;
  bumped: boolean;
  busy: boolean;
  onEdit: () => void;
  onStatus: (s: WishlistStatus) => void;
}) {
  const [active, setActive] = useState(false);
  const st = WISH_STATUS[item.wishlistStatus];
  const cat = WISH_CATEGORY[item.wishlistCategory ?? 'OTHER'];
  const brand = brandOf(item);
  const price = num(item.currentPrice);
  const deal = atTarget(item);
  const t = item.trend;
  const host = hostOf(item.productUrl);
  const purchased = item.wishlistStatus === 'PURCHASED';

  return (
    <article
      className={`wl-card is-${item.wishlistStatus.toLowerCase()}${fresh ? ' is-fresh' : ''}${busy ? ' is-busy' : ''}`}
      style={{ '--i': index, '--st': st.color, '--sw': item.color } as CSSProperties}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div className="wl-media">
        <WishMedia item={item} active={active} className="wl-card-media" />
        <span key={`${item.wishlistStatus}${bumped ? '!' : ''}`} className="wl-status-badge">
          <Icon name={st.icon} size={12} /> {st.short}
        </span>
        <span className="wl-cat-tag" title={cat.label}>
          <Icon name={cat.icon} size={13} />
        </span>
        {deal && !purchased && (
          <span className="wl-deal">
            <Icon name="tag" size={12} /> En tu precio
          </span>
        )}
        {purchased && <span className="wl-stamp">Comprado</span>}
        {fresh && <span className="wl-burst" aria-hidden="true" />}
      </div>

      <div className="wl-body">
        <span className="wl-brand">
          {brand ?? cat.label}
          {item.size && <i> · talla {item.size}</i>}
        </span>
        <h3 className="wl-name">
          <Link to={`/wishlist/${item.id}`} className="wl-link" onClick={() => play('click')}>
            {item.name}
          </Link>
        </h3>
        <div className="wl-price-row">
          <b className="wl-price">{price === null ? <span className="wl-noprice">Sin precio</span> : money(price, item.currency)}</b>
          {t && t.direction !== 'same' && (
            <span className={`wl-trend is-${t.direction}`} title={`Antes: ${money(price! - t.diff, item.currency)}`}>
              <Icon name={t.direction === 'down' ? 'trendDown' : 'trendUp'} size={12} />
              {t.direction === 'down' ? '−' : '+'}
              {money(Math.abs(t.diff), item.currency)}
            </span>
          )}
          <PriceSpark prices={item.prices} currency={item.currency} />
        </div>
        <span className="wl-meta">
          <i className="wl-swatch" aria-hidden="true" />
          {item.targetPrice ? <>Objetivo {money(item.targetPrice, item.currency)}</> : <>{cat.label}</>}
          {host && <span className="wl-host">· {host}</span>}
        </span>
      </div>

      <div className="wl-card-actions">
        <div className="wl-quick" role="group" aria-label={`Estado de ${item.name}`}>
          {WISH_STATUSES.map((k) => (
            <button
              key={k}
              type="button"
              className={item.wishlistStatus === k ? 'is-on' : ''}
              style={{ '--st': WISH_STATUS[k].color } as CSSProperties}
              aria-pressed={item.wishlistStatus === k}
              title={WISH_STATUS[k].label}
              aria-label={`Marcar como ${WISH_STATUS[k].label}`}
              disabled={busy}
              onClick={() => onStatus(k)}
            >
              <Icon name={WISH_STATUS[k].icon} size={13} />
            </button>
          ))}
        </div>
        {purchased ? (
          <Link to={`/wishlist/${item.id}#armario`} className="wl-move-btn" onClick={() => play('click')}>
            <Icon name="hanger" size={13} /> Al armario
          </Link>
        ) : (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Editar ${item.name}`}
            title="Editar"
            onClick={() => {
              play('click');
              onEdit();
            }}
          >
            <Icon name="edit" size={14} />
          </button>
        )}
      </div>
    </article>
  );
}

/** Presupuesto: valor de lo pendiente, lo ahorrado, el objetivo y lo que falta. */
function BudgetPanel({ summary: s, onChange, tracked }: { summary: WishlistSummary; onChange: (s: WishlistSummary) => void; tracked: number }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [budget, setBudget] = useState('');
  const [saved, setSaved] = useState('');
  const [currency, setCurrency] = useState(s.currency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const cur = s.currency;
  const m = s.money;

  function open() {
    setBudget(m.budget === null ? '' : String(m.budget));
    setSaved(m.saved ? String(m.saved) : '');
    setCurrency(cur);
    setError(null);
    setEditing(true);
    window.setTimeout(() => firstRef.current?.focus(), 30);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const b = budget.trim() === '' ? null : Number(budget.replace(',', '.'));
    const sv = saved.trim() === '' ? 0 : Number(saved.replace(',', '.'));
    if ((b !== null && (!Number.isFinite(b) || b < 0)) || !Number.isFinite(sv) || sv < 0) {
      setError(new Error('Escribe importes válidos (0 o más).'));
      return;
    }
    setBusy(true);
    try {
      const next = await wishlistApi.updateBudget({ budget: b, saved: sv, currency });
      onChange(next);
      setEditing(false);
      play('success');
      toast.show('Presupuesto guardado', { tone: 'ok', icon: 'wallet' });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const savedPct = m.budget ? Math.min(100, (m.saved / m.budget) * 100) : 0;
  const coverPct = m.totalValue ? Math.min(100, (m.saved / m.totalValue) * 100) : 0;

  return (
    <section className="wl-budget" aria-labelledby="wl-budget-h">
      <header className="wl-budget-head">
        <h2 id="wl-budget-h">
          <Icon name="wallet" size={16} /> Presupuesto
        </h2>
        {!editing && (
          <button type="button" className="link-btn" onClick={open}>
            <Icon name="edit" size={12} /> {m.budget === null ? 'Fijar objetivo' : 'Cambiar'}
          </button>
        )}
      </header>

      {editing ? (
        <form className="wl-budget-form" onSubmit={submit}>
          <label className="field">
            <span>Presupuesto objetivo</span>
            <input ref={firstRef} inputMode="decimal" placeholder="Sin objetivo" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label className="field">
            <span>Lo que llevas ahorrado</span>
            <input inputMode="decimal" placeholder="0" value={saved} onChange={(e) => setSaved(e.target.value)} />
          </label>
          <div className="field">
            <span id="wl-bcur">Moneda</span>
            <Select labelledBy="wl-bcur" size="sm" value={currency} options={[...new Set([currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} onChange={setCurrency} />
          </div>
          <div className="wl-budget-form-actions">
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(false)} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-small" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
          <ErrorNote error={error} />
        </form>
      ) : (
        <>
          <dl className="wl-budget-kpis">
            <div style={{ '--i': 0 } as CSSProperties}>
              <dt>Valor de la wishlist</dt>
              <dd>{money(m.totalValue, cur)}</dd>
              <span>
                {s.counts.pending} {s.counts.pending === 1 ? 'pendiente' : 'pendientes'}
                {s.counts.unpriced > 0 && ` · ${s.counts.unpriced} sin precio`}
              </span>
            </div>
            <div style={{ '--i': 1 } as CSSProperties}>
              <dt>Comprado</dt>
              <dd>{money(m.spent, cur)}</dd>
              <span>
                {s.counts.purchased} {s.counts.purchased === 1 ? 'artículo' : 'artículos'}
                {s.counts.movedToWardrobe > 0 && ` · ${s.counts.movedToWardrobe} ya en el armario`}
              </span>
            </div>
            <div style={{ '--i': 2 } as CSSProperties}>
              <dt>Objetivo</dt>
              <dd>{m.budget === null ? '—' : money(m.budget, cur)}</dd>
              <span>Ahorrado: {money(m.saved, cur)}</span>
            </div>
            <div style={{ '--i': 3 } as CSSProperties} className="is-key">
              <dt>Te falta para el objetivo</dt>
              <dd>{m.remaining === null ? '—' : money(m.remaining, cur)}</dd>
              <span>{m.remaining === null ? 'Fija un objetivo para verlo' : m.remaining === 0 ? '¡Objetivo cumplido!' : `${Math.round(m.progress ?? 0)} % conseguido`}</span>
            </div>
          </dl>

          <div className="wl-meters">
            {m.budget !== null && (
              <div className="wl-meter" role="img" aria-label={`Ahorrado ${money(m.saved, cur)} de ${money(m.budget, cur)}`}>
                <span className="wl-meter-label">
                  Ahorrado / objetivo <b>{Math.round(savedPct)} %</b>
                </span>
                <span className="wl-meter-track">
                  <span className="wl-meter-fill" style={{ width: `${savedPct}%` }} />
                </span>
              </div>
            )}
            {m.totalValue > 0 && (
              <div className="wl-meter is-cover" role="img" aria-label={`Con lo ahorrado cubres el ${Math.round(coverPct)} % de lo pendiente`}>
                <span className="wl-meter-label">
                  Para comprarlo todo te faltan <b>{money(m.shortfall, cur)}</b>
                </span>
                <span className="wl-meter-track">
                  <span className="wl-meter-fill" style={{ width: `${coverPct}%` }} />
                </span>
              </div>
            )}
          </div>

          {m.otherCurrencies.length > 0 && (
            <p className="wl-budget-note">
              <Icon name="flag" size={12} /> No se suman (no convertimos monedas):{' '}
              {m.otherCurrencies.map((o) => `${o.count} en ${o.currency} (${money(o.total, o.currency)})`).join(', ')}.
            </p>
          )}
          <p className="wl-budget-note">
            <Icon name="pulse" size={12} />{' '}
            {s.trackers === 0
              ? `Seguimiento automático de precios: aún no hay servicios conectados. Los precios los apuntas tú${tracked ? ` (${tracked} ${tracked === 1 ? 'marcado' : 'marcados'} para seguir cuando lo haya)` : ''}.`
              : `${s.trackers} ${s.trackers === 1 ? 'servicio' : 'servicios'} de seguimiento conectados.`}
          </p>
        </>
      )}
    </section>
  );
}
