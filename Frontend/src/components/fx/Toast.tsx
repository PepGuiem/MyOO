import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { play, type Sfx } from '../../lib/sfx';
import { burst } from '../../lib/motion';
import { Icon, type IconName } from '../Icon';

export type ToastTone = 'ok' | 'info' | 'danger';

interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
  icon: IconName;
  leaving?: boolean;
  action?: { label: string; run: () => void };
}

interface ToastApi {
  show: (text: string, opts?: { tone?: ToastTone; icon?: IconName; sound?: Sfx; action?: { label: string; run: () => void } }) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const TONE_ICON: Record<ToastTone, IconName> = { ok: 'check', info: 'spark', danger: 'trash' };

/**
 * Avisos de las acciones importantes (guardado, duplicado, borrado…): una
 * pegatina que entra por abajo y se va sola. Con `action`, un botón
 * (p. ej. «Deshacer»).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((l) => l.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    window.setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 260);
  }, []);

  const show = useCallback<ToastApi['show']>(
    (text, opts = {}) => {
      const id = ++seq.current;
      const tone = opts.tone ?? 'ok';
      setItems((l) => [...l.slice(-2), { id, text, tone, icon: opts.icon ?? TONE_ICON[tone], action: opts.action }]);
      if (opts.sound) play(opts.sound);
      // Acción completada: unas chispas de neón salen del aviso.
      if (tone === 'ok') window.setTimeout(() => burst(window.innerWidth / 2, window.innerHeight - 48, { count: 12, spread: 60 }), 120);
      window.setTimeout(() => dismiss(id), opts.action ? 5200 : 3200);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="toasts" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast is-${t.tone}${t.leaving ? ' is-leaving' : ''}`}>
              <span className="toast-icon">
                <Icon name={t.icon} size={14} />
              </span>
              <span className="toast-text">{t.text}</span>
              {t.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    t.action?.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <span className="toast-timer" aria-hidden="true" style={{ animationDuration: t.action ? '5.2s' : '3.2s' }} />
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext) ?? { show: () => undefined };
}
