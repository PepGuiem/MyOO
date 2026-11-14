import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';

export interface SelectOption {
  value: string;
  label: string;
  /** Encabezado del grupo (opciones seguidas con el mismo grupo van juntas). */
  group?: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  /** Etiqueta accesible (si no hay `labelledBy`). */
  ariaLabel?: string;
  /** id del texto que nombra el desplegable. */
  labelledBy?: string;
  /** Texto cuando el valor no está entre las opciones. */
  placeholder?: string;
  size?: 'md' | 'sm';
  disabled?: boolean;
  className?: string;
}

/**
 * Desplegable propio, con el estilo de la interfaz. El <select> nativo se
 * pinta con la lista del sistema (en Windows, blanca o gris claro y con otra
 * letra) y no encajaba con el resto. La lista se abre en una capa por encima
 * de la página (no empuja ni descoloca nada) y se puede usar con el teclado:
 * flechas, Inicio/Fin, Intro o espacio para elegir, Esc para cerrar y letras
 * para saltar a una opción.
 */
export function Select({ value, options, onChange, ariaLabel, labelledBy, placeholder = t('Elegir…'), size = 'md', disabled, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number; up: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const selectedIndex = options.findIndex((o) => o.value === value);
  const current = selectedIndex >= 0 ? options[selectedIndex] : null;

  const place = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const want = Math.min(320, options.length * 36 + 12);
    const up = below < Math.min(want, 200) && above > below;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8)),
      top: up ? r.top - 4 : r.bottom + 4,
      width: r.width,
      maxHeight: Math.max(120, Math.min(320, up ? above : below)),
      up,
    });
  }, [options.length]);

  const close = useCallback((focus = true) => {
    setOpen(false);
    if (focus) trigger.current?.focus();
  }, []);

  const openList = (at?: number) => {
    if (disabled) return;
    place();
    setActive(at ?? (selectedIndex >= 0 ? selectedIndex : 0));
    setOpen(true);
  };

  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.value !== value) onChange(o.value);
    close();
  };

  // Al abrir, el foco pasa a la lista. Si se desplaza la página o el panel,
  // se cierra (como un desplegable nativo); al cambiar el tamaño, se recoloca.
  useLayoutEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    const onResize = () => place();
    const onScroll = (e: Event) => {
      if (list.current && e.target instanceof Node && list.current.contains(e.target)) return;
      close(false);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place, close]);

  // Clic fuera: se cierra sin cambiar nada.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (trigger.current?.contains(t) || list.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, close]);

  // La opción activa siempre a la vista.
  useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const jumpTo = (key: string) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at > 700 ? key : t.text + key;
    t.at = now;
    const q = t.text.toLowerCase();
    const n = options.length;
    const from = Math.max(open ? active : selectedIndex, 0) + (t.text.length === 1 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const i = (from + k) % n;
      if (options[i].label.toLowerCase().startsWith(q)) return i;
    }
    return -1;
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = jumpTo(e.key);
      if (i >= 0 && options[i].value !== value) onChange(options[i].value);
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((a) => Math.min(last, a + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(last);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        choose(active);
        break;
      case 'Escape':
        // Solo cierra la lista (no el diálogo en el que esté).
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const i = jumpTo(e.key);
          if (i >= 0) setActive(i);
        }
    }
  };

  const rows = useMemo(() => {
    let group: string | undefined;
    return options.map((o, i) => {
      const head = o.group && o.group !== group ? o.group : null;
      group = o.group;
      return { o, i, head };
    });
  }, [options]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`select-trigger select-${size}${open ? ' is-open' : ''} ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={labelledBy ? undefined : ariaLabel}
        aria-labelledby={labelledBy ? `${labelledBy} ${baseId}-value` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKey}
      >
        <span id={`${baseId}-value`} className={`select-value${current ? '' : ' is-placeholder'}`}>
          {current ? current.label : placeholder}
        </span>
        <svg className="select-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={list}
            id={listId}
            role="listbox"
            tabIndex={-1}
            className={`select-menu select-menu-${size}${pos.up ? ' is-up' : ''}`}
            aria-labelledby={labelledBy}
            aria-label={labelledBy ? undefined : ariaLabel}
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            style={{
              left: pos.left,
              minWidth: pos.width,
              maxHeight: pos.maxHeight,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
            onKeyDown={onListKey}
          >
            {rows.map(({ o, i, head }) => (
              <li key={`${o.group ?? ''}:${o.value}`} role="presentation">
                {head && (
                  <div className="select-group" role="presentation">
                    {head}
                  </div>
                )}
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === selectedIndex}
                  className={`select-option${i === active ? ' is-active' : ''}${i === selectedIndex ? ' is-selected' : ''}`}
                  onPointerMove={() => setActive(i)}
                  onClick={() => choose(i)}
                >
                  <span>{o.label}</span>
                  {i === selectedIndex && (
                    <svg className="select-check" viewBox="0 0 12 12" aria-hidden="true">
                      <path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
