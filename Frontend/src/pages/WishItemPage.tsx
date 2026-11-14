import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { wishlistApi } from '../api/endpoints';
import type { WishlistItem, WishlistStatus } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { ConfirmDialog } from '../components/fx/ConfirmDialog';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { useAppData } from '../components/Layout';
import { Select } from '../components/Select';
import { PriceChart } from '../components/wishlist/PriceChart';
import { WishForm } from '../components/wishlist/WishForm';
import { hasPhoto, WishMedia } from '../components/wishlist/WishMedia';
import { play } from '../lib/sfx';
import { atTarget, brandOf, hostOf, money, num, todayKey, WISH_CATEGORY, WISH_STATUS, WISH_STATUSES } from '../lib/wishlist';
import { LOCALE_TAG } from '../i18n';

/**
 * Ficha de un deseo: foto o modelo 3D, estado, precios (historial y apuntar
 * uno nuevo), y, cuando lo compras, pasarlo al armario.
 */
export function WishItemPage() {
  const { id = '' } = useParams();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const { garmentTypes, wardrobes, reloadWardrobes } = useAppData();
  const [item, setItem] = useState<WishlistItem | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [view, setView] = useState<'photo' | '3d'>('photo');
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState('EUR');

  const load = useCallback(() => {
    wishlistApi
      .get(id)
      .then((it) => {
        setItem(it);
        setError(null);
      })
      .catch((e: unknown) => setError(e));
  }, [id]);

  useEffect(() => {
    load();
    wishlistApi
      .summary()
      .then((s) => setDefaultCurrency(s.currency))
      .catch(() => undefined);
  }, [load]);

  // Desde «Al armario» de la tarjeta: baja hasta el formulario.
  useEffect(() => {
    if (item && hash === '#armario') window.setTimeout(() => document.getElementById('armario')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
  }, [item, hash]);

  if (!item) {
    return (
      <section className="page wl wl-item">
        <Link to="/wishlist" className="wl-back">
          <Icon name="back" size={14} /> Wishlist
        </Link>
        <ErrorNote error={error} />
        {!error && <SprayLoader label="Abriendo la ficha…" />}
      </section>
    );
  }

  const st = WISH_STATUS[item.wishlistStatus];
  const cat = WISH_CATEGORY[item.wishlistCategory ?? 'OTHER'];
  const brand = brandOf(item);
  const price = num(item.currentPrice);
  const target = num(item.targetPrice);
  const cur = item.currency ?? defaultCurrency;
  const host = hostOf(item.productUrl);
  const t = item.trend;
  const photo = hasPhoto(item);

  async function setStatus(next: WishlistStatus) {
    if (!item || next === item.wishlistStatus) return;
    setStatusBusy(true);
    try {
      const u = await wishlistApi.update(item.id, { status: next });
      setItem(u);
      play(next === 'PURCHASED' ? 'success' : 'pop');
      if (next === 'PURCHASED') {
        toast.show('¡Comprado! Ya puedes pasarlo a tu armario.', { tone: 'ok', icon: 'check' });
        window.setTimeout(() => document.getElementById('armario')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
      }
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'No se pudo cambiar el estado', { tone: 'danger', sound: 'error' });
    } finally {
      setStatusBusy(false);
    }
  }

  async function remove() {
    if (!item) return;
    setDeleting(true);
    try {
      await wishlistApi.remove(item.id);
      play('swoosh');
      toast.show(`«${item.name}» quitado de la wishlist`, { tone: 'danger', icon: 'trash' });
      navigate('/wishlist');
    } catch (err) {
      setDeleting(false);
      setConfirmDelete(false);
      toast.show(err instanceof Error ? err.message : 'No se pudo borrar', { tone: 'danger', sound: 'error' });
    }
  }

  return (
    <section className={`page wl wl-item is-${item.wishlistStatus.toLowerCase()}`} style={{ '--st': st.color, '--sw': item.color } as CSSProperties}>
      <Link to="/wishlist" className="wl-back">
        <Icon name="back" size={14} /> Wishlist
      </Link>

      <div className="wl-item-grid">
        {/* Imagen */}
        <div className="wl-item-media">
          <div className="wl-item-frame">
            <WishMedia key={view} item={item} active mode={photo && view === 'photo' ? 'auto' : '3d'} className="wl-item-view" />
            <span key={item.wishlistStatus} className="wl-status-badge is-big">
              <Icon name={st.icon} size={14} /> {st.label}
            </span>
            {item.wishlistStatus === 'PURCHASED' && <span className="wl-stamp">Comprado</span>}
          </div>
          {photo && (
            <div className="wl-view-switch" role="group" aria-label="Ver">
              <button type="button" aria-pressed={view === 'photo'} onClick={() => setView('photo')}>
                Foto
              </button>
              <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>
                Modelo 3D
              </button>
            </div>
          )}
        </div>

        {/* Ficha */}
        <div className="wl-item-info">
          <span className="fits-kicker">
            <Icon name={cat.icon} size={13} /> {cat.label}
            {brand && <> · {brand}</>}
          </span>
          <h1 className="wl-item-h1">{item.name}</h1>

          <div className="wl-status-pick is-big" role="radiogroup" aria-label="Estado">
            {WISH_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={item.wishlistStatus === s}
                className={`wl-status-chip${item.wishlistStatus === s ? ' is-active' : ''}`}
                style={{ '--st': WISH_STATUS[s].color } as CSSProperties}
                title={WISH_STATUS[s].hint}
                disabled={statusBusy}
                onClick={() => void setStatus(s)}
              >
                <Icon name={WISH_STATUS[s].icon} size={13} /> {WISH_STATUS[s].short}
              </button>
            ))}
          </div>

          <div className="wl-price-box">
            <div>
              <span className="wl-label">Precio actual</span>
              <b className="wl-price-big">{price === null ? 'Sin precio' : money(price, cur)}</b>
              {t && t.direction !== 'same' && (
                <span className={`wl-trend is-${t.direction}`} title="Frente al precio apuntado antes">
                  <Icon name={t.direction === 'down' ? 'trendDown' : 'trendUp'} size={12} />
                  {t.direction === 'down' ? '−' : '+'}
                  {money(Math.abs(t.diff), cur)} ({t.pct > 0 ? '+' : '−'}
                  {Math.abs(t.pct).toLocaleString(LOCALE_TAG)} %)
                </span>
              )}
            </div>
            <dl className="wl-price-facts">
              <div>
                <dt>Objetivo</dt>
                <dd>{target === null ? '—' : money(target, cur)}</dd>
              </div>
              <div>
                <dt>Más bajo apuntado</dt>
                <dd>{t ? money(t.lowest, cur) : '—'}</dd>
              </div>
              <div>
                <dt>Precios apuntados</dt>
                <dd>{t?.points ?? 0}</dd>
              </div>
            </dl>
            {atTarget(item) && (
              <p className="wl-deal-note">
                <Icon name="tag" size={13} /> Está en tu precio objetivo o por debajo.
              </p>
            )}
          </div>

          <dl className="wl-facts">
            <div>
              <dt>Talla</dt>
              <dd>{item.size ?? '—'}</dd>
            </div>
            <div>
              <dt>Color</dt>
              <dd>
                <i className="wl-swatch" aria-hidden="true" /> {item.color.toUpperCase()}
              </dd>
            </div>
            <div>
              <dt>Tienda</dt>
              <dd>{item.storeName ?? host ?? '—'}</dd>
            </div>
            <div>
              <dt>Irá al armario</dt>
              <dd>{item.wardrobe.name}</dd>
            </div>
          </dl>

          {item.notes && <p className="wl-notes">{item.notes}</p>}

          <div className="wl-item-actions">
            {item.productUrl && (
              <a className="btn btn-street" href={item.productUrl} target="_blank" rel="noopener noreferrer nofollow">
                <Icon name="external" size={14} /> Abrir enlace{host ? ` (${host})` : ''}
              </a>
            )}
            <Link to={`/outfits/new?with=${item.id}`} className="btn btn-street btn-ghost" onClick={() => play('spray')}>
              <Icon name="hanger" size={14} /> Probar en un outfit
            </Link>
            <button type="button" className="btn btn-street btn-ghost" onClick={() => setEditing(true)}>
              <Icon name="edit" size={14} /> Editar
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={14} /> Quitar
            </button>
          </div>
        </div>
      </div>

      {item.wishlistStatus === 'PURCHASED' ? (
        <MovePanel
          item={item}
          currency={cur}
          wardrobes={wardrobes}
          onMoved={(wardrobeId) => {
            void reloadWardrobes();
            play('success');
            toast.show(`«${item.name}» ya está en tu armario`, { tone: 'ok', icon: 'hanger' });
            navigate(`/armario?w=${wardrobeId}`);
          }}
        />
      ) : (
        <p className="wl-bought-hint" id="armario">
          ¿Ya lo tienes?{' '}
          <button type="button" className="link-btn" onClick={() => void setStatus('PURCHASED')} disabled={statusBusy}>
            Márcalo como comprado
          </button>{' '}
          y pásalo a tu armario.
        </p>
      )}

      <PricesPanel item={item} currency={cur} onChange={setItem} />

      {editing && (
        <WishForm
          item={item}
          garmentTypes={garmentTypes}
          wardrobes={wardrobes}
          defaultCurrency={cur}
          onClose={() => setEditing(false)}
          onSaved={(u) => {
            setItem(u);
            setEditing(false);
            play('success');
            toast.show('Cambios guardados', { tone: 'ok' });
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog title={`¿Quitar «${item.name}»?`} confirmLabel="Quitar" danger busy={deleting} onConfirm={() => void remove()} onClose={() => setConfirmDelete(false)}>
          Se borra de tu wishlist con su historial de precios. Los outfits en los que lo probaste lo pierden.
        </ConfirmDialog>
      )}
    </section>
  );
}

/** Historial: gráfica, apuntar un precio nuevo y borrar uno mal puesto. */
function PricesPanel({ item, currency, onChange }: { item: WishlistItem; currency: string; onChange: (i: WishlistItem) => void }) {
  const toast = useToast();
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const prices = [...item.prices].reverse();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(value.replace(',', '.'));
    if (value.trim() === '' || !Number.isFinite(n) || n < 0) {
      setError(new Error('Escribe un precio válido.'));
      play('error');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const before = num(item.currentPrice);
      const u = await wishlistApi.recordPrice(item.id, { price: n, currency, note: note.trim() || null });
      onChange(u);
      setFresh(u.prices[u.prices.length - 1]?.id ?? null);
      setValue('');
      setNote('');
      const dropped = before !== null && n < before;
      play(dropped ? 'success' : 'pop');
      toast.show(
        u.targetPrice && n <= Number(u.targetPrice) ? '¡Está en tu precio objetivo!' : dropped ? `Ha bajado ${money(before! - n, currency)}` : 'Precio apuntado',
        { tone: 'ok', icon: dropped ? 'trendDown' : 'tag' },
      );
    } catch (err) {
      setError(err);
      play('error');
    } finally {
      setBusy(false);
    }
  }

  async function removePrice(priceId: string) {
    try {
      const u = await wishlistApi.removePrice(item.id, priceId);
      onChange(u);
      play('swoosh');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'No se pudo borrar', { tone: 'danger', sound: 'error' });
    }
  }

  return (
    <section className="wl-prices" aria-labelledby="wl-prices-h">
      <header className="wl-prices-head">
        <h2 id="wl-prices-h">
          <Icon name="history" size={16} /> Historial de precios
        </h2>
        <small className="muted">Los apuntas tú cuando los ves. La app no consulta tiendas.</small>
      </header>

      <div className="wl-prices-grid">
        <div>
          {item.prices.length ? (
            <PriceChart prices={item.prices} target={num(item.targetPrice)} currency={currency} />
          ) : (
            <p className="wl-empty-chart">Todavía no hay precios. Apunta el primero cuando lo veas en una tienda.</p>
          )}
          <form className="wl-record" onSubmit={submit}>
            <label className="field">
              <span>Nuevo precio ({currency})</span>
              <input inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
            <label className="field wl-record-note">
              <span>Nota</span>
              <input maxLength={200} placeholder="Rebajas, otra tienda…" value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary btn-street" disabled={busy}>
              <Icon name="plus" size={14} /> {busy ? 'Apuntando…' : 'Apuntar precio'}
            </button>
          </form>
          <ErrorNote error={error} />
        </div>

        <ol className="wl-history">
          {prices.map((p, i) => {
            const prev = prices[i + 1];
            const diff = prev && prev.currency === p.currency ? Number(p.price) - Number(prev.price) : 0;
            return (
              <li key={p.id} className={fresh === p.id ? 'is-fresh' : ''} style={{ '--i': i } as CSSProperties}>
                <span className="wl-history-date">{new Date(p.recordedAt).toLocaleDateString(LOCALE_TAG, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <b>{money(p.price, p.currency)}</b>
                {diff !== 0 ? (
                  <span className={`wl-trend is-${diff < 0 ? 'down' : 'up'}`}>
                    {diff < 0 ? '−' : '+'}
                    {money(Math.abs(diff), p.currency)}
                  </span>
                ) : (
                  <span />
                )}
                <span className="wl-history-note">
                  {p.note ?? ''}
                  {p.source === 'TRACKER' && <em> · seguimiento</em>}
                </span>
                <button type="button" className="icon-btn" aria-label={`Borrar el precio del ${new Date(p.recordedAt).toLocaleDateString(LOCALE_TAG)}`} title="Borrar" onClick={() => void removePrice(p.id)}>
                  <Icon name="close" size={12} />
                </button>
              </li>
            );
          })}
          {item.prices.length >= 12 && <li className="wl-history-more">Se muestran los 12 últimos.</li>}
        </ol>
      </div>
    </section>
  );
}

/** Comprado → al armario, con lo que pagaste y cuándo. */
function MovePanel({
  item,
  currency,
  wardrobes,
  onMoved,
}: {
  item: WishlistItem;
  currency: string;
  wardrobes: { id: string; name: string }[];
  onMoved: (wardrobeId: string) => void;
}) {
  const [wardrobeId, setWardrobeId] = useState(item.wardrobe.id);
  const [paid, setPaid] = useState(item.currentPrice ? String(Number(item.currentPrice)) : '');
  const [date, setDate] = useState(todayKey());
  const [store, setStore] = useState(item.storeName ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = paid.trim() === '' ? undefined : Number(paid.replace(',', '.'));
    if (n !== undefined && (!Number.isFinite(n) || n < 0)) {
      setError(new Error('Escribe un precio válido.'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const moved = await wishlistApi.moveToWardrobe(item.id, { wardrobeId, purchasePrice: n, purchaseDate: date || undefined, storeName: store.trim() || null });
      onMoved(moved.wardrobe.id);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const options = wardrobes.some((w) => w.id === item.wardrobe.id) ? wardrobes : [item.wardrobe, ...wardrobes];

  return (
    <form className="wl-move" id="armario" onSubmit={submit}>
      <div className="wl-move-head">
        <span className="wl-move-icon" aria-hidden="true">
          <Icon name="hanger" size={22} />
        </span>
        <div>
          <h2>Pásalo a tu armario</h2>
          <p>Deja de estar en la wishlist y pasa a ser tuyo: lo verás en el armario, el estilista y la analítica.</p>
        </div>
      </div>
      <div className="wl-move-fields">
        <div className="field">
          <span id="wl-mw">Armario</span>
          <Select labelledBy="wl-mw" value={wardrobeId} options={options.map((w) => ({ value: w.id, label: w.name }))} onChange={setWardrobeId} />
        </div>
        <label className="field">
          <span>Lo que pagaste ({currency})</span>
          <input inputMode="decimal" value={paid} placeholder="—" onChange={(e) => setPaid(e.target.value)} />
        </label>
        <label className="field">
          <span>Fecha de compra</span>
          <input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Tienda</span>
          <input maxLength={80} value={store} onChange={(e) => setStore(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary btn-street wl-move-go" disabled={busy}>
          <Icon name="check" size={14} /> {busy ? 'Pasando…' : 'Pasar al armario'}
        </button>
      </div>
      <ErrorNote error={error} />
    </form>
  );
}
