import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { prefersReducedMotion } from '../street/Street';
import { TIERS, tierOf } from '../../lib/rating';

/** Número que va del valor anterior al nuevo con un ease. */
function useTween(value: number, duration = 1100): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const from = useRef(prefersReducedMotion() ? value : 0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      from.current = value;
      return;
    }
    let raf = 0;
    const a = from.current;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 4;
      const v = a + (value - a) * eased;
      from.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return shown;
}

/**
 * Indicador circular de la nota (0-100): un dial con marcas, los tramos de
 * cada nivel y un arco que se llena con el color del nivel. Mientras
 * `loading`, un barrido gira alrededor («calculando»).
 */
export function RatingGauge({
  value,
  size = 168,
  loading = false,
  label = '/100',
}: {
  value: number | null;
  size?: number;
  loading?: boolean;
  label?: string;
}) {
  const v = useTween(value ?? 0);
  const tier = tierOf(Math.round(v));
  const r = 42;
  const c = 2 * Math.PI * r;
  // El dial ocupa 300° (abierto abajo).
  const arc = (300 / 360) * c;
  const fill = (Math.max(0, Math.min(100, v)) / 100) * arc;
  return (
    <div
      className={`rating-gauge${loading ? ' is-loading' : ''}${value === null ? ' is-empty' : ''}`}
      style={{ width: size, height: size, '--tier': tier.color, '--fs': `${Math.round(size * 0.27)}px` } as CSSProperties}
      role="img"
      aria-label={value === null ? 'Sin nota' : `Nota ${value} de 100, nivel ${tierOf(value).label}`}
    >
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
        <g transform="rotate(120 50 50)">
          {/* Marcas del dial */}
          {Array.from({ length: 51 }, (_, i) => {
            const a = (i / 50) * (300 / 360) * Math.PI * 2;
            const long = i % 5 === 0;
            const r1 = long ? 47.5 : 48.5;
            return (
              <line
                key={i}
                className={i * 2 <= v && value !== null ? 'tick is-on' : 'tick'}
                x1={50 + r1 * Math.cos(a)}
                y1={50 + r1 * Math.sin(a)}
                x2={50 + 50 * Math.cos(a)}
                y2={50 + 50 * Math.sin(a)}
              />
            );
          })}
          <circle className="gauge-track" cx="50" cy="50" r={r} strokeDasharray={`${arc} ${c}`} />
          {/* Tramos de cada nivel */}
          {TIERS.slice(1).map((t) => {
            const a = (t.min / 100) * (300 / 360) * Math.PI * 2;
            return <circle key={t.key} className="gauge-mark" cx={50 + r * Math.cos(a)} cy={50 + r * Math.sin(a)} r="1.1" />;
          })}
          <circle className="gauge-fill" cx="50" cy="50" r={r} strokeDasharray={`${fill} ${c}`} />
          {loading && <circle className="gauge-scan" cx="50" cy="50" r={r} strokeDasharray={`${c * 0.12} ${c}`} />}
        </g>
      </svg>
      <div className="gauge-center">
        <span className="gauge-value">{value === null ? '—' : Math.round(v)}</span>
        <span className="gauge-label">{loading ? 'Calculando' : label}</span>
      </div>
    </div>
  );
}

/** Nota pequeña para las fichas: anillo con el número y el color del nivel. */
export function ScoreRing({ value, size = 40, title }: { value: number | null | undefined; size?: number; title?: string }) {
  const has = typeof value === 'number';
  const tier = tierOf(has ? value : 0);
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <span
      className={`score-ring${has ? '' : ' is-empty'}`}
      style={{ width: size, height: size, '--tier': tier.color, '--fs': `${Math.max(12, Math.round(size * 0.34))}px` } as CSSProperties}
      title={title ?? (has ? `${value}/100 · ${tier.label}` : 'Sin nota todavía')}
      aria-label={has ? `Nota ${value} de 100, ${tier.label}` : 'Sin nota'}
    >
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <circle className="ring-track" cx="20" cy="20" r={r} />
        {has && <circle className="ring-fill" cx="20" cy="20" r={r} strokeDasharray={`${(value / 100) * c} ${c}`} transform="rotate(-90 20 20)" />}
      </svg>
      <b>{has ? value : '—'}</b>
    </span>
  );
}

/** Pegatina del nivel. */
export function TierBadge({ score, className = '' }: { score: number; className?: string }) {
  const t = tierOf(score);
  return (
    <span className={`tier-badge tier-${t.key.toLowerCase()} ${className}`} style={{ '--c': t.color, '--ink': t.ink } as CSSProperties}>
      {t.key === 'STREETWEAR_LEGEND' && <span className="tier-crown" aria-hidden="true">♛</span>}
      {t.label}
    </span>
  );
}
