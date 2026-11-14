import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { reducedMotion } from '../../lib/motion';
import { stylistApi } from '../../api/endpoints';
import type { StylistAlternatives, StylistContext, StylistItem } from '../../api/types';
import { t } from '../../i18n';
import { colorName } from '../../lib/colors';
import { CATEGORY_LABEL } from '../../lib/labels';
import { ItemView } from '../../three/ItemView';
import { ErrorNote } from '../ErrorNote';
import { Icon } from '../Icon';
import { Busy } from '../Spinner';

/**
 * Selector visual para cambiar una prenda del outfit: las alternativas del
 * armario (las que propone el motor para ese hueco), con su miniatura 3D.
 * Al elegir una se ve puesta en el maniquí; el cambio se aplica al confirmar.
 * Sin desplazamiento interno: las miniaturas 3D se pintan en el lienzo
 * compartido y no se recortarían.
 */
export function SwapTray({
  ctx,
  ids,
  from,
  preview,
  onItems,
  onPreview,
  onConfirm,
  onCancel,
  onRemove,
}: {
  ctx: StylistContext;
  ids: string[];
  from: StylistItem;
  preview: string | null;
  onItems: (m: Record<string, StylistItem>) => void;
  onPreview: (id: string | null) => void;
  onConfirm: (id: string) => void;
  onCancel: () => void;
  onRemove?: () => void;
}) {
  const [data, setData] = useState<StylistAlternatives | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [hover, setHover] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  // El probador se abre bajo el escenario: se lleva a la vista.
  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  }, [from.id]);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    stylistApi
      .alternatives({ ...ctx, itemIds: ids, replaceItemId: from.id })
      .then((res) => {
        if (!alive) return;
        onItems(res.items);
        setData(res);
      })
      .catch((err) => alive && setError(err));
    return () => {
      alive = false;
    };
    // Solo al cambiar de prenda a sustituir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.id]);

  const list = (data?.alternatives ?? []).slice(0, 8);
  const best = list[0]?.score ?? 1;

  return (
    <section ref={ref} className="st-tray" aria-labelledby="st-tray-title">
      <header className="st-tray-head">
        <div>
          <p className="st-eyebrow">{t('Probador')}</p>
          <h3 id="st-tray-title">{t('Cambiar «{name}» por…', { name: from.name })}</h3>
        </div>
        <button type="button" className="st-icon-btn" onClick={onCancel} aria-label={t('Cerrar el probador')}>
          <Icon name="close" size={15} />
        </button>
      </header>

      {!data && !error && (
        <p className="muted small st-tray-loading">
          <Busy text={t('Buscando en tu armario…')} />
        </p>
      )}
      <ErrorNote error={error} />
      {data && list.length === 0 && <p className="muted small">{t('No tienes otra prenda para este hueco.')}</p>}

      {list.length > 0 && (
        <ul className="st-tray-grid">
          {list.map((a, i) => {
            const it = data?.items[a.itemId];
            if (!it) return null;
            const on = preview === a.itemId;
            return (
              <li key={a.itemId} style={{ '--i': i } as CSSProperties}>
                <button
                  type="button"
                  className={`st-cand${on ? ' is-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => onPreview(on ? null : a.itemId)}
                  onMouseEnter={() => setHover(a.itemId)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span className="st-cand-stage">
                    <ItemView className="tile-view" garment={it} active={hover === a.itemId || on} />
                  </span>
                  <span className="st-cand-info">
                    <small>{CATEGORY_LABEL[it.garmentType.category]}</small>
                    <strong>{it.name}</strong>
                    <span className="st-cand-color">
                      <span className="st-dot" style={{ background: it.color }} aria-hidden="true" /> {colorName(it.color)}
                    </span>
                    <span className="st-cand-fit" title={t('Encaje con el resto del outfit')}>
                      <i style={{ width: `${Math.max(12, Math.min(100, (a.score / best) * 100))}%` }} />
                    </span>
                    <em>{a.reason}</em>
                  </span>
                  {on && (
                    <span className="st-cand-badge">
                      <Icon name="eye" size={12} /> {t('Probándotela')}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="st-tray-foot">
        <button type="button" className="btn st-btn-neon" disabled={!preview} onClick={() => preview && onConfirm(preview)}>
          <Icon name="check" size={14} /> {t('Confirmar cambio')}
        </button>
        <button type="button" className="btn st-btn-line" onClick={onCancel}>
          {t('Cancelar')}
        </button>
        {onRemove && (
          <button type="button" className="btn st-btn-line st-btn-quiet" onClick={onRemove}>
            <Icon name="trash" size={13} /> {t('Quitarla del outfit')}
          </button>
        )}
      </footer>
    </section>
  );
}
