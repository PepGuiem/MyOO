import { useState, type CSSProperties } from 'react';
import type { WardrobeItem } from '../api/types';
import { libraryUrl, useLibraryLoaded } from '../three/garmentLibrary';
import { ItemView } from '../three/ItemView';
import { libraryModel } from '../three/libraryCatalog';
import { LoadingOverlay } from './Spinner';

/** Ficha de prenda: modelo 3D (gira al pasar el ratón) + nombre. */
/** `index`: posición dentro de su tanda, para que entren una detrás de otra. */
export function ItemTile({ item, onOpen, index = 0 }: { item: WardrobeItem; onOpen: () => void; index?: number }) {
  const [active, setActive] = useState(false);
  const nDetails = item.customization?.details?.length ?? 0;
  const meta = [item.garmentType.name, item.size ? `talla ${item.size}` : null, nDetails ? `${nDetails} ${nDetails === 1 ? 'detalle' : 'detalles'}` : null]
    .filter(Boolean)
    .join(', ');
  // Mientras llega el modelo 3D de la miniatura, el icono de carga
  const entry = item.modelUrl ? null : libraryModel(item.garmentType.modelKey, item.attributes ?? {}, item.customization?.parts);
  const loaded = useLibraryLoaded(entry ? libraryUrl(entry, 'low') : null);

  return (
    <div
      className="tile tile-in"
      style={{ '--i': index } as CSSProperties}
      role="button"
      tabIndex={0}
      aria-label={`${item.name}. ${meta}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <div className="tile-stage">
        <ItemView className="tile-view" garment={item} active={active} />
        <LoadingOverlay show={!loaded} label="" size={24} />
      </div>
      <div className="tile-caption">
        <span className="swatch" style={{ background: item.color }} aria-hidden="true" />
        <span className="tile-name">{item.name}</span>
      </div>
      <span className="tile-meta">{meta}</span>
    </div>
  );
}
