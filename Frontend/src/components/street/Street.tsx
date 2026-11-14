import { useEffect, useMemo, useRef, useState, type CSSProperties, type ElementType } from 'react';
import { LOCALE_TAG, t } from '../../i18n';

/**
 * Piezas "callejeras" del perfil: nombre pintado con spray, goteos, arte de
 * la portada y números que cuentan. Todo en CSS/SVG propios, sin librerías.
 * Lo aleatorio sale de una semilla (el nombre), así cada perfil tiene SU
 * pintada y no cambia al recargar.
 */

/** Generador pseudoaleatorio con semilla (mulberry32 sobre un hash del texto). */
export function seeded(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Nombre como pieza de grafiti: letras de cromo con contorno, sombra 3D del
 * color de acento y goteos. Se "pinta" de izquierda a derecha al aparecer.
 */
export function GraffitiName({ text, as: Tag = 'h1', className = '' }: { text: string; as?: ElementType; className?: string }) {
  const drips = useMemo(() => {
    const r = seeded(text);
    const n = Math.max(2, Math.min(6, Math.round(text.length / 3)));
    return Array.from({ length: n }, (_, i) => ({
      x: ((i + 0.2 + r() * 0.6) / n) * 100,
      h: 10 + r() * 22,
      w: 3 + r() * 4,
      d: 1.25 + i * 0.12 + r() * 0.4,
    }));
  }, [text]);
  return (
    <Tag className={`graffiti ${className}`}>
      <span className="graffiti-back" aria-hidden="true">
        {text}
      </span>
      <span className="graffiti-front">{text}</span>
      <span className="graffiti-drips" aria-hidden="true">
        {drips.map((d, i) => (
          <i key={i} style={{ left: `${d.x}%`, '--h': `${d.h}px`, '--w': `${d.w}px`, '--d': `${d.d}s` } as CSSProperties} />
        ))}
      </span>
      <span className="graffiti-shine" aria-hidden="true" />
      <span className="graffiti-mist" aria-hidden="true" />
    </Tag>
  );
}

/**
 * Pared de la portada cuando no hay foto: manchas de spray del color de
 * acento, una "bomba" grande con las iniciales en contorno, firmas, flechas
 * y una plantilla. Todo tenue: es fondo.
 */
export function CoverArt({ seed, initials }: { seed: string; initials: string }) {
  const art = useMemo(() => {
    const r = seeded(`${seed}-cover`);
    const splats = Array.from({ length: 7 }, () => ({ x: r() * 1600, y: r() * 460, rx: 90 + r() * 220, ry: 50 + r() * 120, o: 0.12 + r() * 0.22 }));
    const dots = Array.from({ length: 70 }, () => ({ x: r() * 1600, y: r() * 460, r: 0.6 + r() * 2.2, o: 0.1 + r() * 0.3 }));
    const tags = Array.from({ length: 3 }, () => ({ x: 120 + r() * 1300, y: 90 + r() * 300, rot: -14 + r() * 28, s: 0.7 + r() * 0.6 }));
    return { splats, dots, tags, rot: -7 + r() * 6, x: 760 + r() * 260 };
  }, [seed]);
  return (
    <svg className="cover-art" viewBox="0 0 1600 460" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <filter id="cover-blur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="38" />
        </filter>
      </defs>
      <g filter="url(#cover-blur)">
        {art.splats.map((s, i) => (
          <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} className="cover-splat" style={{ opacity: s.o }} />
        ))}
      </g>
      {art.dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} className="cover-dot" style={{ opacity: d.o }} />
      ))}
      <text className="cover-bomb" x={art.x} y="330" transform={`rotate(${art.rot} ${art.x} 260)`} textAnchor="middle">
        {initials}
      </text>
      {art.tags.map((t, i) => (
        <g key={i} className="cover-tag" transform={`translate(${t.x} ${t.y}) rotate(${t.rot}) scale(${t.s})`}>
          {/* Una firma rápida de rotulador, inventada (no son letras). */}
          <path d="M0 20c14-26 26-30 30-8s-8 26 4 6 22-34 30-10 4 22 18 4 18-22 26-4" />
          <path d="M-6 34c40 6 90 4 140-6" />
        </g>
      ))}
      <g className="cover-stencil" transform="translate(1390 410) rotate(-2)">
        <text x="0" y="0" textAnchor="end">
          {t('MYOUT · {getFullYear}', { getFullYear: new Date().getFullYear() })}
        </text>
      </g>
      <path className="cover-arrow" d="M150 380c60-40 140-52 230-36m0 0-28-22m28 22-30 18" />
    </svg>
  );
}

/** Fila de goteos de pintura colgando del borde inferior de la portada. */
export function DripEdge({ seed }: { seed: string }) {
  const drips = useMemo(() => {
    const r = seeded(`${seed}-edge`);
    return Array.from({ length: 14 }, (_, i) => ({ x: (i + r()) * (100 / 14), h: 8 + r() * 46, w: 4 + r() * 7, d: 0.5 + r() * 0.9 }));
  }, [seed]);
  return (
    <span className="drip-edge" aria-hidden="true">
      {drips.map((d, i) => (
        <i key={i} style={{ left: `${d.x}%`, '--h': `${d.h}px`, '--w': `${d.w}px`, '--d': `${d.d}s` } as CSSProperties} />
      ))}
    </span>
  );
}

/** Número que cuenta desde 0 al aparecer (o se queda quieto con movimiento reducido). */
export function CountUp({ value, duration = 900, delay = 0 }: { value: number; duration?: number; delay?: number }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const from = useRef(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now() + delay;
    const a = from.current;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - (1 - t) ** 3;
      const v = Math.round(a + (value - a) * eased);
      setShown(v);
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay]);
  return <>{new Intl.NumberFormat(LOCALE_TAG).format(shown)}</>;
}

/** Giro "a mano" de cada pegatina, estable para la misma etiqueta. */
export function stickerTilt(key: string): number {
  return Math.round((seeded(key)() * 12 - 6) * 10) / 10;
}
