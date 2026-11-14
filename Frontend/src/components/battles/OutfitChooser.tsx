import { useEffect, useMemo, useState } from 'react';
import { outfitsApi } from '../../api/endpoints';
import type { Outfit } from '../../api/types';
import { useBodyShape } from '../../lib/bodyPref';
import { play } from '../../lib/sfx';
import { OutfitView } from '../../three/OutfitMannequin';
import { ErrorNote } from '../ErrorNote';
import { Icon } from '../Icon';
import { Spinner } from '../Spinner';

/**
 * Elige uno de tus outfits para una batalla. Se ve en 3D el que tienes
 * señalado; el resto, en lista.
 */
export function OutfitChooser({ value, onChange }: { value: string | null; onChange: (o: Outfit) => void }) {
  const [outfits, setOutfits] = useState<Outfit[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const { shape } = useBodyShape();
  useEffect(() => {
    outfitsApi
      .list(1, 48)
      .then((r) => setOutfits(r.data.filter((o) => o.items.length > 0 && !o.hiddenByAdmin)))
      .catch(setError);
  }, []);
  const picked = outfits?.find((o) => o.id === value) ?? null;
  const garments = useMemo(() => picked?.items.map((i) => ({ ...i.wardrobeItem, styling: i.styling })) ?? [], [picked]);

  if (error) return <ErrorNote error={error} />;
  if (!outfits) return <Spinner label="Cargando tus outfits…" />;
  if (outfits.length === 0) return <p className="muted">Aún no tienes outfits con prendas. Crea uno en Outfits y vuelve.</p>;
  return (
    <div className="bt-chooser">
      <div className="bt-chooser-stage">
        {picked ? (
          <OutfitView className="tile-view" garments={garments} shape={shape} active distance={4.4} />
        ) : (
          <span className="bt-chooser-empty">
            <Icon name="hanger" size={34} />
            <small>Elige tu outfit</small>
          </span>
        )}
      </div>
      <ul className="bt-chooser-list" role="listbox" aria-label="Tus outfits">
        {outfits.map((o) => (
          <li key={o.id}>
            <button
              type="button"
              role="option"
              aria-selected={o.id === value}
              className={`picker-item${o.id === value ? ' is-active' : ''}`}
              onClick={() => {
                play('click');
                onChange(o);
              }}
            >
              <Icon name="hanger" size={16} />
              <span className="person-text">
                <strong>{o.name}</strong>
                <small className="muted">{o.items.map((i) => i.wardrobeItem.name).join(' · ')}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
