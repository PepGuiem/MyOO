import { flushSync } from 'react-dom';

/**
 * Sistema de animaciones de MyOO (sin librerías: CSS + Web Animations API).
 *
 * - Las animaciones usan transform y opacity (las mueve la GPU, no
 *   recalculan el diseño de la página).
 * - Con «reducir movimiento» del sistema operativo, todo se queda quieto.
 * - En pantallas táctiles no hay efectos de «pasar el ratón».
 *
 * Las clases CSS compartidas están al final de styles.css, sección
 * «Animaciones globales» (cy-*). Los efectos globales (inclinación de
 * tarjetas, luz que sigue al cursor, onda al pulsar, aparición al hacer
 * scroll) los monta una sola vez <GlobalFx /> para toda la app.
 */

export function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Ratón o trackpad (no pantalla táctil): solo ahí tienen sentido los hover. */
export function canHover(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
}

/** Equipos modestos o móviles: menos partículas y efectos. */
export function lowPower(): boolean {
  if (typeof window === 'undefined') return true;
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  return cores <= 4 || memory <= 2 || window.innerWidth < 760;
}

type DocWithVT = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

/**
 * Cambia el estado con una transición suave (View Transitions del navegador):
 * lo que desaparece se desvanece, lo que entra aparece y lo que se mueve se
 * desliza. Si el navegador no lo soporta o hay «reducir movimiento», el
 * cambio es inmediato. Úsalo para filtros, pestañas, meses, borrados…
 */
export function withTransition(update: () => void): void {
  const doc = document as DocWithVT;
  if (!doc.startViewTransition || reducedMotion()) {
    update();
    return;
  }
  doc.startViewTransition(() => {
    flushSync(update);
  });
}

/** Saca un elemento con un desvanecido y luego ejecuta `done` (p. ej. quitarlo de la lista). */
export function animateOut(el: Element | null | undefined, done: () => void, ms = 260): void {
  if (!el || reducedMotion() || !(el as HTMLElement).animate) {
    done();
    return;
  }
  const a = (el as HTMLElement).animate(
    [
      { opacity: 1, transform: 'none', filter: 'blur(0)' },
      { opacity: 0, transform: 'translateY(8px) scale(0.94)', filter: 'blur(3px)' },
    ],
    { duration: ms, easing: 'cubic-bezier(0.4, 0, 0.8, 0.4)', fill: 'forwards' },
  );
  a.onfinish = () => done();
}

const BURST_COLORS = ['#ff2d4a', '#ff4f8b', '#f2efe8', '#ff7a1a', '#ffffff'];

/**
 * Destello de confirmación: unas chispas de neón que salen de un punto
 * (coordenadas de pantalla). Se dibuja con elementos sueltos que se borran
 * solos al acabar.
 */
export function burst(x: number, y: number, { count = 14, spread = 70 }: { count?: number; spread?: number } = {}): void {
  if (typeof document === 'undefined' || reducedMotion()) return;
  const host = document.createElement('div');
  host.className = 'cy-burst';
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  host.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const s = document.createElement('i');
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const dist = spread * (0.55 + Math.random() * 0.6);
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    s.style.setProperty('--c', BURST_COLORS[i % BURST_COLORS.length]);
    s.style.animationDelay = `${Math.random() * 60}ms`;
    host.appendChild(s);
  }
  document.body.appendChild(host);
  window.setTimeout(() => host.remove(), 900);
}

/** Destello centrado en un elemento (p. ej. el botón de guardar). */
export function burstAt(el: Element | null | undefined, opts?: { count?: number; spread?: number }): void {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}
