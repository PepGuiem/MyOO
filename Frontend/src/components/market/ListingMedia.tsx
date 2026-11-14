import { useEffect, useState } from 'react';
import { marketApi } from '../../api/endpoints';
import type { Listing } from '../../api/types';
import { WISH_CATEGORY } from '../../lib/wishlist';
import { ItemView } from '../../three/ItemView';
import { Icon } from '../Icon';

/**
 * Fotos de anuncios como URL blob:. Necesitan el token, así que se descargan
 * una vez por (anuncio, foto) y se guardan en memoria.
 */
const cache = new Map<string, Promise<string | null>>();

export function useListingPhoto(listingId: string, assetId: string | null | undefined): string | null {
  const key = assetId ? `${listingId}:${assetId}` : null;
  const [state, setState] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!key || !assetId) return;
    let p = cache.get(key);
    if (!p) {
      p = marketApi
        .photo(listingId, assetId)
        .then((b) => URL.createObjectURL(b))
        .catch(() => null);
      cache.set(key, p);
    }
    let alive = true;
    void p.then((url) => alive && setState({ key, url }));
    return () => {
      alive = false;
    };
  }, [key, listingId, assetId]);
  return key && state?.key === key ? state.url : null;
}

/**
 * Imagen de un anuncio: su foto o, si no tiene, el modelo 3D de la prenda de
 * la que salió; si se creó a mano sin fotos, el icono de su categoría.
 * El 3D va en el lienzo compartido (por encima del contenido): o una cosa o la otra.
 */
export function ListingMedia({
  listing,
  photo = 0,
  active,
  mode = 'auto',
  className = '',
}: {
  listing: Listing;
  photo?: number;
  active: boolean;
  mode?: 'auto' | '3d';
  className?: string;
}) {
  const assetId = listing.photos[photo] ?? null;
  const url = useListingPhoto(listing.id, mode === 'auto' ? assetId : null);
  if (mode === 'auto' && assetId) {
    return (
      <div className={`mk-media is-photo ${className}`}>
        {url ? <img src={url} alt={listing.title} loading="lazy" /> : <span className="mk-media-wait" aria-hidden="true" />}
      </div>
    );
  }
  if (listing.garment) {
    return (
      <div className={`mk-media is-3d ${className}`}>
        <ItemView className="mk-3d-view" garment={listing.garment} active={active} />
      </div>
    );
  }
  return (
    <div className={`mk-media is-empty ${className}`}>
      <Icon name={WISH_CATEGORY[listing.category].icon} size={56} />
    </div>
  );
}
