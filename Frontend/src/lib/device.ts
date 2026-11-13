import { useEffect, useState } from 'react';

let webglCache: boolean | null = null;

/** ¿Puede este navegador pintar WebGL? (se comprueba una sola vez). */
export function hasWebGL(): boolean {
  if (webglCache !== null) return webglCache;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    webglCache = !!gl;
    // Liberamos el contexto de prueba enseguida (los navegadores limitan cuántos hay).
    (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglCache = false;
  }
  return webglCache;
}

const REDUCED = '(prefers-reduced-motion: reduce)';

/** true si el sistema pide reducir animaciones (se actualiza en vivo). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.(REDUCED);
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/**
 * true mientras el elemento está (al menos en parte) en pantalla y la pestaña
 * está visible. Sirve para pausar el render 3D cuando nadie lo ve.
 */
export function useOnScreen(el: HTMLElement | null): boolean {
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);

  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [el]);

  useEffect(() => {
    const on = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  return inView && pageVisible;
}
