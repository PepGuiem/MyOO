import { useCallback, useRef, type PointerEvent } from 'react';
import { prefersReducedMotion } from '../components/street/Street';

/**
 * Inclinación 3D ligera al pasar el ratón (máx. `max` grados) y un brillo que
 * sigue al puntero. Escribe variables CSS (--rx, --ry, --mx, --my) en el
 * elemento: el estilo decide qué hacer con ellas. Sin efecto en pantallas
 * táctiles ni con «reducir movimiento».
 */
export function useTilt<T extends HTMLElement>(max = 4) {
  const ref = useRef<T>(null);
  const frame = useRef(0);

  const onPointerMove = useCallback(
    (e: PointerEvent<T>) => {
      const el = ref.current;
      if (!el || e.pointerType !== 'mouse' || prefersReducedMotion()) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        el.style.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
        el.style.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
        el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
      });
    },
    [max],
  );

  const onPointerLeave = useCallback(() => {
    const el = ref.current;
    cancelAnimationFrame(frame.current);
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}
