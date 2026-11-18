import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { sneakersApi } from '../api/endpoints';
import type { Sneaker } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { ConfirmDialog } from '../components/fx/ConfirmDialog';
import { SprayLoader } from '../components/fx/SprayLoader';
import { useToast } from '../components/fx/Toast';
import { Icon } from '../components/Icon';
import { useAppData } from '../components/Layout';
import { ConditionDots } from '../components/sneakers/SneakerCard';
import { SneakerForm } from '../components/sneakers/SneakerForm';
import { hasPhoto, WishMedia } from '../components/wishlist/WishMedia';
import { formatDate } from '../lib/labels';
import { play } from '../lib/sfx';
import { FEATURES } from '../lib/features';
import { CONDITION } from '../lib/sneakers';
import { money, num, WISH_STATUS } from '../lib/wishlist';
import { t } from '../i18n';

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
      <section className="page snk snk-item ux sk">
        <Link to="/sneakers" className="wl-back">
          <Icon name="back" size={14} /> {t('Sneakers')}
        </Link>
        <ErrorNote error={error} />
        {!error && <SprayLoader label={t('Abriendo la ficha…')} />}
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
      toast.show(err instanceof Error ? err.message : t('No se pudo apuntar'), { tone: 'danger', sound: 'error' });
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
      toast.show(keepItem ? t('Ficha quitada: la prenda sigue en tu armario') : `${s.sneaker.model} eliminadas`, { tone: 'danger', icon: 'trash' });
      void reloadWardrobes();
      navigate('/sneakers');
    } catch (err) {
      setBusy(false);
      setConfirm(null);
      toast.show(err instanceof Error ? err.message : t('No se pudo borrar'), { tone: 'danger', sound: 'error' });
    }
  }

  const facts: [string, string][] = [
    [t('Marca'), s.sneaker.brandLabel],
    [t('Colorway'), s.sneaker.colorway ?? '—'],
    [t('Talla'), s.size ?? '—'],
    [t('Color'), s.colorName],
    ...(wish
      ? ([
          [t('Estado'), WISH_STATUS[s.wishlistStatus!].label],
          [t('Precio visto'), num(s.currentPrice) === null ? '—' : money(s.currentPrice, s.currency)],
          [t('Objetivo'), s.targetPrice ? money(s.targetPrice, s.currency) : '—'],
        ] as [string, string][])
      : ([
          [t('Adquiridas'), s.purchaseDate ? formatDate(s.purchaseDate) : '—'],
          [t('Precio de compra'), s.purchasePrice ? money(s.purchasePrice, s.currency) : '—'],
          [t('Tienda'), s.storeName ?? '—'],
          [t('Armario'), s.wardrobe.name],
        ] as [string, string][])),
  ];

  return (
    <section className={`page snk snk-item ux sk${wish ? ' is-wish' : ''}`} style={{ '--sw': s.color } as CSSProperties}>
      <span className="snk-spot" aria-hidden="true" />
      <Link to="/sneakers" className="wl-back">
        <Icon name="back" size={14} /> {t('Sneakers')}
      </Link>

      <div className="snk-item-grid">
        <div className="snk-item-media">
          <div className="snk-item-frame">
            <span className="snk-halo" aria-hidden="true" />
            <WishMedia key={view} item={s} active mode={photo && view === 'photo' ? 'auto' : '3d'} className="snk-item-view" />
            <span className="snk-brand-tag is-card is-big">{s.sneaker.brandLabel}</span>
            {wish && (
              <span className="snk-ribbon is-big">
                <Icon name="heart" size={12} /> {t('Wishlist · todavía no son tuyas')}
              </span>
            )}
          </div>
          {photo && (
            <div className="wl-view-switch" role="group" aria-label={t('Ver')}>
              <button type="button" aria-pressed={view === 'photo'} onClick={() => setView('photo')}>
                {t('Tu foto')}
              </button>
              <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>
                {t('Modelo 3D')}
              </button>
            </div>
          )}
        </div>

        <div className="snk-item-info">
          <span className="wd-kicker">
            <Icon name="shoe" size={12} /> {wish ? t('On my wishlist') : t('In my rotation')}
          </span>
          <h1 className="wd-title ux-title" data-text={s.sneaker.model}>
            {s.sneaker.model}
          </h1>
          <p className="ux-lede sc-path">{s.sneaker.brandLabel}</p>
          <div className="snk-item-sub">
            <ConditionDots condition={s.sneaker.condition} />
            <span className="muted">{CONDITION[s.sneaker.condition].hint}</span>
          </div>

          {!wish && (
            <div className="snk-uses">
              <div className="snk-uses-num">
                <span className="wl-label">{t('Usos')}</span>
                <b key={bump} className={bump ? 'is-bump' : ''}>
                  {s.uses.total}
                </b>
                <small>
                  {t('{manual} apuntados · {calendar} del calendario', { manual: s.uses.manual, calendar: s.uses.calendar })}
                </small>
              </div>
              <div className="snk-uses-btns">
                <button type="button" className="btn wd-add" onClick={() => void wear(1)} disabled={busy}>
                  <Icon name="plus" size={14} /> <span>{t('1 uso')}</span>
                </button>
                <button type="button" className="btn wd-btn-line" onClick={() => void wear(-1)} disabled={busy || s.uses.manual === 0} title={t('Quitar un uso apuntado')}>
                  −1
                </button>
              </div>
              <div className="snk-uses-num">
                <span className="wl-label">{t('Outfits')}</span>
                <b>{s.outfitCount}</b>
                <small>{t('con {partners} {v}', { partners: s.partners, v: s.partners === 1 ? t('prenda distinta') : t('prendas distintas') })}</small>
              </div>
            </div>
          )}

          <dl className="wl-facts snk-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={k === t('Color') ? 'cap' : undefined}>
                  {k === t('Color') && <i className="snk-swatch" aria-hidden="true" />} {v}
                </dd>
              </div>
            ))}
          </dl>

          {s.notes && <p className="wl-notes">{s.notes}</p>}

          <div className="wl-item-actions">
            <Link to={`/outfits/new?with=${s.id}`} className="btn wd-add" onClick={() => play('spray')}>
              <Icon name="hanger" size={14} /> <span>{t('Crear outfit con estas')}</span>
            </Link>
            {!wish && s.outfitCount > 0 && (
              <Link to={`/outfits?item=${s.id}`} className="btn wd-btn-line">
                <Icon name="grid" size={14} /> {t('Ver sus {outfitCount} outfits', { outfitCount: s.outfitCount })}
              </Link>
            )}
            {FEATURES.market && !wish && (
              <Link to={`/market?sell=${s.id}`} className="btn wd-btn-line">
                <Icon name="store" size={14} /> {t('Vender')}
              </Link>
            )}
            {wish && (
              <Link to={`/wishlist/${s.id}`} className="btn wd-btn-line">
                <Icon name="tag" size={14} /> {t('Precios y comprar')}
              </Link>
            )}
            <button type="button" className="btn wd-btn-line" onClick={() => setEditing(true)}>
              <Icon name="edit" size={14} /> {t('Editar')}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setConfirm('delete')}>
              <Icon name="trash" size={14} /> {t('Eliminar')}
            </button>
          </div>
          {!wish && (
            <button type="button" className="link-btn snk-unlink" onClick={() => setConfirm('unlink')}>
              {t('Quitar de la colección pero dejarlas en mi armario')}
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
            toast.show(t('Cambios guardados'), { tone: 'ok' });
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm === 'delete' ? t('¿Eliminar {brandLabel} {model}?', { brandLabel: s.sneaker.brandLabel, model: s.sneaker.model }) : t('¿Quitar la ficha de colección?')}
          confirmLabel={confirm === 'delete' ? t('Eliminar') : t('Quitar ficha')}
          danger={confirm === 'delete'}
          busy={busy}
          onConfirm={() => void remove(confirm === 'unlink')}
          onClose={() => setConfirm(null)}
        >
          {confirm === 'delete'
            ? t('Se borran de tu colección y de tu armario. Los outfits que las llevan las pierden. No se puede deshacer.')
            : t('Dejan de salir en la colección y en sus estadísticas, pero siguen en tu armario y en tus outfits.')}
        </ConfirmDialog>
      )}
    </section>
  );
}
