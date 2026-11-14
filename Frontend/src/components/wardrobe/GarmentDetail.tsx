import { useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { WardrobeItem } from '../../api/types';
import { LOCALE_TAG, t } from '../../i18n';
import { useAssetUrl } from '../../lib/assetUrl';
import { colorName } from '../../lib/colors';
import { relativeDay, toKey } from '../../lib/dates';
import { CATEGORY_LABEL, SEASON_LABEL, formatDate } from '../../lib/labels';
import { burstAt } from '../../lib/motion';
import { STYLE_TAGS } from '../../lib/stylist';
import { GarmentViewer } from '../../three/GarmentViewer';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { isNewItem, itemBrand } from './GarmentCard';

const STYLE_LABEL: Record<string, string> = Object.fromEntries(STYLE_TAGS.map((s) => [s.value, t(s.label)]));

function price(item: WardrobeItem): string | null {
  if (!item.purchasePrice) return null;
  const n = Number(item.purchasePrice);
  if (!Number.isFinite(n)) return null;
  try {
    return new Intl.NumberFormat(LOCALE_TAG, { style: 'currency', currency: item.currency ?? 'EUR' }).format(n);
  } catch {
    return `${n} ${item.currency ?? ''}`.trim();
  }
}

/**
 * Ficha ampliada de una prenda en una ventana: visor 3D (se gira
 * arrastrando), tu foto si la tiene, todos sus datos y las acciones.
 */
export function GarmentDetail({
  item,
  onClose,
  onEdit,
  onDelete,
  onFavorite,
  onAddToOutfit,
}: {
  item: WardrobeItem;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onFavorite: (on: boolean) => void;
  onAddToOutfit: () => void;
}) {
  const location = useLocation();
  const photo = useAssetUrl(item.photoAssetId);
  const picture = photo ?? item.imageUrl;
  const brand = itemBrand(item);
  const fav = !!item.isFavorite;
  const favRef = useRef<HTMLButtonElement>(null);
  const cost = price(item);
  const bought = [item.storeName, cost, item.purchaseDate ? formatDate(item.purchaseDate) : null].filter(Boolean).join(' · ');

  return (
    <Modal title={item.name} onClose={onClose} wide className="wd-detail">
      <div className="wd-detail-body">
        <div className="wd-detail-stage">
          <span className="wd-detail-glow" aria-hidden="true" />
          <GarmentViewer garment={item} />
          <p className="wd-detail-hint">
            <Icon name="refresh" size={12} /> {t('Arrastra para girar')}
          </p>
          {picture && (
            <figure className="wd-detail-photo">
              <img src={picture} alt={t('Foto de {name}', { name: item.name })} loading="lazy" referrerPolicy="no-referrer" />
              <figcaption>{t('Tu foto')}</figcaption>
            </figure>
          )}
        </div>

        <div className="wd-detail-info">
          <span className="wd-cat">
            {CATEGORY_LABEL[item.garmentType.category]}
            <i aria-hidden="true">/</i>
            {item.garmentType.name}
          </span>
          <h3 className="wd-detail-name">{item.name}</h3>
          <div className="wd-detail-tags">
            {isNewItem(item) && <span className="wd-new">{t('Nueva')}</span>}
            <button
              ref={favRef}
              type="button"
              className={`wd-fav wd-fav-wide${fav ? ' is-on' : ''}`}
              aria-pressed={fav}
              onClick={() => {
                if (!fav) burstAt(favRef.current, { count: 12, spread: 50 });
                onFavorite(!fav);
              }}
            >
              <Icon name="heart" size={15} /> {fav ? t('Favorita') : t('Marcar como favorita')}
            </button>
          </div>

          <dl className="wd-detail-facts">
            <div>
              <dt>{t('Marca')}</dt>
              <dd>{brand ?? <span className="muted">{t('Sin marca')}</span>}</dd>
            </div>
            <div>
              <dt>{t('Color')}</dt>
              <dd>
                <span className="wd-swatch" style={{ background: item.color }} aria-hidden="true" /> {colorName(item.color)}
                <small className="muted"> {item.color.toUpperCase()}</small>
              </dd>
            </div>
            <div>
              <dt>{t('Temporada')}</dt>
              <dd>{SEASON_LABEL[item.season]}</dd>
            </div>
            <div>
              <dt>{t('Talla')}</dt>
              <dd>{item.size ?? <span className="muted">—</span>}</dd>
            </div>
            <div>
              <dt>{t('Armario')}</dt>
              <dd>{item.wardrobe.name}</dd>
            </div>
            <div>
              <dt>{t('Añadida')}</dt>
              <dd>
                {formatDate(item.createdAt)} <small className="muted">({relativeDay(toKey(new Date(item.createdAt)))})</small>
              </dd>
            </div>
            {bought && (
              <div className="wd-detail-wide">
                <dt>{t('Compra')}</dt>
                <dd>{bought}</dd>
              </div>
            )}
            {item.styles.length > 0 && (
              <div className="wd-detail-wide">
                <dt>{t('Estilos')}</dt>
                <dd className="wd-detail-styles">
                  {item.styles.map((s) => (
                    <span key={s}>{STYLE_LABEL[s] ?? s}</span>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          <div className="wd-detail-notes">
            <span>{t('Notas personales')}</span>
            {item.notes ? <p>{item.notes}</p> : <p className="muted">{t('Sin notas. Puedes añadirlas al editar la prenda.')}</p>}
          </div>

          <div className="wd-detail-actions">
            <button type="button" className="btn wd-btn-neon" onClick={onAddToOutfit}>
              <Icon name="layers" size={15} /> {t('Añadir a un outfit')}
            </button>
            <button type="button" className="btn wd-btn-line" onClick={onEdit}>
              <Icon name="edit" size={14} /> {t('Editar')}
            </button>
            <Link to={`/items/${item.id}`} state={{ from: location.pathname + location.search }} className="btn wd-btn-line">
              <Icon name="external" size={14} /> {t('Ficha completa')}
            </Link>
            <button type="button" className="btn wd-btn-danger" onClick={onDelete}>
              <Icon name="trash" size={14} /> {t('Eliminar')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
