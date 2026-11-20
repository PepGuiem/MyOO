import { Canvas, createPortal, useFrame, useThree, type RootState } from '@react-three/fiber';
import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import * as THREE from 'three';
import { setupRenderer } from './env';
import { ViewEntryContext, bindCanvas, lastActivity, requestDraw, subscribeViews, touchEntry, views, viewsVersion, type ViewEntry } from './viewStore';

/**
 * UN solo <canvas> WebGL que pinta todas las miniaturas 3D de la página (cada
 * miniatura es un <SceneView> que marca un hueco en el HTML). Los navegadores
 * limitan el número de contextos WebGL (~16), así que no hay uno por miniatura.
 *
 * Para que los modelos no «bailen» al hacer scroll:
 * - El canvas NO es fijo: va dentro de la página (capa `.view-layer`) y se
 *   recoloca en cada fotograma. Así, cuando el navegador desplaza la página
 *   (en otro hilo, antes de que nos dé tiempo a repintar), el dibujo se mueve
 *   pegado a sus tarjetas, en vez de quedarse un fotograma atrás.
 * - Es algo más alto que la pantalla (margen arriba y abajo) y solo se repinta
 *   al desplazarse más de medio margen.
 * - Cada miniatura se recorta con sus contenedores (carruseles, paneles con
 *   scroll), para que no se salga de ellos.
 *
 * Y para el rendimiento: solo se dibuja cuando algo cambia (frameloop
 * «demand»), nunca en reposo; y solo las miniaturas cerca de la pantalla.
 */
export function ViewCanvas() {
  const layer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(stageHeight);

  useEffect(() => {
    const onResize = () => {
      setHeight(stageHeight());
      for (const e of views.values()) e.clips = null;
      requestDraw();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div ref={layer} className="view-layer" aria-hidden="true">
      <div ref={stage} className="view-stage" style={{ height }}>
        <Canvas
          className="view-canvas"
          frameloop="demand"
          dpr={[1, coarsePointer() ? 1.5 : 2]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          resize={{ scroll: false, debounce: 0 }}
          onCreated={(state) => {
            setupRenderer(state);
            state.gl.autoClear = false;
            state.gl.setClearColor(0x000000, 0);
          }}
          style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <Port layer={layer} stage={stage} />
        </Canvas>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Medidas del canvas

const OVERSCAN = 0.35; // margen arriba y abajo, en pantallas
let maxVh = 0;
let maxVhWidth = 0;
/** Margen (px) que sobresale el canvas por arriba y por abajo de la pantalla. */
let over = 0;

/**
 * Alto del canvas: pantalla + márgenes. En el móvil la barra de direcciones
 * cambia el alto al hacer scroll; se usa el mayor visto para ese ancho, así el
 * canvas no se redimensiona (y no parpadea) mientras se desplaza.
 */
function stageHeight(): number {
  if (typeof window === 'undefined') return 1000;
  const w = window.innerWidth;
  if (w !== maxVhWidth) {
    maxVhWidth = w;
    maxVh = 0;
  }
  maxVh = Math.max(maxVh, window.innerHeight);
  over = Math.round(maxVh * OVERSCAN);
  return maxVh + over * 2;
}

function coarsePointer(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
}

// ---------------------------------------------------------------------------
// Dentro del canvas

function Port({ layer, stage }: { layer: RefObject<HTMLDivElement | null>; stage: RefObject<HTMLDivElement | null> }) {
  useSyncExternalStore(subscribeViews, viewsVersion);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    bindCanvas(() => invalidate(), startWatcher);
    invalidateOnly = () => invalidate();
    startWatcher();
    // Scroll dentro de un contenedor (carrusel, panel): repintar ya.
    // El de la página lo vigila el observador (solo hace falta al pasar medio margen).
    const onScroll = (ev: Event) => {
      if (ev.target === document || ev.target === document.documentElement) startWatcher();
      else invalidate();
    };
    const onVisible = () => {
      if (!document.hidden) {
        startWatcher();
        invalidate();
      }
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      bindCanvas(null, null);
      window.removeEventListener('scroll', onScroll, { capture: true });
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [invalidate]);

  // Prioridad 1: R3F deja de pintar por su cuenta y lo hacemos aquí.
  useFrame((state) => drawAll(state, layer.current, stage.current), 1);

  const mounted = [...views.values()].filter((e) => e.mounted);
  return (
    <>
      {mounted.map((e) => (
        <ViewScene key={e.id} entry={e} />
      ))}
    </>
  );
}

/**
 * El contenido 3D de una miniatura, en su propia escena. `memo`: al montar
 * otra miniatura no se vuelve a pintar el contenido de las demás.
 */
const ViewScene = memo(function ViewScene({ entry }: { entry: ViewEntry }) {
  useSyncExternalStore(
    (cb) => {
      entry.listeners.add(cb);
      return () => entry.listeners.delete(cb);
    },
    () => entry.version,
  );
  return createPortal(
    <ViewEntryContext.Provider value={entry}>
      <Grab entry={entry} />
      {entry.content}
    </ViewEntryContext.Provider>,
    entry.scene,
    { events: { enabled: false, priority: 0 }, size: { width: entry.size.width, height: entry.size.height, top: 0, left: 0 } },
  );
});

/** Guarda el estado del portal (su cámara) para pintar desde fuera. */
function Grab({ entry }: { entry: ViewEntry }) {
  const get = useThree((s) => s.get);
  useLayoutEffect(() => {
    entry.get = get;
    requestDraw();
    return () => {
      if (entry.get === get) entry.get = null;
    };
  }, [entry, get]);
  return null;
}

// ---------------------------------------------------------------------------
// Pintado

let drawnScrollY = NaN;
let drawnScrollX = NaN;
let lastDraw = 0;

function drawAll(state: RootState, layer: HTMLDivElement | null, stage: HTMLDivElement | null) {
  if (!layer || !stage) return;
  const gl = state.gl;
  const W = state.size.width;
  const H = state.size.height;

  // El canvas cubre la pantalla con su margen: lo colocamos en la capa
  // (que ocupa toda la página) justo donde está la pantalla ahora.
  const lr = layer.getBoundingClientRect();
  stage.style.transform = `translate3d(${-lr.left}px, ${-lr.top - over}px, 0)`;
  drawnScrollY = window.scrollY;
  drawnScrollX = window.scrollX;
  const now = performance.now();
  lastDraw = now;

  gl.setScissorTest(false);
  gl.clear(true, true, true);

  const clipRects = new Map<HTMLElement, DOMRect>();
  for (const e of views.values()) {
    e.onCanvas = false;
    if (!e.mounted || !e.near) continue;
    const r = e.el.getBoundingClientRect();
    e.last = { x: r.left + drawnScrollX, y: r.top + drawnScrollY, w: r.width, h: r.height };
    if (!e.get || r.width < 1 || r.height < 1) continue;
    if (Math.abs(r.width - e.size.width) > 1 || Math.abs(r.height - e.size.height) > 1) {
      e.size = { width: r.width, height: r.height };
      touchEntry(e);
    }

    // Parte visible: el hueco recortado por sus contenedores y por el canvas.
    let l = Math.max(r.left, 0);
    let t = Math.max(r.top, -over);
    let rr = Math.min(r.right, W);
    let b = Math.min(r.bottom, H - over);
    if (!e.clips || now - e.clipsAt > 2000) {
      e.clips = clipAncestors(e.el);
      e.clipsAt = now;
    }
    for (const c of e.clips) {
      let cr = clipRects.get(c);
      if (!cr) {
        cr = c.getBoundingClientRect();
        clipRects.set(c, cr);
      }
      l = Math.max(l, cr.left);
      t = Math.max(t, cr.top);
      rr = Math.min(rr, cr.right);
      b = Math.min(b, cr.bottom);
    }
    if (rr - l < 1 || b - t < 1) continue;

    const camera = e.get().camera;
    const aspect = r.width / r.height;
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as THREE.PerspectiveCamera;
      if (Math.abs(cam.aspect - aspect) > 1e-4) {
        cam.aspect = aspect;
        cam.updateProjectionMatrix();
      }
    }
    // WebGL cuenta desde abajo.
    gl.setViewport(r.left, H - (r.top + over) - r.height, r.width, r.height);
    gl.setScissor(l, H - (b + over), rr - l, b - t);
    gl.setScissorTest(true);
    gl.render(e.scene, camera);
    e.onCanvas = true;
  }
  gl.setScissorTest(false);
}

/** Ancestros con overflow distinto de visible (recortan la miniatura). */
function clipAncestors(el: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vigilante: un rAF ligero que solo pide un fotograma cuando hace falta
// (una tarjeta se movió o cambió de tamaño, o el scroll pasó medio margen).
// Sin miniaturas cerca, se para.

let raf = 0;
let invalidateOnly: () => void = () => {};
// Por si algo (una textura) termina de cargar sin avisar: un repintado cada
// 1,5 s, solo durante los 12 s siguientes a un cambio.
const HEARTBEAT_MS = 1500;
const HEARTBEAT_FOR_MS = 12000;

function startWatcher() {
  if (!raf && typeof document !== 'undefined' && !document.hidden) raf = requestAnimationFrame(tick);
}

function tick() {
  raf = 0;
  if (document.hidden) return;
  const sx = window.scrollX;
  const sy = window.scrollY;
  let dirty = Math.abs(sy - drawnScrollY) > over * 0.5 || Math.abs(sx - drawnScrollX) > 0.5 || Number.isNaN(drawnScrollY);
  let any = false;
  for (const e of views.values()) {
    if (!e.mounted || !e.near) continue;
    any = true;
    if (dirty) break;
    const last = e.last;
    if (!last) {
      dirty = true;
      break;
    }
    const r = e.el.getBoundingClientRect();
    if (
      Math.abs(r.left + sx - last.x) > 0.5 ||
      Math.abs(r.top + sy - last.y) > 0.5 ||
      Math.abs(r.width - last.w) > 0.5 ||
      Math.abs(r.height - last.h) > 0.5
    )
      dirty = true;
  }
  const now = performance.now();
  if (any && !dirty && now - lastDraw > HEARTBEAT_MS && now - lastActivity < HEARTBEAT_FOR_MS) {
    lastDraw = now;
    invalidateOnly();
  } else if (dirty) requestDraw();
  if (any || dirty) raf = requestAnimationFrame(tick);
}
