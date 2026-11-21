import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { prefersReducedMotion, seeded } from '../street/Street';

/** Firmas de la pared: inventadas, sin marcas reales. */
const TAGS = ['MYOO', 'DRIP', 'NO RULES', 'FITS', '24/7', 'CREW', 'RAW', 'LATE NITE', 'STAY REAL', 'OG', 'VSTDR', 'FRESH', 'X', 'BCN', 'TAKE IT'];
const INKS = ['#0b0b0c', '#0b0b0c', '#0b0b0c', '#ff4f8b', '#c6ff2e', '#f2efe8', '#ff2d4a', '#ff7a1a'];

/**
 * Fondo del vestidor: un baño de hormigón lleno de firmas, con tubos de neón
 * rojo que parpadean, fluorescentes fríos en el techo, suelo de baldosa
 * mojada y polvo flotando a la luz. Las capas se mueven un poco con el ratón
 * y con el scroll (parallax). Va detrás de todo (portal a <body>) y con
 * «reducir movimiento» se queda quieto.
 */
export function NeonScene() {
  const root = useRef<HTMLDivElement>(null);
  const dust = useRef<HTMLCanvasElement>(null);

  const tags = useMemo(() => {
    const r = seeded('myout-neon-wall');
    return Array.from({ length: 34 }, (_, i) => {
      const text = TAGS[i % TAGS.length];
      const ink = INKS[Math.floor(r() * INKS.length)];
      return {
        text,
        x: r() * 1600,
        y: 80 + r() * 640,
        size: 26 + r() * 64,
        rot: -14 + r() * 22,
        ink,
        o: ink === '#0b0b0c' ? 0.55 + r() * 0.3 : 0.16 + r() * 0.22,
        drip: r() > 0.62,
      };
    });
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el || prefersReducedMotion()) return;
    let frame = 0;
    let px = 0;
    let py = 0;
    // Último valor escrito de cada variable: si no cambia (p. ej. el scroll
    // pasado el tope de 2400 px), no se toca el estilo y el navegador no
    // tiene que recalcular el fondo.
    const last: Record<string, string> = {};
    const set = (name: string, value: string) => {
      if (last[name] === value) return;
      last[name] = value;
      el.style.setProperty(name, value);
    };
    const apply = () => {
      frame = 0;
      set('--px', px.toFixed(3));
      set('--py', py.toFixed(3));
      set('--sy', String(Math.min(window.scrollY, 2400)));
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onMove = (e: PointerEvent) => {
      px = (e.clientX / window.innerWidth) * 2 - 1;
      py = (e.clientY / window.innerHeight) * 2 - 1;
      queue();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', queue, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', queue);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Polvo: unas pocas motas en un canvas 2D a baja resolución.
  useEffect(() => {
    const canvas = dust.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = prefersReducedMotion();
    const r = seeded('dust');
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.width = Math.round(window.innerWidth / 2);
      h = canvas.height = Math.round(window.innerHeight / 2);
    };
    resize();
    const motes = Array.from({ length: 46 }, () => ({
      x: r(),
      y: r(),
      s: 0.4 + r() * 1.3,
      v: 0.00006 + r() * 0.00016,
      drift: r() * Math.PI * 2,
      warm: r() > 0.45,
    }));
    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        if (!reduced) {
          m.y -= m.v * dt;
          m.drift += dt * 0.0006;
          m.x += Math.sin(m.drift) * 0.00005 * dt;
          if (m.y < -0.02) {
            m.y = 1.02;
            m.x = r();
          }
        }
        // Más brillo cerca de los tubos (arriba a la izquierda y a la derecha).
        const glow = Math.max(0.15, 1 - Math.min(Math.hypot(m.x - 0.12, m.y - 0.25), Math.hypot(m.x - 0.86, m.y - 0.18)) * 1.6);
        ctx.fillStyle = m.warm ? `rgba(255, 120, 140, ${0.5 * glow})` : `rgba(235, 232, 225, ${0.38 * glow})`;
        ctx.beginPath();
        ctx.arc(m.x * w, m.y * h, m.s, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduced && !document.hidden) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const onVisible = () => {
      if (!document.hidden && !reduced) {
        last = performance.now();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(draw);
      }
    };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return createPortal(
    <div ref={root} className="neon-scene" aria-hidden="true">
      <div className="neon-wall" />
      <svg className="neon-tags" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        {tags.map((t, i) => (
          <g key={i} transform={`translate(${t.x.toFixed(0)} ${t.y.toFixed(0)}) rotate(${t.rot.toFixed(1)})`} opacity={t.o.toFixed(2)}>
            <text fontSize={t.size.toFixed(0)} fill={t.ink}>
              {t.text}
            </text>
            {t.drip && <path d={`M${(t.size * 0.4).toFixed(0)} 6 v${(t.size * 0.5).toFixed(0)}`} stroke={t.ink} strokeWidth="3" strokeLinecap="round" />}
          </g>
        ))}
        {/* Garabatos sueltos: corona, flecha, estrella y una X tachada */}
        <g className="neon-doodles" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1210 140 l20 -34 l18 26 l18 -30 l18 30 l18 -26 l20 34 z" stroke="#f2efe8" strokeWidth="4" opacity=".28" />
          <path d="M140 640 c60 -40 140 -40 210 -6 m-24 -24 l24 24 l-30 12" stroke="#c6ff2e" strokeWidth="5" opacity=".22" />
          <path d="M820 120 l12 26 28 4 -20 20 5 28 -25 -13 -25 13 5 -28 -20 -20 28 -4z" stroke="#ff4f8b" strokeWidth="4" opacity=".3" />
          <path d="M1440 560 l60 60 m0 -60 l-60 60" stroke="#ff2d4a" strokeWidth="9" opacity=".3" />
        </g>
      </svg>
      <div className="neon-floor" />
      <div className="neon-lights">
        <span className="tube tube-red tube-h" />
        <span className="tube tube-red tube-v" />
        <span className="tube tube-red tube-v tube-v2" />
        <span className="tube tube-cold tube-c1" />
        <span className="tube tube-cold tube-c2" />
      </div>
      <canvas ref={dust} className="neon-dust" />
      <div className="neon-vignette" />
    </div>,
    document.body,
  );
}
