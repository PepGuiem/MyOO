import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { WardrobeItem } from '../../api/types';
import { t } from '../../i18n';
import { colorName } from '../../lib/colors';
import { CATEGORY_LABEL, SEASON_LABEL, formatDate } from '../../lib/labels';
import { burstAt } from '../../lib/motion';
import { brandOf as sneakerBrand } from '../../lib/sneakers';
import { libraryUrl, useLibraryLoaded } from '../../three/garmentLibrary';
import { ItemView } from '../../three/ItemView';
import { libraryModel } from '../../three/libraryCatalog';
import { Icon } from '../Icon';
import { LoadingOverlay } from '../Spinner';

export type WardrobeView = 'grid' | 'compact' | 'catalog';

/** Días que una prenda lleva la etiqueta «Nueva». */
const NEW_DAYS = 7;

/** Marca de la prenda: la de sus atributos o la de su ficha de zapatilla. */
export function itemBrand(item: WardrobeItem): string | null {
  const raw = item.attributes?.brand;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (item.sneaker && (item.sneaker.brand !== 'OTHER' || item.sneaker.brandName)) return sneakerBrand(item.sneaker);
  return null;
}

export function isNewItem(item: WardrobeItem, now = Date.now()): boolean {
  return now - new Date(item.createdAt).getTime() < NEW_DAYS * 864e5;
}

/**
 * Ficha de prenda del armario, como la de una tienda: modelo 3D protagonista,
 * cinta arriba, nombre, categoría, marca y color. Los botones (favorita y
 * menú) van fuera del escenario 3D: el lienzo compartido se pinta por encima.
 *
 * Memorizada: si la página se repinta (al escribir en el buscador, abrir una
 * ficha...) y sus props no cambian, la ficha y su miniatura 3D no se repintan.
 * Para aprovecharlo, quien la usa debe pasar funciones estables.
 */
export const GarmentCard = memo(GarmentCardBase);

function GarmentCardBase({
  item,
  index,
  view,
  onOpen,
  onEdit,
  onDelete,
  onFavorite,
}: {
  item: WardrobeItem;
  index: number;
  view: WardrobeView;
  onOpen: () => void;
  /** Sin estas acciones (p. ej. en el inicio) la ficha no muestra sus botones. */
  onEdit?: () => void;
  onDelete?: () => void;
  onFavorite?: (on: boolean) => void;
}) {
  const [active, setActive] = useState(false);
  const entry = item.modelUrl ? null : libraryModel(item.garmentType.modelKey, item.attributes ?? {}, item.customization?.parts);
  const loaded = useLibraryLoaded(entry ? libraryUrl(entry, 'low') : null);
  const brand = itemBrand(item);
  const color = colorName(item.color);
  const fav = !!item.isFavorite;
  const favRef = useRef<HTMLButtonElement>(null);
  const label = `${item.name}. ${[CATEGORY_LABEL[item.garmentType.category], item.garmentType.name, brand, color].filter(Boolean).join(', ')}`;

  return (
    <article
      className={`wd-card${fav ? ' is-fav' : ''}`}
      style={{ '--i': index } as CSSProperties}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
    >
      <div className="wd-card-top">
        <span className="wd-tape" aria-hidden="true" />
        {isNewItem(item) && <span className="wd-new">{t('Nueva')}</span>}
        <span className="wd-card-tools">
          {onFavorite ? (
          <button
            ref={favRef}
            type="button"
            className={`wd-fav${fav ? ' is-on' : ''}`}
            aria-pressed={fav}
            aria-label={fav ? t('Quitar de favoritas') : t('Marcar como favorita')}
            title={fav ? t('Quitar de favoritas') : t('Marcar como favorita')}
            onClick={() => {
              if (!fav) burstAt(favRef.current, { count: 10, spread: 40 });
              onFavorite(!fav);
            }}
          >
            <Icon name="heart" size={16} />
          </button>
          ) : (
            fav && (
              <span className="wd-fav is-on is-static" title={t('Favorita')}>
                <Icon name="heart" size={16} />
              </span>
            )
          )}
          {onEdit && onDelete && <CardMenu name={item.name} onEdit={onEdit} onDelete={onDelete} />}
        </span>
      </div>

      <button
        type="button"
        className="wd-stage"
        onClick={onOpen}
        onFocus={() => setActive(true)}
        onBlur={() => setActive(false)}
        aria-label={t('Ver {name}', { name: label })}
      >
        <span className="wd-stage-floor" aria-hidden="true" />
        <ItemView className="tile-view wd-view" garment={item} active={active} />
        <LoadingOverlay show={!loaded} label="" size={22} />
      </button>

      <div className="wd-info">
        <span className="wd-cat">
          {CATEGORY_LABEL[item.garmentType.category]}
          <i aria-hidden="true">/</i>
          {item.garmentType.name}
        </span>
        <h3 className="wd-name" title={item.name}>
          {item.name}
        </h3>
        <div className="wd-meta">
          {brand && <span className="wd-brand">{brand}</span>}
          <span className="wd-color">
            <span className="wd-swatch" style={{ background: item.color }} aria-hidden="true" />
            {color}
          </span>
          {item.size && view !== 'compact' && <span className="wd-size">{t('Talla {size}', { size: item.size })}</span>}
        </div>
        {view === 'catalog' && (
          <dl className="wd-specs">
            <div>
              <dt>{t('Temporada')}</dt>
              <dd>{SEASON_LABEL[item.season]}</dd>
            </div>
            <div>
              <dt>{t('Armario')}</dt>
              <dd>{item.wardrobe.name}</dd>
            </div>
            <div>
              <dt>{t('Añadida')}</dt>
              <dd>{formatDate(item.createdAt)}</dd>
            </div>
            {item.notes && (
              <div className="wd-specs-notes">
                <dt>{t('Notas')}</dt>
                <dd>{item.notes}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </article>
  );
}

/** Menú «⋯» de la ficha: se abre en una capa por encima del lienzo 3D. */
function CardMenu({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) {
      setPos(null);
      return;
    }
    const r = btn.current.getBoundingClientRect();
    const width = 176;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width)) });
  }, [open]);

  // El menú se pinta cuando ya hay posición: entonces se enfoca su primera opción.
  const placed = open && !!pos;
  useEffect(() => {
    if (placed) menu.current?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return;
      if (e.type === 'pointerdown' && (menu.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return;
      setOpen(false);
      if (e.type === 'keydown') btn.current?.focus();
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`wd-more${open ? ' is-open' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('Opciones de {name}', { name })}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="more" size={16} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={menu} className="wd-menu" role="menu" style={{ top: pos.top, left: pos.left }}>
            <button type="button" role="menuitem" onClick={() => run(onEdit)}>
              <Icon name="edit" size={14} /> {t('Editar')}
            </button>
            <button type="button" role="menuitem" className="is-danger" onClick={() => run(onDelete)}>
              <Icon name="trash" size={14} /> {t('Eliminar')}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Esqueletos con la forma de las fichas nuevas mientras carga. */
export function GarmentCardSkeletons({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="wd-card is-skeleton" style={{ '--i': i } as CSSProperties} aria-hidden="true">
          <div className="wd-card-top" />
          <div className="wd-stage" />
          <div className="wd-info">
            <span className="skeleton-line" style={{ width: '40%' }} />
            <span className="skeleton-line" style={{ width: `${55 + ((i * 37) % 35)}%` }} />
          </div>
        </div>
      ))}
    </>
  );
}
