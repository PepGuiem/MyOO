/**
 * Carga con estética urbana: un bote de spray que se agita y pinta una
 * línea que gotea. Con «reducir movimiento» queda quieto.
 */
export function SprayLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="spray-loader" role="status" aria-live="polite">
      <svg viewBox="0 0 120 70" width="120" height="70" aria-hidden="true">
        <g className="spray-can">
          <rect x="14" y="16" width="20" height="40" rx="4" />
          <rect x="18" y="9" width="12" height="8" rx="2" className="spray-cap" />
          <rect x="22" y="5" width="4" height="5" rx="1" className="spray-nozzle" />
          <rect x="14" y="28" width="20" height="10" className="spray-band" />
        </g>
        <g className="spray-mist">
          <circle cx="38" cy="8" r="1.4" />
          <circle cx="42" cy="5" r="1" />
          <circle cx="41" cy="11" r="1.2" />
          <circle cx="46" cy="8" r="0.9" />
        </g>
        <path className="spray-line" d="M44 40 C60 30, 74 48, 106 36" />
        <path className="spray-drip" d="M70 41 v12" />
        <path className="spray-drip spray-drip-2" d="M92 38 v8" />
      </svg>
      <span className="spray-loader-label">{label}</span>
    </div>
  );
}
