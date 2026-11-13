import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';

/**
 * Confirmación con entrada y salida animadas (la pegatina cae y, al cerrar,
 * se despega). Escape o clic fuera cancelan; el foco va al botón de cancelar
 * para que un Enter sin querer no borre nada.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const close = () => {
    if (busy || leaving) return;
    setLeaving(true);
    window.setTimeout(() => closeRef.current(), 200);
  };

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    document.body.classList.add('no-scroll');
    return () => {
      document.body.classList.remove('no-scroll');
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  return createPortal(
    <div className={`fx-overlay${leaving ? ' is-leaving' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`fx-dialog${danger ? ' is-danger' : ''}`} role="alertdialog" aria-modal="true" aria-label={title}>
        <span className="fx-dialog-tape" aria-hidden="true" />
        <span className="fx-dialog-icon" aria-hidden="true">
          <Icon name={danger ? 'trash' : 'spark'} size={22} />
        </span>
        <h2>{title}</h2>
        {children && <div className="fx-dialog-body">{children}</div>}
        <div className="fx-dialog-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={close} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'} btn-street`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Un momento…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
