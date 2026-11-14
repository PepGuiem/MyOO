import { useMemo, useState, type CSSProperties } from 'react';
import type { WishlistPrice } from '../../api/types';
import { money } from '../../lib/wishlist';
import { LOCALE_TAG } from '../../i18n';

/**
 * Historial de precios en escalón: un precio vale hasta que apuntas el
 * siguiente (no se dibujan rectas entre medias, que inventarían precios que
 * nadie vio). Una serie, sin leyenda; el objetivo es una línea discontinua
 * con su nombre. Al pasar el ratón o con el teclado se ve cada precio.
 */
const W = 560;
const H = 190;
const PAD = { l: 58, r: 16, t: 14, b: 26 };

function domain(values: number[]): [number, number] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.max(1, hi * 0.2);
  const step = niceStep(span / 3);
  const min = Math.max(0, Math.floor((lo - span * 0.15) / step) * step);
  const max = Math.ceil((hi + span * 0.15) / step) * step;
  return [min, max === min ? min + step : max];
}

function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 0.01)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

const DAY = 86_400_000;
const fmtDay = (t: number) => new Date(t).toLocaleDateString(LOCALE_TAG, { day: 'numeric', month: 'short' });

export function PriceChart({ prices, target, currency }: { prices: WishlistPrice[]; target: number | null; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const pts = useMemo(
    () =>
      prices
        .filter((p) => p.currency === currency)
        .map((p) => ({ id: p.id, v: Number(p.price), t: new Date(p.recordedAt).getTime(), note: p.note, source: p.source }))
        .sort((a, b) => a.t - b.t),
    [prices, currency],
  );
  if (pts.length === 0) return null;

  const now = Date.now();
  const t0 = pts[0].t;
  const t1 = Math.max(now, pts[pts.length - 1].t + DAY);
  const [y0, y1] = domain([...pts.map((p) => p.v), ...(target !== null ? [target] : [])]);
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PAD.t - PAD.b);
  const ticks = [y0, (y0 + y1) / 2, y1];

  let d = `M${x(pts[0].t)},${y(pts[0].v)}`;
  for (let i = 1; i < pts.length; i++) d += `H${x(pts[i].t)}V${y(pts[i].v)}`;
  d += `H${x(t1)}`;

  const tipPt = hover !== null ? pts[hover] : null;
  const tipLeft = tipPt ? (x(tipPt.t) / W) * 100 : 0;
  const tipTop = tipPt ? (y(tipPt.v) / H) * 100 : 0;

  return (
    <figure className="wl-chart" aria-label={`Historial de precios: ${pts.map((p) => `${fmtDay(p.t)} ${money(p.v, currency)}`).join(', ')}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true">
        {ticks.map((t) => (
          <g key={t} className="wl-chart-grid">
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {money(t, currency, { compact: true })}
            </text>
          </g>
        ))}
        <text className="wl-chart-axis" x={PAD.l} y={H - 6}>
          {fmtDay(t0)}
        </text>
        <text className="wl-chart-axis" x={W - PAD.r} y={H - 6} textAnchor="end">
          Hoy
        </text>
        {target !== null && (
          <g className="wl-chart-target">
            <line x1={PAD.l} x2={W - PAD.r} y1={y(target)} y2={y(target)} />
            <text x={W - PAD.r - 4} y={y(target) - 6} textAnchor="end">
              Objetivo {money(target, currency)}
            </text>
          </g>
        )}
        <path className="wl-chart-line" d={d} pathLength={1} />
        {pts.map((p, i) => (
          <circle
            key={p.id}
            className={`wl-chart-dot${i === pts.length - 1 ? ' is-last' : ''}${hover === i ? ' is-hover' : ''}`}
            cx={x(p.t)}
            cy={y(p.v)}
            r={hover === i ? 6 : 4.5}
            style={{ '--i': i } as CSSProperties}
          />
        ))}
      </svg>
      <div className="wl-chart-hits">
        {pts.map((p, i) => {
          const next = pts[i + 1]?.t ?? t1;
          const left = (x(p.t) / W) * 100;
          const width = Math.max(4, ((x(next) - x(p.t)) / W) * 100);
          return (
            <button
              key={p.id}
              type="button"
              style={{ left: `calc(${left}% - 10px)`, width: `calc(${width}% + 10px)` }}
              aria-label={`${fmtDay(p.t)}: ${money(p.v, currency)}${p.note ? `, ${p.note}` : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          );
        })}
      </div>
      {tipPt && (
        <span className={`wl-chart-tip${tipLeft > 70 ? ' is-right' : tipLeft < 25 ? ' is-left' : ''}`} style={{ left: `${tipLeft}%`, top: `${tipTop}%` }} role="status">
          <b>{money(tipPt.v, currency)}</b>
          <span>
            {new Date(tipPt.t).toLocaleDateString(LOCALE_TAG, { day: 'numeric', month: 'long', year: 'numeric' })}
            {tipPt.source === 'TRACKER' ? ' · seguimiento' : ''}
          </span>
          {tipPt.note && <i>{tipPt.note}</i>}
        </span>
      )}
    </figure>
  );
}

/** Mini escalón para la tarjeta (decorativo: la tendencia va en texto al lado). */
export function PriceSpark({ prices, currency }: { prices: WishlistPrice[]; currency: string | null }) {
  const pts = prices
    .filter((p) => !currency || p.currency === currency)
    .map((p) => ({ v: Number(p.price), t: new Date(p.recordedAt).getTime() }))
    .sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;
  const w = 64;
  const h = 18;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const yy = (v: number) => 2 + (1 - (v - lo) / (hi - lo || 1)) * (h - 4);
  const xx = (i: number) => (i / (pts.length - 1)) * (w - 4) + 2;
  let d = `M${xx(0)},${yy(pts[0].v)}`;
  for (let i = 1; i < pts.length; i++) d += `H${xx(i)}V${yy(pts[i].v)}`;
  const last = pts[pts.length - 1];
  return (
    <svg className="wl-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={d} />
      <circle cx={xx(pts.length - 1)} cy={yy(last.v)} r={2.5} />
    </svg>
  );
}
