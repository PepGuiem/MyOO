import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';

export interface ChartPoint {
  /** Etiqueta del eje X (hora o día) ya formateada. */
  label: string;
  value: number | null;
}

export interface TooltipRow {
  label: string;
  value: string;
  /** Muestra un trazo de la serie al lado (la primera fila). */
  key?: boolean;
}

/** Ancho del contenedor (el SVG se dibuja a su tamaño real, sin escalar el texto). */
function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Máximo "redondo" del eje y sus marcas (0, 1/2, máx.). */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  const f = max / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function compact(n: number): string {
  if (Math.abs(n) >= 10_000) return new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: n < 10 && n % 1 ? 1 : 0 }).format(n);
}

/**
 * Gráfico de una serie en el tiempo (columnas o línea), en SVG propio.
 * - Una sola serie por gráfico: el título dice qué es, sin leyenda.
 * - Cruz que sigue al puntero y salta al punto más cercano, con tooltip.
 * - Con el teclado: flechas para moverse por los puntos.
 * - Mientras se recarga, se queda el dibujo anterior (atenuado).
 */
export function TimeChart({
  points,
  kind = 'line',
  tone = 'ink',
  height = 150,
  format = compact,
  unit = '',
  tooltip,
  label,
  name,
  stale = false,
}: {
  points: ChartPoint[];
  kind?: 'line' | 'bars';
  /** ink: gris claro de la interfaz. danger: rojo de estado (errores). */
  tone?: 'ink' | 'danger';
  height?: number;
  format?: (n: number) => string;
  unit?: string;
  tooltip?: (i: number) => TooltipRow[];
  /** Nombre accesible del gráfico. */
  label: string;
  /** Nombre corto de la serie en el tooltip (por defecto, `label`). */
  name?: string;
  stale?: boolean;
}) {
  const [wrap, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();
  const pad = { top: 10, right: 8, bottom: 22, left: 40 };
  const w = Math.max(0, width - pad.left - pad.right);
  const h = height - pad.top - pad.bottom;
  const n = points.length;
  const max = useMemo(() => niceMax(Math.max(0, ...points.map((p) => p.value ?? 0))), [points]);
  const x = useCallback((i: number) => (n <= 1 ? w / 2 : kind === 'bars' ? ((i + 0.5) * w) / n : (i * w) / (n - 1)), [n, w, kind]);
  const y = (v: number) => h - (v / max) * h;

  const line = useMemo(() => {
    let d = '';
    let pen = false;
    points.forEach((p, i) => {
      if (p.value === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
      pen = true;
    });
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, x, max, h]);

  const area = useMemo(() => {
    const valid = points.map((p, i) => [i, p.value] as const).filter((p): p is readonly [number, number] => p[1] !== null);
    if (valid.length < 2) return '';
    return `M${x(valid[0][0])},${h}${valid.map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')}L${x(valid[valid.length - 1][0])},${h}Z`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, x, max, h]);

  function pick(e: PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = kind === 'bars' ? Math.floor((px / r.width) * n) : Math.round((px / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover((h0) => {
        const cur = h0 ?? (e.key === 'ArrowRight' ? -1 : n);
        return Math.max(0, Math.min(n - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
      });
    } else if (e.key === 'Escape') setHover(null);
  }

  const barW = Math.max(1, Math.min(24, (w / Math.max(1, n)) - 2));
  const ticks = [0, max / 2, max];
  const xLabels = n > 0 ? [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i) : [];
  const last = [...points].reverse().find((p) => p.value !== null);
  const hv = hover !== null ? points[hover] : null;
  const rows = hover !== null ? (tooltip?.(hover) ?? [{ label: name ?? label, value: hv?.value === null || hv?.value === undefined ? '—' : `${format(hv.value)}${unit}`, key: true }]) : [];
  const tipLeft = hover !== null ? pad.left + x(hover) : 0;

  return (
    <div ref={wrap} className={`tchart tchart-${tone}${stale ? ' is-stale' : ''}`} style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${label}. ${last ? `Último valor: ${format(last.value!)}${unit}.` : 'Sin datos.'} Usa las flechas para recorrer los puntos.`}
          tabIndex={0}
          onKeyDown={onKey}
          onBlur={() => setHover(null)}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={-2} width={w} height={h + 2} />
            </clipPath>
          </defs>
          <g transform={`translate(${pad.left},${pad.top})`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className={t === 0 ? 'tchart-base' : 'tchart-grid'} x1={0} x2={w} y1={y(t)} y2={y(t)} />
                <text className="tchart-tick" x={-8} y={y(t)} dy="0.32em" textAnchor="end">
                  {format(t)}
                </text>
              </g>
            ))}
            {xLabels.map((i) => (
              <text key={i} className="tchart-tick" x={x(i)} y={h + 15} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
                {points[i].label}
              </text>
            ))}
            <g clipPath={`url(#${clipId})`}>
              {kind === 'bars' ? (
                points.map((p, i) =>
                  p.value ? (
                    <path
                      key={i}
                      className={`tchart-bar${hover === i ? ' is-hover' : ''}`}
                      d={roundedTop(x(i) - barW / 2, y(p.value), barW, h - y(p.value), Math.min(4, barW / 2))}
                    />
                  ) : null,
                )
              ) : (
                <>
                  {area && <path className="tchart-area" d={area} />}
                  <path className="tchart-line" d={line} />
                </>
              )}
            </g>
            {hover !== null && (
              <>
                {kind === 'line' && <line className="tchart-cross" x1={x(hover)} x2={x(hover)} y1={0} y2={h} />}
                {kind === 'line' && hv?.value !== null && hv?.value !== undefined && <circle className="tchart-dot" cx={x(hover)} cy={y(hv.value)} r={4} />}
              </>
            )}
            {/* Capa para el puntero: todo el área, no solo la línea. */}
            <rect className="tchart-hit" x={0} y={0} width={w} height={h} onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setHover(null)} />
          </g>
        </svg>
      )}
      {hover !== null && rows.length > 0 && (
        <div className={`tchart-tip${tipLeft > width * 0.6 ? ' is-left' : ''}`} style={{ left: tipLeft }} role="status">
          <span className="tchart-tip-when">{hv?.label}</span>
          {rows.map((r) => (
            <span key={r.label} className="tchart-tip-row">
              {r.key && <i className="tchart-tip-key" aria-hidden="true" />}
              <strong>{r.value}</strong>
              <span>{r.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rectángulo con las esquinas de arriba redondeadas (la base, recta). */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const rr = Math.min(r, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/**
 * Línea mínima para las fichas (sin ejes). Ocupa todo el ancho de la ficha:
 * se dibuja en un lienzo de 100×H y el trazo no se deforma al estirarse.
 */
export function Sparkline({ values, tone = 'ink', height = 24 }: { values: (number | null)[]; tone?: 'ink' | 'danger'; height?: number }) {
  const v = values.map((n) => n ?? 0);
  const max = Math.max(1, ...v);
  if (v.length < 2) return null;
  const d = v.map((n, i) => `${i ? 'L' : 'M'}${((i / (v.length - 1)) * 100).toFixed(2)},${(height - 2 - (n / max) * (height - 4)).toFixed(2)}`).join('');
  return (
    <svg className={`spark spark-${tone}`} width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
