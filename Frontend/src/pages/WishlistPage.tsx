import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { wishlistApi } from '../api/endpoints';
import type { WishlistCategory, WishlistItem, WishlistSort, WishlistStatus, WishlistSummary } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { SoundToggle } from '../components/fx/SoundToggle';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { useAppData } from '../components/Layout';
import { Select } from '../components/Select';
import { EmptyStage, NoMatch } from '../components/street/EmptyStage';
import { SectionHead } from '../components/street/SectionHead';
import { CountUp } from '../components/street/Street';
import { PriceSpark } from '../components/wishlist/PriceChart';
import { WishForm } from '../components/wishlist/WishForm';
import { WishMedia } from '../components/wishlist/WishMedia';
import { play } from '../lib/sfx';
import { withTransition } from '../lib/motion';
import { atTarget, brandOf, CURRENCIES, hostOf, money, num, WISH_CATEGORIES, WISH_CATEGORY, WISH_SORTS, WISH_STATUS, WISH_STATUSES } from '../lib/wishlist';
import { t, tn } from '../i18n';

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
    toast.show(created ? t('«{name}» guardado en tu wishlist', { name: item.name }) : t('Cambios guardados'), { tone: 'ok', icon: created ? 'heart' : 'check' });
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
      toast.show(next === 'PURCHASED' ? t('¡«{name}» comprado! Pásalo a tu armario desde su ficha.', { name: item.name }) : `${item.name}: ${WISH_STATUS[next].label}`, {
        tone: next === 'PURCHASED' ? 'ok' : 'info',
        icon: WISH_STATUS[next].icon,
        action:
          next === 'PURCHASED'
            ? { label: t('Al armario'), run: () => navigate(`/wishlist/${item.id}#armario`) }
            : {
                label: t('Deshacer'),
                run: () => void wishlistApi.update(item.id, { status: before }).then((u) => setItems((p) => (p ?? []).map((i) => (i.id === u.id ? u : i)))).then(loadSummary),
              },
      });
      loadSummary();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : t('No se pudo cambiar el estado'), { tone: 'danger', sound: 'error' });
    } finally {
      setBusyId(null);
    }
  }

  const s = summary;
  const cur = s?.currency ?? 'EUR';
  const showBudget = !!(s && items && items.length + s.counts.movedToWardrobe > 0);

  return (
    <section className="page wl ux wh">

      <header className="fits-hero wl-hero ux-head">
        <div className="fits-title">
          <span className="wd-kicker">
            <Icon name="heart" size={12} /> {t('My wishlist')}
          </span>
          <h1 className="wd-title ux-title" data-text={t('Wishlist')}>
            {t('Wishlist')}
          </h1>
          <p className="ux-lede">{t('Lo que quieres, lo que cuesta y lo que te falta para tenerlo.')}</p>
        </div>

        <div className="wd-head-actions">
          <SoundToggle />
          <button
            type="button"
            className="btn wd-add"
            onClick={() => {
              play('spray');
              setForm({ item: null });
            }}
          >
            <Icon name="plus" size={16} /> <span>{t('Añadir deseo')}</span>
          </button>
        </div>
      </header>

      <ul className="wd-stats ux-stats" aria-label={t('Resumen')}>
        <li style={{ '--i': 0 } as CSSProperties}>
          <Icon name="heart" size={16} />
          <strong>{s ? <CountUp value={s.counts.pending} /> : '–'}</strong>
          <span>{t('Deseos')}</span>
        </li>
        <li style={{ '--i': 1 } as CSSProperties}>
          <Icon name="check" size={16} />
          <strong>{s ? <CountUp value={s.counts.purchased} delay={120} /> : '–'}</strong>
          <span>{t('Comprados')}</span>
        </li>
        <li style={{ '--i': 2 } as CSSProperties}>
          <Icon name="wallet" size={16} />
          <strong>{s ? money(s.money.totalValue, cur, { compact: true }) : '–'}</strong>
          <span>{t('Valor')}</span>
        </li>
      </ul>

      {showBudget && s && items && (
        <BudgetPanel summary={s} onChange={setSummary} tracked={items.filter((i) => i.trackPrice).length} />
      )}

      <SectionHead n={showBudget ? 2 : 1} title={t('Tu lista')}>
        {items && (
          <span className="ux-section-count">
            <CountUp value={items.length} />
          </span>
        )}
      </SectionHead>

      <div className="fits-filters wl-filters" role="search">
        <div className="fits-row">
          <div className="wl-status-rail" role="tablist" aria-label={t('Estado')}>
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
              {t('Todo')} <span className="count">{s?.counts.total ?? '–'}</span>
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
                  withTransition(() => setStatus(status === k ? 'ALL' : k));
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
            <input type="search" placeholder={t('Buscar nombre, marca, tienda…')} aria-label={t('Buscar en la wishlist')} value={query} onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button type="button" className="icon-btn" aria-label={t('Borrar búsqueda')} onClick={() => setQuery('')}>
                <Icon name="close" size={14} />
              </button>
            )}
          </label>

          <div className="sort-pills" role="group" aria-label={t('Orden')}>
            {WISH_SORTS.map((o) => (
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

        <div className="wl-cat-rail" role="group" aria-label={t('Categoría')}>
          <button
            type="button"
            className={`wl-cat-chip${category === null ? ' is-active' : ''}`}
            aria-pressed={category === null}
            onClick={() => {
              play('click');
              setCategory(null);
            }}
          >
            {t('Todas')}
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
                withTransition(() => setCategory(category === c ? null : c));
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
            {visible.length} {visible.length === 1 ? t('artículo') : t('artículos')}
            {status !== 'ALL' && <span className="status-tag">{WISH_STATUS[status].label}</span>}
            {category && <span className="status-tag">{WISH_CATEGORY[category].label}</span>}
            {q && <span className="status-tag">«{query.trim()}»</span>}
          </span>
        )}
        {filtered && (
          <button type="button" className="link-btn" onClick={clearFilters}>
            <Icon name="close" size={12} /> {t('Quitar filtros')}
          </button>
        )}
      </div>

      <ErrorNote error={error} />

      {!items ? (
        !error && <SprayLoader label={t('Abriendo tu wishlist…')} />
      ) : items.length === 0 ? (
        <EmptyStage
          icon="heart"
          pieces={['shoe', 'hoodie', 'cap', 'tag', 'wallet', 'jacket']}
          kicker={t('My wishlist')}
          kickerIcon="heart"
          title={t('Lista en blanco')}
          text={t('Guarda aquí las zapas, sudaderas y prendas que tienes fichadas: con foto, talla, precio y enlace. Te ayudamos a ver cuánto te falta.')}
        >
          <button type="button" className="btn wd-add wd-add-big" onClick={() => setForm({ item: null })}>
            <Icon name="plus" size={16} /> <span>{t('Añadir el primero')}</span>
          </button>
        </EmptyStage>
      ) : visible.length === 0 ? (
        <NoMatch title={t('Nada por aquí')} text={t('Ningún artículo con estos filtros.')}>
          <button type="button" className="btn wd-btn-line" onClick={clearFilters}>
            {t('Ver todo')}
          </button>
        </NoMatch>
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
  const trend = item.trend;
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
            <Icon name="tag" size={12} /> {t('En tu precio')}
          </span>
        )}
        {purchased && <span className="wl-stamp">{t('Comprado')}</span>}
        {fresh && <span className="wl-burst" aria-hidden="true" />}
      </div>

      <div className="wl-body">
        <span className="wl-brand">
          {brand ?? cat.label}
          {item.size && <i> {t('· talla {size}', { size: item.size })}</i>}
        </span>
        <h3 className="wl-name">
          <Link to={`/wishlist/${item.id}`} className="wl-link" onClick={() => play('click')}>
            {item.name}
          </Link>
        </h3>
        <div className="wl-price-row">
          <b className="wl-price">{price === null ? <span className="wl-noprice">{t('Sin precio')}</span> : money(price, item.currency)}</b>
          {trend && trend.direction !== 'same' && (
            <span className={`wl-trend is-${trend.direction}`} title={t('Antes: {money}', { money: money(price! - trend.diff, item.currency) })}>
              <Icon name={trend.direction === 'down' ? 'trendDown' : 'trendUp'} size={12} />
              {trend.direction === 'down' ? '−' : '+'}
              {money(Math.abs(trend.diff), item.currency)}
            </span>
          )}
          <PriceSpark prices={item.prices} currency={item.currency} />
        </div>
        <span className="wl-meta">
          <i className="wl-swatch" aria-hidden="true" />
          {item.targetPrice ? <>{t('Objetivo {money}', { money: money(item.targetPrice, item.currency) })}</> : <>{cat.label}</>}
          {host && <span className="wl-host">· {host}</span>}
        </span>
      </div>

      <div className="wl-card-actions">
        <div className="wl-quick" role="group" aria-label={t('Estado de {name}', { name: item.name })}>
          {WISH_STATUSES.map((k) => (
            <button
              key={k}
              type="button"
              className={item.wishlistStatus === k ? 'is-on' : ''}
              style={{ '--st': WISH_STATUS[k].color } as CSSProperties}
              aria-pressed={item.wishlistStatus === k}
              title={WISH_STATUS[k].label}
              aria-label={t('Marcar como {label}', { label: WISH_STATUS[k].label })}
              disabled={busy}
              onClick={() => onStatus(k)}
            >
              <Icon name={WISH_STATUS[k].icon} size={13} />
            </button>
          ))}
        </div>
        {purchased ? (
          <Link to={`/wishlist/${item.id}#armario`} className="wl-move-btn" onClick={() => play('click')}>
            <Icon name="hanger" size={13} /> {t('Al armario')}
          </Link>
        ) : (
          <button
            type="button"
            className="icon-btn"
            aria-label={t('Editar {name}', { name: item.name })}
            title={t('Editar')}
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
      setError(new Error(t('Escribe importes válidos (0 o más).')));
      return;
    }
    setBusy(true);
    try {
      const next = await wishlistApi.updateBudget({ budget: b, saved: sv, currency });
      onChange(next);
      setEditing(false);
      play('success');
      toast.show(t('Presupuesto guardado'), { tone: 'ok', icon: 'wallet' });
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
      <SectionHead n={1} title={t('Presupuesto')} id="wl-budget-h">
        {!editing && (
          <button type="button" className="link-btn hm-section-link" onClick={open}>
            <Icon name="edit" size={12} /> {m.budget === null ? t('Fijar objetivo') : t('Cambiar##editar')}
          </button>
        )}
      </SectionHead>

      {editing ? (
        <form className="wl-budget-form" onSubmit={submit}>
          <label className="field">
            <span>{t('Presupuesto objetivo')}</span>
            <input ref={firstRef} inputMode="decimal" placeholder={t('Sin objetivo')} value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('Lo que llevas ahorrado')}</span>
            <input inputMode="decimal" placeholder="0" value={saved} onChange={(e) => setSaved(e.target.value)} />
          </label>
          <div className="field">
            <span id="wl-bcur">{t('Moneda')}</span>
            <Select labelledBy="wl-bcur" size="sm" value={currency} options={[...new Set([currency, ...CURRENCIES])].map((c) => ({ value: c, label: c }))} onChange={setCurrency} />
          </div>
          <div className="wl-budget-form-actions">
            <button type="button" className="btn wd-btn-line btn-small" onClick={() => setEditing(false)} disabled={busy}>
              {t('Cancelar')}
            </button>
            <button type="submit" className="btn wd-add btn-small" disabled={busy}>
              {busy ? t('Guardando…') : t('Guardar')}
            </button>
          </div>
          <ErrorNote error={error} />
        </form>
      ) : (
        <>
          <dl className="wl-budget-kpis">
            <div style={{ '--i': 0 } as CSSProperties}>
              <dt>{t('Valor de la wishlist')}</dt>
              <dd>{money(m.totalValue, cur)}</dd>
              <span>
                {tn(s.counts.pending, '{n} pendiente', '{n} pendientes')}
                {s.counts.unpriced > 0 && t(' · {unpriced} sin precio', { unpriced: s.counts.unpriced })}
              </span>
            </div>
            <div style={{ '--i': 1 } as CSSProperties}>
              <dt>{t('Comprado')}</dt>
              <dd>{money(m.spent, cur)}</dd>
              <span>
                {s.counts.purchased} {s.counts.purchased === 1 ? t('artículo') : t('artículos')}
                {s.counts.movedToWardrobe > 0 && t(' · {movedToWardrobe} ya en el armario', { movedToWardrobe: s.counts.movedToWardrobe })}
              </span>
            </div>
            <div style={{ '--i': 2 } as CSSProperties}>
              <dt>{t('Objetivo')}</dt>
              <dd>{m.budget === null ? '—' : money(m.budget, cur)}</dd>
              <span>{t('Ahorrado: {money}', { money: money(m.saved, cur) })}</span>
            </div>
            <div style={{ '--i': 3 } as CSSProperties} className="is-key">
              <dt>{t('Te falta para el objetivo')}</dt>
              <dd>{m.remaining === null ? '—' : money(m.remaining, cur)}</dd>
              <span>{m.remaining === null ? t('Fija un objetivo para verlo') : m.remaining === 0 ? t('¡Objetivo cumplido!') : t('{n} % conseguido', { n: Math.round(m.progress ?? 0) })}</span>
            </div>
          </dl>

          <div className="wl-meters">
            {m.budget !== null && (
              <div className="wl-meter" role="img" aria-label={t('Ahorrado {money} de {money2}', { money: money(m.saved, cur), money2: money(m.budget, cur) })}>
                <span className="wl-meter-label">
                  {t('Ahorrado / objetivo')} <b>{Math.round(savedPct)} %</b>
                </span>
                <span className="wl-meter-track">
                  <span className="wl-meter-fill" style={{ width: `${savedPct}%` }} />
                </span>
              </div>
            )}
            {m.totalValue > 0 && (
              <div className="wl-meter is-cover" role="img" aria-label={t('Con lo ahorrado cubres el {round} % de lo pendiente', { round: Math.round(coverPct) })}>
                <span className="wl-meter-label">
                  {t('Para comprarlo todo te faltan')} <b>{money(m.shortfall, cur)}</b>
                </span>
                <span className="wl-meter-track">
                  <span className="wl-meter-fill" style={{ width: `${coverPct}%` }} />
                </span>
              </div>
            )}
          </div>

          {m.otherCurrencies.length > 0 && (
            <p className="wl-budget-note">
              <Icon name="flag" size={12} /> {t('No se suman (no convertimos monedas): {join}.', { join: m.otherCurrencies.map((o) => t('{count} en {currency} ({money})', { count: o.count, currency: o.currency, money: money(o.total, o.currency) })).join(', ') })}
            </p>
          )}
          <p className="wl-budget-note">
            <Icon name="pulse" size={12} />{' '}
            {s.trackers === 0
              ? t('Seguimiento automático de precios: aún no hay servicios conectados. Los precios los apuntas tú{v}.', { v: tracked ? t(' ({tracked} {v} para seguir cuando lo haya)', { tracked, v: tracked === 1 ? t('marcado') : t('marcados') }) : '' })
              : t('{trackers} {v} de seguimiento conectados.', { trackers: s.trackers, v: s.trackers === 1 ? t('servicio') : t('servicios') })}
          </p>
        </>
      )}
    </section>
  );
}
