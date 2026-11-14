import { useState, type CSSProperties, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { marketApi } from '../../api/endpoints';
import type { Listing } from '../../api/types';
import { errorText } from '../../lib/apiErrors';
import { LISTING_CONDITION, LISTING_KIND, LISTING_STATUS, MARKET_ERRORS } from '../../lib/market';
import { burst } from '../../lib/motion';
import { play } from '../../lib/sfx';
import { money } from '../../lib/wishlist';
import { useToast } from '../fx/Toast';
import { Icon } from '../Icon';
import { PersonAvatar, personName } from '../social/PersonAvatar';
import { ListingMedia } from './ListingMedia';

/** Precio o «Intercambio» (con precio orientativo si lo tiene). */
export function priceLabel(l: Pick<Listing, 'kind' | 'price' | 'currency'>): string {
  if (l.kind === 'SWAP') return l.price ? `Cambio · ~${money(l.price, l.currency, { compact: true })}` : 'Intercambio';
  return money(l.price, l.currency, { compact: true });
}

/** Tarjeta de un anuncio: foto o 3D, precio, talla, ciudad y favorito. */
export function ListingCard({
  listing,
  index,
  onChange,
}: {
  listing: Listing;
  index: number;
  onChange: (l: Listing) => void;
}) {
  const toast = useToast();
  const [active, setActive] = useState(false);
  const [pulse, setPulse] = useState(0);
  const l = listing;

  async function toggleFavorite(e: MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    const on = !l.isFavorite;
    const rect = e.currentTarget.getBoundingClientRect();
    // Se marca al momento y se deshace si falla.
    onChange({ ...l, isFavorite: on, favorites: l.favorites + (on ? 1 : -1) });
    if (on) {
      setPulse((p) => p + 1);
      burst(rect.left + rect.width / 2, rect.top + rect.height / 2, { count: 10, spread: 34 });
      play('pop');
    }
    try {
      const r = await marketApi.favorite(l.id, on);
      onChange({ ...l, isFavorite: r.isFavorite, favorites: r.favorites });
    } catch (err) {
      onChange(l);
      toast.show(errorText(err, MARKET_ERRORS, 'No se pudo guardar'), { tone: 'danger', sound: 'error' });
    }
  }

  const off = l.status !== 'ACTIVE';
  return (
    <Link
      to={`/market/${l.id}`}
      className={`mk-card is-${l.kind.toLowerCase()}${off ? ` is-${l.status.toLowerCase()}` : ''}`}
      style={{ '--i': Math.min(index, 12) } as CSSProperties}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div className="mk-card-media">
        <ListingMedia listing={l} active={active} />
        <span className={`mk-kind is-${l.kind.toLowerCase()}`}>
          <Icon name={LISTING_KIND[l.kind].icon} size={12} /> {LISTING_KIND[l.kind].short}
        </span>
        {off && <span className="mk-ribbon">{LISTING_STATUS[l.status].label}</span>}
        {!l.isMine && (
          <button
            type="button"
            className={`mk-fav${l.isFavorite ? ' is-on' : ''}`}
            aria-pressed={l.isFavorite}
            aria-label={l.isFavorite ? 'Quitar de guardados' : 'Guardar'}
            onClick={(e) => void toggleFavorite(e)}
          >
            <Icon key={pulse} name="heart" size={16} />
          </button>
        )}
        {l.photos.length > 1 && (
          <span className="mk-count" aria-label={`${l.photos.length} fotos`}>
            1/{l.photos.length}
          </span>
        )}
      </div>
      <div className="mk-card-body">
        <b className="mk-price">{priceLabel(l)}</b>
        <span className="mk-title">{l.title}</span>
        <span className="mk-meta">
          {[l.brand, l.size && `Talla ${l.size}`, LISTING_CONDITION[l.condition].label].filter(Boolean).join(' · ')}
        </span>
        <span className="mk-foot">
          <PersonAvatar person={l.seller} size={20} />
          <span className="mk-seller">{l.isMine ? 'Tu anuncio' : personName(l.seller)}</span>
          {l.city && (
            <span className="mk-city">
              <Icon name="pin" size={11} /> {l.city}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}
