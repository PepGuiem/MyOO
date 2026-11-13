import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sneakersApi } from '../api/endpoints';
import type { Sneaker } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { ConfirmDialog } from '../components/fx/ConfirmDialog';
import { NeonScene } from '../components/fx/NeonScene';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { useAppData } from '../components/Layout';
import { ConditionDots } from '../components/sneakers/SneakerCard';
import { SneakerForm } from '../components/sneakers/SneakerForm';
import { hasPhoto, WishMedia } from '../components/wishlist/WishMedia';
import { formatDate } from '../lib/labels';
import { play } from '../lib/sfx';
import { CONDITION } from '../lib/sneakers';
import { money, num, WISH_STATUS } from '../lib/wishlist';

/** Ficha de un par: foto o 3D, datos, usos (+1 / −1), outfits y acciones. */
export function SneakerItemPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { garmentTypes, reloadWardrobes } = useAppData();
  const [s, setS] = useState<Sneaker | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [view, setView] = useState<'photo' | '3d'>('photo');
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'unlink' | null>(null);
  const [busy, setBusy] = useState(false);
  const [bump, setBump] = useState(0);

  const load = useCallback(() => {
    sneakersApi
      .get(id)
      .then((x) => {
        setS(x);
        setError(null);
      })
      .catch((e: unknown) => setError(e));
  }, [id]);
  useEffect(load, [load]);

  if (!s) {
    return (
      <section className="page snk snk-item">
        <NeonScene />
        <Link to="/sneakers" className="wl-back">
          <Icon name="back" size={14} /> Sneakers
        </Link>
        <ErrorNote error={error} />
        {!error && <SprayLoader label="Abriendo la ficha…" />}
      </section>
    );
  }

  const wish = !!s.wishlistStatus;
  const photo = hasPhoto(s);

  async function wear(delta: 1 | -1) {
    if (!s) return;
    setBusy(true);
    try {
      const u = await sneakersApi.wear(s.id, delta);
      setS(u);
      setBump((b) => b + 1);
      play(delta > 0 ? 'pop' : 'swoosh');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'No se pudo apuntar', { tone: 'danger', sound: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(keepItem: boolean) {
    if (!s) return;
    setBusy(true);
    try {
      await sneakersApi.remove(s.id, keepItem);
      play('swoosh');
      toast.show(keepItem ? 'Ficha quitada: la prenda sigue en tu armario' : `${s.sneaker.model} eliminadas`, { tone: 'danger', icon: 'trash' });
      void reloadWardrobes();
      navigate('/sneakers');
    } catch (err) {
      setBusy(false);
      setConfirm(null);
      toast.show(err instanceof Error ? err.message : 'No se pudo borrar', { tone: 'danger', sound: 'error' });
    }
  }

  const facts: [string, string][] = [
    ['Marca', s.sneaker.brandLabel],
    ['Colorway', s.sneaker.colorway ?? '—'],
    ['Talla', s.size ?? '—'],
    ['Color', s.colorName],
    ...(wish
      ? ([
          ['Estado', WISH_STATUS[s.wishlistStatus!].label],
          ['Precio visto', num(s.currentPrice) === null ? '—' : money(s.currentPrice, s.currency)],
          ['Objetivo', s.targetPrice ? money(s.targetPrice, s.currency) : '—'],
        ] as [string, string][])
      : ([
          ['Adquiridas', s.purchaseDate ? formatDate(s.purchaseDate) : '—'],
          ['Precio de compra', s.purchasePrice ? money(s.purchasePrice, s.currency) : '—'],
          ['Tienda', s.storeName ?? '—'],
          ['Armario', s.wardrobe.name],
        ] as [string, string][])),
  ];

  return (
    <section className={`page snk snk-item${wish ? ' is-wish' : ''}`} style={{ '--sw': s.color } as CSSProperties}>
      <NeonScene />
      <span className="snk-spot" aria-hidden="true" />
      <Link to="/sneakers" className="wl-back">
        <Icon name="back" size={14} /> Sneakers
      </Link>

      <div className="snk-item-grid">
        <div className="snk-item-media">
          <div className="snk-item-frame">
            <span className="snk-halo" aria-hidden="true" />
            <WishMedia key={view} item={s} active mode={photo && view === 'photo' ? 'auto' : '3d'} className="snk-item-view" />
            <span className="snk-brand-tag is-card is-big">{s.sneaker.brandLabel}</span>
            {wish && (
              <span className="snk-ribbon is-big">
                <Icon name="heart" size={12} /> Wishlist · todavía no son tuyas
              </span>
            )}
          </div>
          {photo && (
            <div className="wl-view-switch" role="group" aria-label="Ver">
              <button type="button" aria-pressed={view === 'photo'} onClick={() => setView('photo')}>
                Tu foto
              </button>
              <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>
                Modelo 3D
              </button>
            </div>
          )}
        </div>

        <div className="snk-item-info">
          <span className="fits-kicker">
            <Icon name="shoe" size={13} /> {s.sneaker.brandLabel}
          </span>
          <h1 className="snk-item-h1">{s.sneaker.model}</h1>
          <div className="snk-item-sub">
            <ConditionDots condition={s.sneaker.condition} />
            <span className="muted">{CONDITION[s.sneaker.condition].hint}</span>
          </div>

          {!wish && (
            <div className="snk-uses">
              <div className="snk-uses-num">
                <span className="wl-label">Usos</span>
                <b key={bump} className={bump ? 'is-bump' : ''}>
                  {s.uses.total}
                </b>
                <small>
                  {s.uses.manual} apuntados · {s.uses.calendar} del calendario
                </small>
              </div>
              <div className="snk-uses-btns">
                <button type="button" className="btn btn-primary btn-street" onClick={() => void wear(1)} disabled={busy}>
                  <Icon name="plus" size={14} /> 1 uso
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void wear(-1)} disabled={busy || s.uses.manual === 0} title="Quitar un uso apuntado">
                  −1
                </button>
              </div>
              <div className="snk-uses-num">
                <span className="wl-label">Outfits</span>
                <b>{s.outfitCount}</b>
                <small>con {s.partners} {s.partners === 1 ? 'prenda distinta' : 'prendas distintas'}</small>
              </div>
            </div>
          )}

          <dl className="wl-facts snk-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={k === 'Color' ? 'cap' : undefined}>
                  {k === 'Color' && <i className="snk-swatch" aria-hidden="true" />} {v}
                </dd>
              </div>
            ))}
          </dl>

          {s.notes && <p className="wl-notes">{s.notes}</p>}

          <div className="wl-item-actions">
            <Link to={`/outfits/new?with=${s.id}`} className="btn btn-street" onClick={() => play('spray')}>
              <Icon name="hanger" size={14} /> Crear outfit con estas
            </Link>
            {!wish && s.outfitCount > 0 && (
              <Link to={`/outfits?item=${s.id}`} className="btn btn-street btn-ghost">
                <Icon name="grid" size={14} /> Ver sus {s.outfitCount} outfits
              </Link>
            )}
            {wish && (
              <Link to={`/wishlist/${s.id}`} className="btn btn-street btn-ghost">
                <Icon name="tag" size={14} /> Precios y comprar
              </Link>
            )}
            <button type="button" className="btn btn-street btn-ghost" onClick={() => setEditing(true)}>
              <Icon name="edit" size={14} /> Editar
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setConfirm('delete')}>
              <Icon name="trash" size={14} /> Eliminar
            </button>
          </div>
          {!wish && (
            <button type="button" className="link-btn snk-unlink" onClick={() => setConfirm('unlink')}>
              Quitar de la colección pero dejarlas en mi armario
            </button>
          )}
        </div>
      </div>

      {editing && (
        <SneakerForm
          mode={{ kind: 'edit', sneaker: s }}
          garmentTypes={garmentTypes}
          onClose={() => setEditing(false)}
          onSaved={(u) => {
            setS(u);
            setEditing(false);
            play('success');
            toast.show('Cambios guardados', { tone: 'ok' });
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm === 'delete' ? `¿Eliminar ${s.sneaker.brandLabel} ${s.sneaker.model}?` : '¿Quitar la ficha de colección?'}
          confirmLabel={confirm === 'delete' ? 'Eliminar' : 'Quitar ficha'}
          danger={confirm === 'delete'}
          busy={busy}
          onConfirm={() => void remove(confirm === 'unlink')}
          onClose={() => setConfirm(null)}
        >
          {confirm === 'delete'
            ? 'Se borran de tu colección y de tu armario. Los outfits que las llevan las pierden. No se puede deshacer.'
            : 'Dejan de salir en la colección y en sus estadísticas, pero siguen en tu armario y en tus outfits.'}
        </ConfirmDialog>
      )}
    </section>
  );
}
