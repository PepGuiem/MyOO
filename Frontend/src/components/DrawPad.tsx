import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawFootprint } from '../three/DrawBridge';
import { t } from '../i18n';

type Tool = 'marker' | 'spray' | 'eraser';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  tool: Tool;
  color: string;
  /** Grosor en píxeles de pantalla (CSS). */
  width: number;
  /** Semilla del spray: al repintar salen los mismos puntos. */
  seed: number;
  points: Point[];
}

export interface DrawResult {
  /** PNG transparente recortado al dibujo. */
  blob: Blob;
  footprint: DrawFootprint;
}

const COLORS = ['#F2F2F2', '#151517', '#8E8E93', '#E53935', '#FB8C00', '#FDD835', '#43A047', '#1E88E5', '#8E24AA', '#EC407A'];
const TOOL_LABEL: Record<Tool, string> = { marker: t('Rotulador'), spray: t('Spray'), eraser: t('Goma') };

/** Lado mayor de la imagen que se guarda (px): de sobra para la textura del calco. */
const EXPORT_SIDE = 1024;
/** Margen para el límite de 2 MB de las imágenes. */
const MAX_BYTES = 1.9 * 1024 * 1024;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pinta un trazo poco a poco (mientras se dibuja) o entero (al repintar): los
 * dos caminos dan el mismo resultado, también con el spray.
 */
class StrokePainter {
  private random: () => number;
  private carry = 0;
  private last: Point | null = null;

  constructor(
    private ctx: CanvasRenderingContext2D,
    private s: Stroke,
    private scale: number,
  ) {
    this.random = rng(s.seed);
  }

  add(p: Point) {
    const { ctx, s } = this;
    const k = this.scale;
    ctx.save();
    ctx.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over';
    if (s.tool === 'spray') {
      const r = s.width;
      const from = this.last ?? p;
      const dist = Math.hypot(p.x - from.x, p.y - from.y);
      const step = Math.max(1, r * 0.3);
      ctx.fillStyle = s.color;
      let t = this.last ? step - this.carry : 0;
      for (; t <= dist; t += step) {
        const x = from.x + ((p.x - from.x) * t) / Math.max(dist, 1e-6);
        const y = from.y + ((p.y - from.y) * t) / Math.max(dist, 1e-6);
        this.dab(x, y, r);
      }
      this.carry = dist - (t - step);
    } else {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width * k;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (this.last) {
        ctx.beginPath();
        ctx.moveTo(this.last.x * k, this.last.y * k);
        ctx.lineTo(p.x * k, p.y * k);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(p.x * k, p.y * k, (s.width * k) / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    this.last = p;
  }

  /** Una nube de gotas: más densas en el centro, como un aerosol. */
  private dab(x: number, y: number, r: number) {
    const { ctx } = this;
    const k = this.scale;
    const n = Math.round(6 + r * 0.9);
    const dot = Math.max(0.8, r / 16) * k;
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < n; i++) {
      const a = this.random() * Math.PI * 2;
      const d = r * Math.pow(this.random(), 0.75);
      ctx.fillRect((x + Math.cos(a) * d) * k - dot / 2, (y + Math.sin(a) * d) * k - dot / 2, dot, dot);
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Capa para dibujar a mano alzada encima del visor 3D. La cámara se queda
 * quieta mientras hay trazos; al aplicar, el dibujo se recorta, se guarda como
 * PNG transparente y la página lo proyecta sobre la prenda desde este punto de
 * vista.
 */
export function DrawPad({
  busy,
  error,
  onApply,
  onCancel,
  onCameraFree,
}: {
  busy: boolean;
  error: string | null;
  onApply: (result: DrawResult) => void;
  onCancel: () => void;
  /** true = sin trazos y «Girar vista» activo: el visor recibe el puntero. */
  onCameraFree?: (free: boolean) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<Tool>('marker');
  const [color, setColor] = useState('#F2F2F2');
  const [width, setWidth] = useState(8);
  const [orbit, setOrbit] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const active = useRef<{ stroke: Stroke; painter: StrokePainter; pointerId: number } | null>(null);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const scale = () => (canvas.current ? canvas.current.width / Math.max(1, canvas.current.clientWidth) : 1);

  const repaint = useCallback(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    const k = c.width / Math.max(1, c.clientWidth);
    for (const s of strokesRef.current) {
      const painter = new StrokePainter(ctx, s, k);
      for (const p of s.points) painter.add(p);
    }
  }, []);

  // El lienzo sigue el tamaño del visor (con la densidad de píxeles de la pantalla).
  useEffect(() => {
    const el = wrap.current;
    const c = canvas.current;
    if (!el || !c) return;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(el.clientWidth * dpr));
      c.height = Math.max(1, Math.round(el.clientHeight * dpr));
      repaint();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [repaint]);

  useEffect(() => {
    repaint();
  }, [strokes, repaint]);

  const cameraFree = orbit && strokes.length === 0;
  useEffect(() => onCameraFree?.(cameraFree), [cameraFree, onCameraFree]);

  const local = (e: React.PointerEvent): Point => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy || cameraFree || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const stroke: Stroke = { tool, color, width, seed: (Math.random() * 2 ** 31) | 0, points: [local(e)] };
    const painter = new StrokePainter(canvas.current!.getContext('2d')!, stroke, scale());
    painter.add(stroke.points[0]);
    active.current = { stroke, painter, pointerId: e.pointerId };
    setLocalError(null);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.pointerId !== e.pointerId) return;
    // Los eventos agrupados dan trazos más finos en pantallas rápidas.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    const r = canvas.current!.getBoundingClientRect();
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const p = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      const last = a.stroke.points[a.stroke.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.75) continue;
      a.stroke.points.push(p);
      a.painter.add(p);
    }
  };
  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const a = active.current;
    if (!a || a.pointerId !== e.pointerId) return;
    active.current = null;
    const done = a.stroke;
    setStrokes((list) => [...list, done]);
  };

  /** Recorta el dibujo, lo exporta a PNG y calcula su huella en pantalla. */
  async function apply() {
    const c = canvas.current;
    if (!c) return;
    const ink = strokes.filter((s) => s.tool !== 'eraser');
    if (!ink.length) {
      setLocalError(t('Dibuja algo encima de la prenda primero.'));
      return;
    }
    // Recuadro de los trazos (en px CSS), con su grosor.
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const s of ink) {
      const m = s.tool === 'spray' ? s.width + 2 : s.width / 2 + 2;
      for (const p of s.points) {
        x0 = Math.min(x0, p.x - m);
        y0 = Math.min(y0, p.y - m);
        x1 = Math.max(x1, p.x + m);
        y1 = Math.max(y1, p.y + m);
      }
    }
    // Proporción entre 1:4 y 4:1 (lo que admite el calco): se amplía el lado corto.
    let w = x1 - x0;
    let h = y1 - y0;
    if (w / h > 4) {
      const nh = w / 4;
      y0 -= (nh - h) / 2;
      h = nh;
    } else if (h / w > 4) {
      const nw = h / 4;
      x0 -= (nw - w) / 2;
      w = nw;
    }
    const k = c.width / Math.max(1, c.clientWidth);
    let side = Math.min(EXPORT_SIDE, Math.max(w, h) * k);
    let blob: Blob | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const f = side / Math.max(w, h);
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(w * f));
      out.height = Math.max(1, Math.round(h * f));
      out.getContext('2d')!.drawImage(c, x0 * k, y0 * k, w * k, h * k, 0, 0, out.width, out.height);
      blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
      if (blob && blob.size <= MAX_BYTES) break;
      side *= 0.7;
    }
    if (!blob || blob.size > MAX_BYTES) {
      setLocalError(t('El dibujo es demasiado grande para guardarlo. Prueba con menos spray.'));
      return;
    }
    const r = c.getBoundingClientRect();
    const samples: { x: number; y: number }[] = [];
    for (const s of ink) for (const p of s.points) samples.push({ x: p.x + r.left, y: p.y + r.top });
    onApply({ blob, footprint: { rect: { left: r.left + x0, top: r.top + y0, width: w, height: h }, samples } });
  }

  const shownError = localError ?? error;

  return (
    <div className={`draw-pad${cameraFree ? ' is-orbit' : ''}`} ref={wrap}>
      <canvas
        ref={canvas}
        className="draw-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        aria-label={t('Lienzo para dibujar sobre la prenda')}
      />
      <div className="draw-toolbar" role="toolbar" aria-label={t('Herramientas de dibujo')}>
        <div className="segmented segmented-small" role="group" aria-label={t('Herramienta')}>
          {(Object.keys(TOOL_LABEL) as Tool[]).map((t) => (
            <button key={t} type="button" aria-pressed={tool === t} onClick={() => setTool(t)}>
              {TOOL_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="draw-colors" role="group" aria-label={t('Color')}>
          {COLORS.map((c) => (
            <button key={c} type="button" className={`color-chip${color === c ? ' is-active' : ''}`} style={{ background: c }} aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
          ))}
          <label className={`color-chip color-custom${!COLORS.includes(color) ? ' is-active' : ''}`} title={t('Otro color')} style={!COLORS.includes(color) ? { background: color } : undefined}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label={t('Otro color')} />
          </label>
        </div>
        <label className="draw-width">
          <span>{t('Grosor')}</span>
          <input type="range" min={2} max={48} step={1} value={width} onChange={(e) => setWidth(Number(e.target.value))} />
          <span className="draw-width-dot" style={{ width: Math.min(28, width), height: Math.min(28, width), background: tool === 'eraser' ? 'transparent' : color }} aria-hidden="true" />
        </label>
        <div className="draw-actions">
          <button type="button" className="btn btn-small" onClick={() => setStrokes((l) => l.slice(0, -1))} disabled={!strokes.length || busy}>
            {t('Deshacer')}
          </button>
          <button type="button" className="btn btn-small" onClick={() => setStrokes([])} disabled={!strokes.length || busy}>
            {t('Borrar')}
          </button>
          <button
            type="button"
            className="btn btn-small"
            aria-pressed={orbit}
            onClick={() => setOrbit((o) => !o)}
            disabled={strokes.length > 0 || busy}
            title={strokes.length ? t('Aplica o borra el dibujo para girar la prenda') : t('Girar la prenda para dibujar en otro lado')}
          >
            {orbit ? t('Volver a dibujar') : t('Girar vista')}
          </button>
          <span className="spacer" />
          <button type="button" className="btn btn-small btn-ghost" onClick={onCancel} disabled={busy}>
            {t('Cancelar')}
          </button>
          <button type="button" className="btn btn-small btn-primary" onClick={() => void apply()} disabled={!strokes.length || busy}>
            {busy ? t('Aplicando…') : t('Aplicar a la prenda')}
          </button>
        </div>
        <p className="draw-hint muted small" role="status">
          {shownError ??
            (cameraFree
              ? t('Gira la prenda hasta el lado donde quieras dibujar y pulsa «Volver a dibujar».')
              : t('Dibuja encima de la prenda. Al aplicar, el dibujo se estampa desde este punto de vista.'))}
        </p>
      </div>
    </div>
  );
}
