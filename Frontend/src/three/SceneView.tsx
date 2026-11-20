import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createEntry, removeEntry, setFar, setNear, touchEntry, type ViewEntry } from './viewStore';

/**
 * Hueco de una miniatura 3D. El 3D lo pinta el canvas compartido (ViewCanvas)
 * justo encima de este elemento, recortado por sus contenedores con scroll.
 *
 * Solo se monta cuando está cerca de la pantalla y se desmonta al quedar muy
 * lejos: una lista de 60 prendas ya no carga ni dibuja las 60 a la vez.
 */
export function SceneView({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const entry = useRef<ViewEntry | null>(null);

  useLayoutEffect(() => {
    const e = createEntry(ref.current!, children);
    entry.current = e;
    watch(e);
    return () => {
      unwatch(e);
      removeEntry(e);
      entry.current = null;
    };
    // Solo al montar: el contenido se actualiza en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const e = entry.current;
    if (e && e.content !== children) {
      e.content = children;
      touchEntry(e);
    }
  });

  return <div ref={ref} className={className} style={style} />;
}

// ---------------------------------------------------------------------------
// Dos observadores compartidos: «cerca» (hasta 60 % de pantalla por arriba y
// por abajo) monta y pinta; «lejos» (más de 2,2 pantallas) desmonta.

const byEl = new WeakMap<Element, ViewEntry>();
let nearIO: IntersectionObserver | null = null;
let farIO: IntersectionObserver | null = null;

function observers() {
  if (nearIO || typeof IntersectionObserver === 'undefined') return;
  nearIO = new IntersectionObserver(
    (list) => {
      for (const it of list) {
        const e = byEl.get(it.target);
        if (e) setNear(e, it.isIntersecting);
      }
    },
    { rootMargin: '60% 0px 60% 0px' },
  );
  farIO = new IntersectionObserver(
    (list) => {
      for (const it of list) {
        const e = byEl.get(it.target);
        if (e && !it.isIntersecting) setFar(e);
      }
    },
    { rootMargin: '220% 0px 220% 0px' },
  );
}

function watch(e: ViewEntry) {
  observers();
  if (!nearIO || !farIO) {
    // Sin IntersectionObserver: todas montadas, como antes.
    setNear(e, true);
    return;
  }
  byEl.set(e.el, e);
  nearIO.observe(e.el);
  farIO.observe(e.el);
}

function unwatch(e: ViewEntry) {
  nearIO?.unobserve(e.el);
  farIO?.unobserve(e.el);
  byEl.delete(e.el);
}
