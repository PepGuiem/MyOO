import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ratingsApi } from '../../api/endpoints';
import type { RatingComparison } from '../../api/types';
import { OUTFIT_STYLES } from '../../lib/outfitStyles';
import { CATEGORIES } from '../../lib/rating';
import { ErrorNote } from '../ErrorNote';
import { SprayLoader } from '../fx/SprayLoader';
import { Icon } from '../Icon';
import { RatingGauge, TierBadge } from './RatingGauge';

/**
 * Comparativa de 2 a 4 outfits: la nota de cada uno, el desglose por
 * categorías con el ganador de cada una marcado y el ganador final.
 */
export function CompareDialog({ ids, onClose, onOpen }: { ids: string[]; onClose: () => void; onOpen: (id: string) => void }) {
  const [data, setData] = useState<RatingComparison | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let alive = true;
    ratingsApi
      .compare(ids)
      .then((d) => alive && setData(d))
      .catch((e: unknown) => alive && setError(e));
    return () => {
      alive = false;
    };
  }, [ids]);

  const close = () => {
    setLeaving(true);
    window.setTimeout(onClose, 200);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  });

  const winner = data && data.winners.total.length === 1 ? data.outfits.find((o) => o.id === data.winners.total[0]) : null;

  return createPortal(
    <div className={`fx-overlay${leaving ? ' is-leaving' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="fx-dialog compare-dialog" role="dialog" aria-modal="true" aria-label="Comparar outfits">
        <span className="fx-dialog-tape" aria-hidden="true" />
        <button type="button" className="icon-btn compare-close" onClick={close} aria-label="Cerrar">
          <Icon name="close" />
        </button>
        <h2>
          <Icon name="compare" size={20} /> Cara a cara
        </h2>
        {winner ? (
          <p className="compare-winner">
            <Icon name="crown" size={16} /> Gana <b>«{winner.name}»</b> con {winner.rating.total} puntos
          </p>
        ) : data ? (
          <p className="compare-winner is-tie">Empate en la nota final</p>
        ) : null}
        <ErrorNote error={error} />
        {!data && !error && <SprayLoader label="Comparando…" />}
        {data && (
          <div className="compare-grid" style={{ '--cols': data.outfits.length } as CSSProperties}>
            {data.outfits.map((o, i) => {
              const wins = data.winners.total.includes(o.id);
              return (
                <article key={o.id} className={`compare-col${wins ? ' is-winner' : ''}`} style={{ '--i': i } as CSSProperties}>
                  {wins && <span className="compare-crown" aria-label="Ganador">♛</span>}
                  <RatingGauge value={o.rating.total} size={112} />
                  <TierBadge score={o.rating.total} />
                  <h3 title={o.name}>{o.name}</h3>
                  {o.style && <span className="muted small">{OUTFIT_STYLES[o.style].label}</span>}
                  <ul className="compare-cats">
                    {CATEGORIES.map((c) => {
                      const v = o.rating[c.key];
                      const best = data.winners[c.key].includes(o.id);
                      return (
                        <li key={c.key} className={best ? 'is-best' : ''}>
                          <span className="compare-cat-label">
                            <Icon name={c.icon} size={13} /> {c.label}
                          </span>
                          <span className="rating-bar" aria-hidden="true">
                            <span style={{ width: `${(v / 25) * 100}%` }} />
                          </span>
                          <b>{v}</b>
                        </li>
                      );
                    })}
                  </ul>
                  {o.stale && <p className="rating-stale small">Nota desactualizada</p>}
                  {o.comments[1] && <p className="compare-comment">{o.comments[1]}</p>}
                  <button type="button" className="btn btn-street btn-ghost" onClick={() => onOpen(o.id)}>
                    Abrir <Icon name="forward" size={13} />
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
