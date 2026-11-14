import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { PatternSpec, PatternTarget } from '../api/types';
import {
  KIND_INFO,
  normalizePattern,
  PATTERN_DEFAULTS,
  PATTERN_LIMITS,
  PATTERN_PALETTE,
  PATTERN_PRESETS,
  PATTERN_TARGET_LABEL,
  renderPatternPreview,
  type PatternPreset,
} from '../lib/patterns';
import { ColorRow } from './ColorRow';
import { t } from '../i18n';

interface Props {
  /** Color de la prenda (el fondo del estampado). */
  base: string;
  /** Estampado actual (también el equivalente de uno antiguo), o null si es liso. */
  value: PatternSpec | null;
  onChange: (spec: PatternSpec | null) => void;
  /** ¿Tiene la prenda paneles secundarios? (si no, no se ofrece esa zona). */
  hasSecondary: boolean;
  /** Escala de los estilos para esta prenda (`patternScaleFor`): menor en calzado y gorras. */
  scale?: number;
}

/** Paletas para «Sorpréndeme». */
const RANDOM_PALETTES = [
  ['#151517', '#E8E4DA', '#8C3B3B'],
  ['#2B3445', '#8FA6C1', '#E8E4DA'],
  ['#5F6B52', '#C9A15A', '#3B2F2A'],
  ['#D9578C', '#3FB8A8', '#F2D16B'],
  ['#151517', '#C9A15A'],
  ['#E8E4DA', '#4A4A50'],
  ['#1E3A5F', '#D8B260', '#F2F2F2', '#8C3B3B'],
  ['#3B2F2A', '#B87333', '#E8E0D0'],
];

const LOG_MIN = Math.log(PATTERN_LIMITS.minSize);
const LOG_MAX = Math.log(PATTERN_LIMITS.maxSize);
const sizeToSlider = (s: number) => Math.round(((Math.log(s) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 1000);
const sliderToSize = (t: number) => Math.exp(LOG_MIN + (t / 1000) * (LOG_MAX - LOG_MIN));

/** Un color que contraste con el de la prenda. */
function contrastColor(base: string): string {
  const v = parseInt(base.slice(1), 16);
  const l = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return l > 0.5 ? '#2B3445' : '#E8E4DA';
}

/** Colores para un estilo: su paleta propia, o los actuales completados hasta los que pide. */
function presetColors(preset: PatternPreset, current: string[] | null, base: string): string[] {
  if (preset.palette) return preset.palette.slice(0, PATTERN_LIMITS.maxColors);
  const out = (current?.length ? current : [contrastColor(base)]).slice(0, preset.colors);
  for (const c of PATTERN_PALETTE) {
    if (out.length >= preset.colors) break;
    if (!out.includes(c) && c.toUpperCase() !== base.toUpperCase()) out.push(c);
  }
  return out;
}

function presetSpec(preset: PatternPreset, prev: PatternSpec | null, base: string, scale: number): PatternSpec {
  return normalizePattern({
    ...PATTERN_DEFAULTS,
    kind: preset.kind,
    size: preset.size * scale,
    thickness: preset.thickness,
    count: preset.count,
    angle: preset.angle,
    softness: preset.softness ?? 0,
    colors: presetColors(preset, prev?.colors ?? null, base),
    // Se mantiene dónde va y su intensidad.
    target: prev?.target ?? 'main',
    opacity: prev?.opacity ?? 1,
  });
}

const near = (a: number, b: number, eps: number) => Math.abs(a - b) <= eps;
function matchesPreset(spec: PatternSpec, p: PatternPreset, scale: number): boolean {
  return spec.kind === p.kind && near(spec.size, p.size * scale, 0.0005) && near(spec.thickness, p.thickness, 0.01) && spec.count === p.count && near(spec.angle, p.angle, 0.5);
}

/** Lienzo con la vista plana del estampado (miniatura o vista grande). */
function PatternCanvas({ spec, base, width, height, widthM, className }: { spec: PatternSpec | null; base: string; width: number; height: number; widthM: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(spec);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    // Se pinta en el siguiente fotograma: arrastrar un deslizador no se atasca.
    const raf = requestAnimationFrame(() => {
      if (!spec) {
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, width, height);
        return;
      }
      const data = renderPatternPreview(spec, base, width, height, widthM);
      ctx.putImageData(new ImageData(data, width, height), 0, 0);
    });
    return () => cancelAnimationFrame(raf);
    // key representa el contenido de spec
  }, [key, base, width, height, widthM]);
  return <canvas ref={ref} width={width} height={height} className={className} aria-hidden="true" />;
}

function Slider({ label, value, display, min, max, step, onChange }: { label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="field pattern-slider">
      <span>
        {label}
        <output>{display}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

const DIRECTIONS: { angle: number; label: string; title: string; path: string }[] = [
  { angle: 0, label: t('Horizontal'), title: t('Horizontal (0°)'), path: 'M2 5h12M2 8h12M2 11h12' },
  { angle: 90, label: t('Vertical'), title: t('Vertical (90°)'), path: 'M5 2v12M8 2v12M11 2v12' },
  { angle: 45, label: t('Diagonal /'), title: t('Diagonal ascendente (45°)'), path: 'M2 9 9 2M2 14 14 2M7 14l7-7' },
  { angle: -45, label: t('Diagonal \\'), title: t('Diagonal descendente (−45°)'), path: 'M2 7l7 7M2 2l12 12M7 2l7 7' },
];

/**
 * Editor del estampado de la tela: estilos rápidos con miniatura y todos los
 * ajustes (colores, tamaño, grosor, cantidad, dirección, intensidad, bordes,
 * posición y zona de la prenda).
 */
export function PatternEditor({ base, value, onChange, hasSecondary, scale = 1 }: Props) {
  const id = useId();
  const [openColor, setOpenColor] = useState<number | null>(null);
  const spec = value;
  const info = spec ? KIND_INFO[spec.kind] : null;
  const active = spec ? PATTERN_PRESETS.find((p) => matchesPreset(spec, p, scale)) : null;
  // Las miniaturas usan los colores actuales (o los de su paleta propia).
  const thumbs = useMemo(
    () => PATTERN_PRESETS.map((p) => ({ preset: p, spec: { ...presetSpec(p, spec, base, scale), opacity: 1, offsetX: 0, offsetY: 0 } })),
    // Solo cambian con los colores, el fondo y la escala
    [JSON.stringify(spec?.colors ?? null), base, scale],
  );

  const set = (patch: Partial<PatternSpec>) => spec && onChange(normalizePattern({ ...spec, ...patch }));
  const setColor = (i: number, c: string) => spec && set({ colors: spec.colors.map((x, k) => (k === i ? c.toUpperCase() : x)) });
  const addColor = () => {
    if (!spec || spec.colors.length >= PATTERN_LIMITS.maxColors) return;
    const next = PATTERN_PALETTE.find((c) => !spec.colors.includes(c) && c !== base.toUpperCase()) ?? '#8C8C8C';
    set({ colors: [...spec.colors, next] });
    setOpenColor(spec.colors.length);
  };
  const removeColor = (i: number) => {
    if (!spec || spec.colors.length <= 1) return;
    set({ colors: spec.colors.filter((_, k) => k !== i) });
    setOpenColor(null);
  };
  const randomize = () => {
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
    const preset = pick(PATTERN_PRESETS);
    const palette = preset.palette ?? pick(RANDOM_PALETTES).slice(0, Math.max(1, Math.ceil(Math.random() * 3)));
    const r = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
    onChange(
      normalizePattern({
        ...PATTERN_DEFAULTS,
        kind: preset.kind,
        colors: palette,
        size: preset.size * scale * r(0.6, 1.6),
        thickness: Math.min(0.9, Math.max(0.1, preset.thickness * r(0.7, 1.3))),
        count: KIND_INFO[preset.kind].count ? Math.ceil(Math.random() * 3) : 1,
        angle: pick([0, 0, 0, 90, 45, -45, Math.round(r(-60, 60))]),
        softness: preset.softness ?? (Math.random() < 0.2 ? r(0.1, 0.4) : 0),
        target: spec?.target ?? 'main',
      }),
    );
  };

  // Vista plana: un trozo de tela del tamaño aproximado de la prenda.
  const previewM = 0.4 * scale;
  const targets: PatternTarget[] = hasSecondary ? ['main', 'secondary', 'all'] : ['main', 'all'];
  const deg = spec ? Math.round(spec.angle) : 0;

  return (
    <div className="pattern-editor">
      <div className="pattern-head">
        <span id={`${id}-label`}>{t('Estampado de la tela')}</span>
        <button type="button" className="btn-link" onClick={randomize}>
          {t('Sorpréndeme')}
        </button>
      </div>
      <div className="pattern-grid" role="listbox" aria-labelledby={`${id}-label`}>
        <button type="button" role="option" aria-selected={!spec} className={`pattern-swatch${!spec ? ' is-active' : ''}`} onClick={() => onChange(null)} title={t('Sin estampado')}>
          <PatternCanvas spec={null} base={base} width={56} height={56} widthM={0.1} />
          <span>{t('Liso')}</span>
        </button>
        {thumbs.map(({ preset, spec: s }) => (
          <button
            key={preset.id}
            type="button"
            role="option"
            aria-selected={active?.id === preset.id}
            className={`pattern-swatch${active?.id === preset.id ? ' is-active' : ''}`}
            onClick={() => onChange(presetSpec(preset, spec, base, scale))}
            title={preset.label}
          >
            <PatternCanvas spec={s} base={base} width={56} height={56} widthM={Math.min(0.6, Math.max(0.06, preset.size * 3)) * scale} />
            <span>{preset.label}</span>
          </button>
        ))}
      </div>

      {spec && info && (
        <div className="pattern-settings">
          <div className="pattern-preview">
            <PatternCanvas spec={spec} base={base} width={560} height={200} widthM={previewM} className="pattern-preview-canvas" />
            <span className="pattern-preview-label">
              {t('{label}{v} · vista plana de {round} cm', { label: info.label, v: !active && t(' · personalizado'), round: Math.round(previewM * 100) })}
            </span>
          </div>

          <div className="pattern-colors">
            {spec.colors.map((c, i) => (
              <ColorRow
                key={i}
                label={`Color ${i + 1}`}
                value={c}
                required
                onChange={(v) => v && setColor(i, v)}
                open={openColor === i}
                onToggle={() => setOpenColor((k) => (k === i ? null : i))}
                onRemove={spec.colors.length > 1 ? () => removeColor(i) : undefined}
              />
            ))}
            {spec.colors.length < PATTERN_LIMITS.maxColors && (
              <button type="button" className="btn btn-small pattern-add-color" onClick={addColor}>
                {t('+ Añadir color')}
              </button>
            )}
            <p className="muted small">{t('{colors} El fondo es el color de la prenda.', { colors: info.colors })}</p>
          </div>

          <Slider
            label={t('Tamaño de la repetición')}
            value={sizeToSlider(spec.size)}
            display={`${(spec.size * 100).toFixed(spec.size < 0.1 ? 1 : 0)} cm`}
            min={0}
            max={1000}
            step={1}
            onChange={(t) => set({ size: Math.round(sliderToSize(t) * 10000) / 10000 })}
          />
          {info.thickness && (
            <Slider label={info.thickness} value={Math.round(spec.thickness * 100)} display={`${Math.round(spec.thickness * 100)} %`} min={2} max={98} step={1} onChange={(v) => set({ thickness: v / 100 })} />
          )}
          {info.count && (
            <div className="field">
              <span id={`${id}-count`}>{info.count}</span>
              <div className="segmented segmented-small segmented-fill" role="group" aria-labelledby={`${id}-count`}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button key={n} type="button" aria-pressed={spec.count === n} onClick={() => set({ count: n })}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="field">
            <span id={`${id}-dir`}>
              {t('Dirección')} <output>{deg}°</output>
            </span>
            <div className="segmented segmented-small segmented-fill pattern-dirs" role="group" aria-labelledby={`${id}-dir`}>
              {DIRECTIONS.map((d) => (
                <button key={d.angle} type="button" aria-pressed={deg === d.angle} aria-label={d.label} title={d.title} onClick={() => set({ angle: d.angle })}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                    <path d={d.path} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              ))}
            </div>
            <input type="range" min={-180} max={180} step={1} value={deg} aria-label={t('Giro en grados')} onChange={(e) => set({ angle: Number(e.target.value) })} />
          </div>

          <div className="field">
            <span id={`${id}-target`}>{t('Dónde')}</span>
            <div className="segmented segmented-small segmented-fill" role="group" aria-labelledby={`${id}-target`}>
              {targets.map((t) => (
                <button key={t} type="button" aria-pressed={spec.target === t} onClick={() => set({ target: t })}>
                  {PATTERN_TARGET_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <details className="pattern-more">
            <summary>{t('Más ajustes: intensidad, bordes y posición')}</summary>
            <Slider label={t('Intensidad')} value={Math.round(spec.opacity * 100)} display={`${Math.round(spec.opacity * 100)} %`} min={5} max={100} step={1} onChange={(v) => set({ opacity: v / 100 })} />
            <Slider label={t('Bordes difuminados')} value={Math.round(spec.softness * 100)} display={spec.softness ? `${Math.round(spec.softness * 100)} %` : t('Nítidos')} min={0} max={100} step={1} onChange={(v) => set({ softness: v / 100 })} />
            <Slider label={t('Desplazar en horizontal')} value={Math.round(spec.offsetX * 100)} display={`${Math.round(spec.offsetX * 100)} %`} min={0} max={100} step={1} onChange={(v) => set({ offsetX: v / 100 })} />
            <Slider label={t('Desplazar en vertical')} value={Math.round(spec.offsetY * 100)} display={`${Math.round(spec.offsetY * 100)} %`} min={0} max={100} step={1} onChange={(v) => set({ offsetY: v / 100 })} />
            <button type="button" className="btn-link" onClick={() => set({ opacity: 1, softness: 0, offsetX: 0, offsetY: 0 })}>
              {t('Restablecer estos ajustes')}
            </button>
          </details>
        </div>
      )}
    </div>
  );
}
