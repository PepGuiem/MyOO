import { useState, type CSSProperties, type ReactNode } from 'react';
import { t, tn } from '../../i18n';

/**
 * Gráficos de STYLE ANALYTICS hechos con HTML/SVG (sin librerías). Reglas:
 * un solo eje, leyenda cuando hay más de una serie, el texto siempre en
 * tinta (no en el color de la serie), marcas finas y un aviso al pasar el
 * ratón o al enfocar con el teclado.
 */

/** Colores de series (pasan el validador de daltonismo sobre el fondo oscuro). */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500'];
export const OTHER = '#6d6c66';

export interface Series {
  key: string;
  label: string;
  color: string;
}

/** Columnas agrupadas (p. ej. outfits creados y usados por semana). */
export function ColumnChart({
  data,
  series,
  height = 180,
  label,
}: {
  data: { key: string; label: string; values: Record<string, number> }[];
  series: Series[];
  height?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  return (
    <figure className="an-chart" aria-label={label}>
      <Legend series={series} />
      <div className="col-chart" style={{ height } as CSSProperties}>
        <div className="col-grid" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / top) * 100}%` }}>
              <i>{t}</i>
            </span>
          ))}
        </div>
        <div className="col-groups">
          {data.map((d, i) => (
            <button
              key={d.key}
              type="button"
              className={`col-group${hover === i ? ' is-hover' : ''}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${d.label}: ${series.map((s) => `${s.label} ${d.values[s.key] ?? 0}`).join(', ')}`}
            >
              <span className="col-bars">
                {series.map((s, j) => (
                  <span
                    key={s.key}
                    className="col-bar"
                    style={{ height: `${((d.values[s.key] ?? 0) / top) * 100}%`, background: s.color, '--i': i * series.length + j } as CSSProperties}
                  />
                ))}
              </span>
              <span className="col-label">{d.label}</span>
              {hover === i && (
                <span className={`an-tip${tipSide(i, data.length)}`} role="status">
                  <b>{d.label}</b>
                  {series.map((s) => (
                    <span key={s.key}>
                      <i style={{ background: s.color }} /> {s.label}: <b>{d.values[s.key] ?? 0}</b>
                    </span>
                  ))}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </figure>
  );
}

/** Columnas al 100 %: mezcla de estilos de cada mes (solo los meses con outfits tienen barra). */
export function StackedShare({
  data,
  series,
  height = 170,
  label,
}: {
  data: { key: string; label: string; values: Record<string, number> }[];
  series: Series[];
  height?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <figure className="an-chart" aria-label={label}>
      <Legend series={series} />
      <div className="stack-chart" style={{ height } as CSSProperties}>
        {data.map((d, i) => {
          const total = series.reduce((a, s) => a + (d.values[s.key] ?? 0), 0);
          return (
            <button
              key={d.key}
              type="button"
              className={`stack-col${hover === i ? ' is-hover' : ''}${total ? '' : ' is-empty'}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              aria-label={`${d.label}: ${total ? series.filter((s) => d.values[s.key]).map((s) => `${s.label} ${Math.round(((d.values[s.key] ?? 0) / total) * 100)}%`).join(', ') : t('sin outfits')}`}
            >
              <span className="stack-bar" style={{ '--i': i } as CSSProperties}>
                {total > 0 &&
                  series.map((s) =>
                    d.values[s.key] ? (
                      <span key={s.key} style={{ height: `${((d.values[s.key] ?? 0) / total) * 100}%`, background: s.color }} />
                    ) : null,
                  )}
              </span>
              <span className="col-label">{d.label}</span>
              {hover === i && total > 0 && (
                <span className={`an-tip${tipSide(i, data.length)}`} role="status">
                  <b>
                    {d.label} · {tn(total, '{n} outfit', '{n} outfits')}
                  </b>
                  {series
                    .filter((s) => d.values[s.key])
                    .map((s) => (
                      <span key={s.key}>
                        <i style={{ background: s.color }} /> {s.label}: <b>{Math.round(((d.values[s.key] ?? 0) / total) * 100)}%</b>
                      </span>
                    ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </figure>
  );
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="an-legend">
      {series.map((s) => (
        <li key={s.key}>
          <i style={{ background: s.color }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Fila de barra horizontal con su etiqueta y su valor (el texto va en tinta, no en el color). */
export function BarRow({
  label,
  value,
  share,
  fill = 'var(--fx-acid)',
  hatch,
  index = 0,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  /** 0-100 */
  share: number;
  fill?: string;
  /** Parte final (0-100 de la barra) con rayas: p. ej. «deducido». */
  hatch?: number;
  index?: number;
  title?: string;
}) {
  return (
    <li className="bar-row" style={{ '--i': index } as CSSProperties} title={title}>
      <span className="bar-label">{label}</span>
      <span className="bar-track">
        <span className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, share))}%`, '--fill': fill } as CSSProperties}>
          {hatch ? <span className="bar-hatch" style={{ width: `${hatch}%` }} /> : null}
        </span>
      </span>
      <span className="bar-value">{value}</span>
    </li>
  );
}

/** Los avisos de las primeras y últimas columnas no se salen por los lados. */
function tipSide(i: number, n: number): string {
  return i < 2 ? ' is-left' : i >= n - 2 ? ' is-right' : '';
}

/** Marcas del eje: 0 y 3-4 valores redondos hasta cubrir el máximo. */
function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 20 ? 5 : max <= 50 ? 10 : Math.ceil(max / 40) * 10;
  const out: number[] = [];
  for (let t = 0; t < max + step; t += step) out.push(t);
  return out;
}
