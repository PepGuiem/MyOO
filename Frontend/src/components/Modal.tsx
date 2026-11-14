import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { reducedMotion } from '../lib/motion';
import { Icon } from './Icon';
import { t } from '../i18n';

/** Diálogo modal accesible: Escape para cerrar, foco dentro del diálogo. */
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** Clase extra del diálogo (p. ej. el editor de prendas, que reparte el alto a su manera). */
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Al cerrar desde el propio diálogo (×, Escape o clic fuera) sale con una
  // animación corta antes de desmontarse.
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (reducedMotion()) return onClose();
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(onClose, 180);
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      previous?.focus();
    };
  }, [requestClose]);

  return (
    <div className={`overlay${closing ? ' is-closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && requestClose()}>
      <div
        ref={ref}
        className={`dialog${wide ? ' dialog-wide' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={requestClose} aria-label={t('Cerrar')}>
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
