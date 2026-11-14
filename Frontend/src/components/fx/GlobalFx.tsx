import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { canHover, reducedMotion } from '../../lib/motion';

/**
 * Efectos globales de la app, montados una sola vez (en <App />). Funcionan
 * con las clases que ya tienen las páginas, sin tocar cada una:
 *
 * - Tarjetas: se inclinan un poco hacia el cursor (`TILT`) y una luz de neón
 *   las recorre al pasar el ratón (`LIGHT`). Solo con ratón.
 * - Botones, pestañas y filtros: una onda de luz sale del punto que pulsas.
 * - Al hacer scroll: lo que estaba fuera de la pantalla espera y hace su
 *   animación de entrada cuando aparece (en vez de animarse sin que se vea).
 * - Al cambiar de sección: una línea de luz barre la parte de arriba.
 *
 * Todo se apaga con «reducir movimiento».
 */
const TILT = [
  '.tile:not(.is-skeleton):not(.is-static)',
  '.wl-card',
  '.an-card',
  '.an-kpi',
  '.snk-kpi',
  '.monitor-kpi',
  '.wardrobe-card',
  '.side-card',
  '.wl-budget-kpis > div',
].join(',');

/** Tarjetas con su propio brillo (no se les añade otro). */
const OWN_LIGHT = '.fit-card, .snk-card';
const LIGHT = [TILT, '.idea', '.release', '.cal-cell', '.snk-panel', '.cpk-card', '.mq-card', '.person-row'].join(',');

const RIPPLE = [
  '.btn',
  '.icon-btn',
  '.nav-link',
  '.sort-pills button',
  '.wl-tab',
  '.snk-tab',
  '.tab',
  '.chip',
  '.fits-chip',
  '.style-chip',
  '.wl-cat-chip',
  '.wl-status-chip',
  '.snk-brand-tag',
  '.snk-cond-chip',
  '.snk-color-chip',
  '.shoe-chip',
  '.rack-item',
  '.slot-tab',
  '[data-ripple]',
].join(',');

const REVEAL = [
  '.fit-card',
  '.snk-card',
  '.wl-card',
  '.tile:not(.is-skeleton)',
  '.an-card',
  '.idea',
  '.release',
  '.snk-panel',
  '.wl-prices',
  '.wardrobe-card',
  '.person-row',
  '[data-reveal]',
].join(',');

const MAX_TILT = 6;

export function GlobalFx() {
  const light = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const section = pathname.split('/')[1] ?? '';

  // Inclinación + luz que sigue al cursor (un solo listener para toda la app).
  useEffect(() => {
    if (reducedMotion() || !canHover()) return;
    let current: HTMLElement | null = null;
    let frame = 0;
    let last: PointerEvent | null = null;
    const lightEl = light.current;

    const reset = (el: HTMLElement | null) => {
      if (!el) return;
      el.style.removeProperty('--cy-rx');
      el.style.removeProperty('--cy-ry');
      el.classList.remove('cy-hot');
    };
    const hideLight = () => {
      if (lightEl) lightEl.style.opacity = '0';
    };

    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const target = e.target instanceof Element ? (e.target.closest(LIGHT) as HTMLElement | null) : null;
      if (target !== current) {
        reset(current);
        current = target;
        if (!target) return hideLight();
        target.classList.add('cy-hot');
      }
      if (!current) return;
      const r = current.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      if (current.matches(TILT)) {
        current.style.setProperty('--cy-rx', `${((0.5 - y) * MAX_TILT).toFixed(2)}deg`);
        current.style.setProperty('--cy-ry', `${((x - 0.5) * MAX_TILT).toFixed(2)}deg`);
      }
      if (lightEl && !current.matches(OWN_LIGHT)) {
        const radius = getComputedStyle(current).borderRadius || '6px';
        lightEl.style.cssText = `opacity:1;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${radius};--lx:${(x * 100).toFixed(1)}%;--ly:${(y * 100).toFixed(1)}%`;
      } else hideLight();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeaveWindow = () => {
      reset(current);
      current = null;
      hideLight();
    };
    const onScroll = () => hideLight();
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeaveWindow);
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('blur', onLeaveWindow);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeaveWindow);
      window.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('blur', onLeaveWindow);
      cancelAnimationFrame(frame);
      reset(current);
    };
  }, []);

  // Onda de luz al pulsar (también en pantallas táctiles).
  useEffect(() => {
    if (reducedMotion()) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !(e.target instanceof Element)) return;
      const el = e.target.closest(RIPPLE) as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return;
      const r = el.getBoundingClientRect();
      const size = Math.min(160, Math.max(r.width, r.height) * 1.2);
      const ring = document.createElement('span');
      ring.className = 'cy-ripple';
      ring.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;width:${size}px;height:${size}px`;
      ring.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ring);
      window.setTimeout(() => ring.remove(), 650);
    };
    document.addEventListener('pointerdown', onDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  // Aparición al entrar en pantalla: lo que se pinta fuera de la vista espera
  // con su animación de entrada en pausa y la reproduce al aparecer.
  useEffect(() => {
    if (reducedMotion() || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          en.target.classList.remove('cy-rv');
          io.unobserve(en.target);
        }
      },
      { rootMargin: '0px 0px -6% 0px' },
    );
    const mark = (el: Element) => {
      if (!(el instanceof HTMLElement) || el.classList.contains('cy-rv-done')) return;
      el.classList.add('cy-rv-done');
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.96 || r.height === 0) return;
      if (getComputedStyle(el).animationName === 'none') el.classList.add('cy-rv-auto');
      el.classList.add('cy-rv');
      io.observe(el);
    };
    const scan = (root: ParentNode) => {
      if (root instanceof Element && root.matches(REVEAL)) mark(root);
      root.querySelectorAll?.(REVEAL).forEach(mark);
    };
    const main = document.body;
    scan(main);
    const mo = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => n instanceof Element && scan(n));
    });
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, []);

  return createPortal(
    <>
      <div ref={light} className="cy-hoverlight" aria-hidden="true" />
      {/* Barrido de luz al cambiar de sección */}
      <div key={section} className="cy-route-sweep" aria-hidden="true" />
    </>,
    document.body,
  );
}
