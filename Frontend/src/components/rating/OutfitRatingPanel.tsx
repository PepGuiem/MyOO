import { useState, type CSSProperties } from 'react';
import type { OutfitStyle, RatingEntry, RatingResult, RatingTip } from '../../api/types';
import { formatDate } from '../../lib/labels';
import { OUTFIT_STYLES } from '../../lib/outfitStyles';
import { CATEGORIES, TRIGGER_LABEL, barTone, tierOf } from '../../lib/rating';
import { Icon } from '../Icon';
import { RatingGauge, TierBadge } from './RatingGauge';

/**
 * Sección «OUTFIT RATING»: nota de 0 a 100 con su dial, el desglose de las
 * cuatro categorías (se abren para ver cada regla), comentarios, consejos
 * (los concretos se pueden probar en el maniquí), insignias e historial.
 */
export function OutfitRatingPanel({
  result,
  loading,
  live,
  stale,
  history,
  onRecalc,
  recalcBusy,
  onApplyTip,
  canApply,
  declaredStyle,
}: {
  result: RatingResult | null;
  loading: boolean;
  /** La nota es de lo que tienes puesto ahora (sin guardar). */
  live: boolean;
  /** La nota guardada ya no corresponde a las prendas actuales. */
  stale?: boolean;
  history?: RatingEntry[];
  onRecalc?: () => void;
  recalcBusy?: boolean;
  onApplyTip?: (tip: RatingTip) => void;
  /** Si el consejo se puede probar (sus prendas siguen existiendo). */
  canApply?: (tip: RatingTip) => boolean;
  /** Estilo marcado en el outfit (si lo hay, no se enseña el detectado). */
  declaredStyle?: OutfitStyle | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const total = result?.total ?? null;

  return (
    <section className={`rating-panel${loading ? ' is-loading' : ''}`} aria-label="Outfit rating" aria-busy={loading}>
      <header className="rating-head">
        <h2 className="rating-title">
          Outfit <span>Rating</span>
        </h2>
        <span className={`rating-state${live ? ' is-live' : ''}${stale ? ' is-stale' : ''}`}>
          {stale ? 'Desactualizada' : live ? 'En directo' : 'Guardada'}
        </span>
      </header>

      <div className="rating-hero">
        <RatingGauge value={total} loading={loading} />
        <div className="rating-hero-info">
          {result && total !== null && result.total > 0 ? (
            <>
              <TierBadge score={total} />
              <p className="rating-range">
                {tierOf(total).min}–{tierOf(total).max} puntos
              </p>
              <ul className="rating-badges" aria-label="Insignias">
                {result.badges
                  .filter((b) => b.code !== result.tier)
                  .map((b, i) => (
                    <li key={b.code} style={{ '--i': i } as CSSProperties}>
                      <Icon name="spark" size={11} /> {b.label}
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p className="muted small">{loading ? 'Analizando las prendas…' : 'Ponle prendas al maniquí para ver la nota.'}</p>
          )}
          {result?.detectedStyle && !declaredStyle && (
            <p className="rating-detected">
              Parece <b>{OUTFIT_STYLES[result.detectedStyle].label}</b>
            </p>
          )}
        </div>
      </div>

      {stale && (
        <p className="rating-stale">
          <Icon name="refresh" size={13} /> Ha cambiado alguna prenda desde la última nota.
        </p>
      )}

      <ol className="rating-cats">
        {CATEGORIES.map((c, i) => {
          const cat = result?.categories[c.key];
          const score = cat?.score ?? 0;
          const isOpen = open === c.key;
          return (
            <li key={c.key} className={`rating-cat is-${barTone(score)}${isOpen ? ' is-open' : ''}`} style={{ '--i': i } as CSSProperties}>
              <button type="button" className="rating-cat-row" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.key)} disabled={!cat}>
                <Icon name={c.icon} size={15} />
                <span className="rating-cat-label">{c.label}</span>
                <span className="rating-cat-score">
                  <b>{cat ? score : '–'}</b>/25
                </span>
                <span className="rating-bar" aria-hidden="true">
                  <span style={{ width: `${(score / 25) * 100}%` }} />
                </span>
              </button>
              {isOpen && cat && (
                <ul className="rating-checks">
                  {cat.checks.map((k, j) => (
                    <li key={`${k.code}-${j}`} className={k.points > 0 ? 'is-plus' : k.points < 0 ? 'is-minus' : 'is-info'}>
                      <span className="pts">{k.points > 0 ? `+${Math.round(k.points * 10) / 10}` : k.points < 0 ? Math.round(k.points * 10) / 10 : '·'}</span>
                      {k.text}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {result && result.comments.length > 0 && (
        <div className="rating-block">
          <h3>Comentarios</h3>
          <ul className="rating-comments">
            {result.comments.map((t, i) => (
              <li key={i} style={{ '--i': i } as CSSProperties}>
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && result.tips.length > 0 && (
        <div className="rating-block">
          <h3>Para subir la nota</h3>
          <ul className="rating-tips">
            {result.tips.map((t, i) => {
              const applicable = !!t.action && !!onApplyTip && (canApply?.(t) ?? true);
              return (
                <li key={`${t.code}-${i}`} style={{ '--i': i } as CSSProperties}>
                  {t.gain ? <span className="tip-gain">+{t.gain}</span> : <Icon name="bulb" size={14} />}
                  <span className="tip-text">{t.text}</span>
                  {applicable && (
                    <button type="button" className="tip-try" onClick={() => onApplyTip?.(t)}>
                      Probar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {history && history.length > 0 && <RatingHistory history={history} />}

      <footer className="rating-foot">
        <span className="rating-engine" title="Motor que calcula la nota">
          Motor: {result?.engine ?? 'rules@1'} · reglas propias
        </span>
        {onRecalc && (
          <button type="button" className="btn btn-street btn-ghost rating-recalc" onClick={onRecalc} disabled={recalcBusy}>
            <Icon name="refresh" size={14} className={recalcBusy ? 'spin' : ''} /> {recalcBusy ? 'Calculando…' : 'Recalcular'}
          </button>
        )}
      </footer>
    </section>
  );
}

/** Historial: línea con las notas guardadas y las últimas filas. */
export function RatingHistory({ history }: { history: RatingEntry[] }) {
  const pts = [...history].reverse();
  const w = 260;
  const h = 56;
  const x = (i: number) => (pts.length === 1 ? w / 2 : 6 + (i / (pts.length - 1)) * (w - 12));
  const y = (v: number) => h - 6 - (v / 100) * (h - 12);
  return (
    <div className="rating-block rating-history">
      <h3>
        <Icon name="history" size={14} /> Historial
      </h3>
      <svg viewBox={`0 0 ${w} ${h}`} className="history-chart" preserveAspectRatio="none" role="img" aria-label="Evolución de la nota">
        {[40, 60, 80].map((v) => (
          <line key={v} x1="0" x2={w} y1={y(v)} y2={y(v)} className="history-grid" />
        ))}
        {pts.length > 1 && <polyline className="history-line" points={pts.map((p, i) => `${x(i)},${y(p.total)}`).join(' ')} />}
        {pts.map((p, i) => (
          <circle key={p.id} cx={x(i)} cy={y(p.total)} r="3.2" className="history-dot" style={{ fill: tierOf(p.total).color }}>
            <title>
              {p.total}/100 · {formatDate(p.createdAt)}
            </title>
          </circle>
        ))}
      </svg>
      <ol className="history-list">
        {history.slice(0, 5).map((p, i) => {
          const prev = history[i + 1];
          const diff = prev ? p.total - prev.total : 0;
          return (
            <li key={p.id}>
              <b style={{ color: tierOf(p.total).color }}>{p.total}</b>
              {diff !== 0 && <span className={diff > 0 ? 'up' : 'down'}>{diff > 0 ? `▲${diff}` : `▼${-diff}`}</span>}
              <span className="muted">{TRIGGER_LABEL[p.trigger]}</span>
              <time dateTime={p.createdAt}>{formatDate(p.createdAt)}</time>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
