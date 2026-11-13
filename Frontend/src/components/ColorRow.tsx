import { useId } from 'react';

export const SWATCHES = ['#F2F2F2', '#E8E0D0', '#C9A15A', '#D8B260', '#B87333', '#8C8C8C', '#4A4A50', '#2E2E33', '#151517', '#2B3445', '#8FA6C1', '#5F6B52', '#8C3B3B', '#3B2F2A'];

/**
 * Color de una pieza: una fila compacta (nombre y color actual) que se abre
 * para elegir en la paleta. Así la lista de piezas cabe en el panel.
 */
export function ColorRow({
  label,
  value,
  onChange,
  required,
  open,
  onToggle,
  onRemove,
}: {
  label: string;
  value: string | undefined;
  onChange: (c: string | null) => void;
  required?: boolean;
  open: boolean;
  onToggle: () => void;
  /** Muestra un botón para quitar este color (p. ej. un color del estampado). */
  onRemove?: () => void;
}) {
  const id = useId();
  const current = value?.toUpperCase();
  return (
    <div className={`color-slot${open ? ' is-open' : ''}`}>
      <button type="button" className="color-slot-head" aria-expanded={open} aria-controls={`${id}-palette`} onClick={onToggle}>
        <span className={`color-slot-swatch${current ? '' : ' is-auto'}`} style={current ? { background: current } : undefined} aria-hidden="true" />
        <span className="color-slot-label">{label}</span>
        <span className="color-slot-value">{current ? current : 'Automático'}</span>
        <svg className="color-slot-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {onRemove && (
        <button type="button" className="color-slot-remove" aria-label={`Quitar ${label.toLowerCase()}`} title="Quitar este color" onClick={onRemove}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {open && (
        <div id={`${id}-palette`} className="color-palette" role="group" aria-label={label}>
          {!required && (
            <button type="button" className={`color-chip color-auto${!current ? ' is-active' : ''}`} aria-pressed={!current} aria-label={`${label}: automático`} title="Automático (a juego con la prenda)" onClick={() => onChange(null)}>
              A
            </button>
          )}
          {SWATCHES.map((c) => (
            <button key={c} type="button" className={`color-chip${current === c ? ' is-active' : ''}`} style={{ background: c }} aria-label={`${label} ${c}`} aria-pressed={current === c} title={c} onClick={() => onChange(c)} />
          ))}
          <label className={`color-chip color-custom${current && !SWATCHES.includes(current) ? ' is-active' : ''}`} title="Otro color" style={current && !SWATCHES.includes(current) ? { background: current } : undefined}>
            <input type="color" value={value ?? '#8E8E93'} onChange={(e) => onChange(e.target.value)} aria-label={`${label}: otro color`} />
          </label>
        </div>
      )}
    </div>
  );
}
