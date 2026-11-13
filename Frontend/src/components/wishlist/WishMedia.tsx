import { useState } from 'react';
import type { GarmentLike } from '../../api/types';
import { useAssetUrl } from '../../lib/assetUrl';
import { ItemView } from '../../three/ItemView';

/** Lo que hace falta para pintarla: su 3D, su nombre y su foto (si hay). */
export type MediaItem = GarmentLike & { name: string; imageUrl: string | null; photoAssetId?: string | null };

/**
 * Imagen de una prenda (deseo o zapatilla): tu foto (subida o enlazada) o, si no hay, su modelo 3D
 * (gira al pasar el ratón). `mode="3d"` fuerza el modelo aunque haya foto.
 * Ojo: el 3D se pinta en el lienzo compartido, que queda por encima del
 * contenido, así que no se monta debajo de la foto: es una cosa o la otra.
 */
export function WishMedia({ item, active, className = '', mode = 'auto' }: { item: MediaItem; active: boolean; className?: string; mode?: 'auto' | '3d' }) {
  const assetUrl = useAssetUrl(item.photoAssetId);
  const [broken, setBroken] = useState<string | null>(null);
  const external = item.imageUrl && broken !== item.imageUrl ? item.imageUrl : null;
  const photo = item.photoAssetId ? assetUrl : external;
  const waitingPhoto = !!item.photoAssetId && !assetUrl;

  if (mode === 'auto' && (photo || waitingPhoto)) {
    return (
      <div className={`wl-photo ${className}`}>
        {photo && (
          <img
            src={photo}
            alt={item.name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => item.imageUrl && photo === item.imageUrl && setBroken(item.imageUrl)}
          />
        )}
      </div>
    );
  }
  return (
    <div className={`wl-3d ${className}`}>
      <ItemView className="wl-3d-view" garment={item} active={active} />
    </div>
  );
}

export function hasPhoto(item: Pick<MediaItem, 'photoAssetId' | 'imageUrl'>): boolean {
  return !!(item.photoAssetId || item.imageUrl);
}
