import { useEffect, useState } from 'react';
import { t } from '../i18n';

/**
 * Icono de carga: un arco que gira (color del texto). `size` en píxeles.
 * Con `label`, el texto va al lado (o debajo, en `LoadingOverlay`).
 */
export function Spinner({ size = 16, label, className }: { size?: number; label?: string; className?: string }) {
  return (
    <span className={`spinner-wrap${className ? ` ${className}` : ''}`} role="status" aria-live="polite">
      <svg className="spinner-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
        <path d="M12 2.5a9.5 9.5 0 0 1 9.5 9.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {label ? <span className="spinner-label">{label}</span> : <span className="visually-hidden">{t('Cargando…')}</span>}
    </span>
  );
}

/**
 * Capa centrada sobre un escenario 3D mientras algo carga. Aparece con un
 * pequeño retraso (lo que carga al momento no hace parpadear nada) y se
 * desvanece al terminar. No captura el ratón.
 */
export function LoadingOverlay({ show, label = t('Cargando…'), delay = 180, size = 34 }: { show: boolean; label?: string; delay?: number; size?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(t);
  }, [show, delay]);
  return (
    <div className={`loading-overlay${visible ? ' is-visible' : ''}`} aria-hidden={!visible}>
      {visible && <Spinner size={size} label={label} />}
    </div>
  );
}

/** Texto de un botón mientras trabaja («Guardando…»), con el icono girando delante. */
export function Busy({ text }: { text: string }) {
  return (
    <span className="busy">
      <Spinner size={14} />
      {text}
    </span>
  );
}
