import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from './motion';

/**
 * `true` en cuanto el elemento entra en pantalla (una sola vez). Sirve para
 * animar al aparecer: contadores, entradas escalonadas… Sin
 * IntersectionObserver, o con «reducir movimiento», devuelve `true` enseguida.
 */
export function useInView<T extends Element>(rootMargin = '0px 0px -8% 0px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (reducedMotion() || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView] as const;
}
