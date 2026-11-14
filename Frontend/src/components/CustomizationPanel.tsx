import { useId, useState } from 'react';
import type {
  ButtonStyle,
  ColorSlot,
  CustomDetail,
  Customization,
  CustomizationOptions,
  DetailFont,
  DetailKind,
  DetailShape,
  MetalFinish,
  PatternSpec,
  StitchStyle,
} from '../api/types';
import {
  BUTTON_LABEL,
  COLOR_SLOT_LABEL,
  DETAIL_DEFAULTS,
  DETAIL_FONT_LABEL,
  DETAIL_KIND_LABEL,
  DETAIL_SHAPE_LABEL,
  GRAPHIC_KINDS,
  MAX_DETAIL_SIZE,
  MAX_DETAILS,
  MAX_DRAWING_SIZE,
  METAL_LABEL,
  PLACEABLE_KINDS,
  STITCH_LABEL,
} from '../lib/customLabels';
import { patternSpecOf } from '../three/partColors';
import { AssetPicker } from './AssetPicker';
import { DetailList } from './DetailList';
import { ColorRow } from './ColorRow';
import { PatternEditor } from './PatternEditor';
import { Select } from './Select';
import { t } from '../i18n';

export type CustomTab = 'colors' | 'parts' | 'details';
type Tab = CustomTab;

export interface PlacementState {
  /** Tipo de detalle que se va a colocar con el próximo clic, o "move" para mover el seleccionado. */
  mode: DetailKind | 'move' | null;
}

interface Props {
  options: CustomizationOptions;
  value: Customization;
  /**
   * Recibe una función (estado anterior -> nuevo) para que varios cambios
   * seguidos no se pisen entre sí.
   */
  onChange: (update: (prev: Customization) => Customization) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  placement: PlacementState['mode'];
  onPlacement: (mode: PlacementState['mode']) => void;
  /** Los modelos .glb reales no se pueden personalizar. */
  disabled?: boolean;
  /**
   * Modelo 3D de la biblioteca: solo se pueden colorear las piezas que trae
   * aparte (`colors`: botones, cremallera...) y quitar las de `parts`; el
   * estampado y los detalles funcionan siempre.
   */
  library?: { colors: ColorSlot[]; parts: string[] } | null;
  /** Abre el modo de dibujo a mano alzada sobre la prenda. */
  onDraw?: () => void;
  /** Color principal de la prenda (fondo del estampado). */
  baseColor: string;
  /** Escala de los estilos de estampado para este tipo de prenda. */
  patternScale?: number;
  /** Pestaña con la que se abre (p. ej. «Detalles» desde la lista del visor). */
  initialTab?: CustomTab;
}

/** Colores del estampado antiguo: ahora se eligen en el editor de estampado. */
const PATTERN_SLOTS: ColorSlot[] = ['pattern', 'pattern2'];

/** Editor de personalización: colores por componente, piezas y detalles. */
export function CustomizationPanel({ options, value, onChange, selectedId, onSelect, placement, onPlacement, disabled, library, onDraw, baseColor, patternScale = 1, initialTab }: Props) {
  const hasPattern = options.options.includes('pattern');
  // Colores disponibles: en los modelos de la biblioteca, solo sus piezas aparte.
  const colorSlots = options.colors.filter((slot) => !PATTERN_SLOTS.includes(slot) && (!library || library.colors.includes(slot)));
  // Estampado actual (en prendas antiguas, su equivalente configurable).
  const patternSpec = hasPattern ? patternSpecOf(baseColor, value) : null;
  const hasSecondary = library ? library.colors.includes('secondary') : options.colors.includes('secondary');
  const partList = library ? options.parts.filter((part) => library.parts.includes(part.key)) : options.parts;
  const tabs: Tab[] = [
    ...(colorSlots.length || hasPattern || !library ? (['colors'] as Tab[]) : []),
    ...(partList.length || !library ? (['parts'] as Tab[]) : []),
    'details',
  ];
  const [chosenTab, setTab] = useState<Tab>(initialTab ?? tabs[0]);
  // Solo una paleta de color abierta a la vez: la lista no crece sin fin.
  const [openColor, setOpenColor] = useState<string | null>(null);
  const toggleColor = (key: string) => setOpenColor((k) => (k === key ? null : key));
  const tab: Tab = tabs.includes(chosenTab) ? chosenTab : tabs[0];
  const metalParts = !library || library.colors.some((c) => c === 'zipper' || c === 'hardware');
  const details = value.details ?? [];
  const selected = details.find((d) => d.id === selectedId) ?? null;

  if (disabled) {
    return <p className="muted small">{t('Esta prenda usa un modelo 3D real (.glb): su personalización se hace en el propio archivo.')}</p>;
  }

  const setColor = (slot: ColorSlot, c: string | null) =>
    onChange((prev) => {
      const colors = { ...(prev.colors ?? {}) };
      if (c) colors[slot] = c.toUpperCase();
      else delete colors[slot];
      return { ...prev, colors };
    });
  const setOption = <K extends keyof NonNullable<Customization['options']>>(key: K, v: NonNullable<Customization['options']>[K] | null) =>
    onChange((prev) => {
      const o = { ...(prev.options ?? {}) };
      if (v) o[key] = v;
      else delete o[key];
      return { ...prev, options: o };
    });
  // Al tocar el estampado se guarda en el formato nuevo y se quita el antiguo.
  const setPattern = (spec: PatternSpec | null) =>
    onChange((prev) => {
      const next: Customization = { ...prev };
      if (spec) next.pattern = spec;
      else delete next.pattern;
      if (prev.options) {
        const o = { ...prev.options };
        delete o.pattern;
        delete o.patternSize;
        next.options = o;
      }
      if (prev.colors) {
        const c = { ...prev.colors };
        delete c.pattern;
        delete c.pattern2;
        next.colors = c;
      }
      return next;
    });
  const setPart = (key: string, v: boolean | null) =>
    onChange((prev) => {
      const parts = { ...(prev.parts ?? {}) };
      if (v === null) delete parts[key];
      else parts[key] = v;
      return { ...prev, parts };
    });
  const updateDetail = (id: string, patch: Partial<CustomDetail>) =>
    onChange((prev) => ({ ...prev, details: (prev.details ?? []).map((d) => (d.id === id ? clean({ ...d, ...patch }) : d)) }));
  const removeDetail = (id: string) => {
    onChange((prev) => ({ ...prev, details: (prev.details ?? []).filter((d) => d.id !== id) }));
    if (id === selectedId) onSelect(null);
  };
  // Copia un poco más abajo (al soltarla se ajusta a la tela) y la deja elegida.
  const duplicateDetail = (id: string) => {
    const src = details.find((d) => d.id === id);
    if (!src || details.length >= MAX_DETAILS) return;
    const copy: CustomDetail = { ...src, id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, position: [src.position[0], src.position[1] - Math.max(0.02, src.size * 0.8), src.position[2]] };
    onChange((prev) => ({ ...prev, details: [...(prev.details ?? []), copy] }));
    onSelect(copy.id);
  };

  return (
    <div className="custom-panel">
      <div className="segmented segmented-tabs" role="tablist" aria-label={t('Personalización')}>
        {tabs.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}>
            {k === 'colors' ? t('Colores') : k === 'parts' ? t('Piezas') : `Detalles${details.length ? ` (${details.length})` : ''}`}
          </button>
        ))}
      </div>

      <div className="custom-body">
      {library && (
        <p className="muted small">
          {library.colors.length
            ? t('Esta prenda usa su modelo 3D: puedes cambiar el color de sus piezas (botones, cremallera, ribetes…) y el estampado de la tela, y añadir detalles encima.')
            : t('Esta prenda usa su modelo 3D, de una sola pieza: costuras y bolsillos forman parte de la malla y toman el color de la prenda. Puedes elegir el estampado de la tela y añadir detalles encima (parches, bordados, botones…).')}
        </p>
      )}

      {tab === 'colors' && (
        <div className="custom-section">
          {hasPattern && <PatternEditor base={baseColor} value={patternSpec} onChange={setPattern} hasSecondary={hasSecondary} scale={patternScale} />}
          {colorSlots.map((slot) => (
            <ColorRow
              key={slot}
              label={COLOR_SLOT_LABEL[slot]}
              value={value.colors?.[slot]}
              onChange={(c) => setColor(slot, c)}
              open={openColor === slot}
              onToggle={() => toggleColor(slot)}
            />
          ))}
          {options.options.includes('metal') && metalParts && (
            <SelectRow label={t('Acabado del metal')} value={value.options?.metal} labels={METAL_LABEL} onChange={(v) => setOption('metal', v as MetalFinish | null)} />
          )}
          {!library && options.options.includes('buttonStyle') && (
            <SelectRow label={t('Tipo de botón')} value={value.options?.buttonStyle} labels={BUTTON_LABEL} onChange={(v) => setOption('buttonStyle', v as ButtonStyle | null)} />
          )}
          {!library && options.options.includes('stitchStyle') && (
            <SelectRow label={t('Pespunte')} value={value.options?.stitchStyle} labels={STITCH_LABEL} onChange={(v) => setOption('stitchStyle', v as StitchStyle | null)} />
          )}
        </div>
      )}

      {tab === 'parts' && (
        <div className="custom-section">
          {partList.length === 0 && <p className="muted small">{t('Este tipo de prenda no tiene piezas opcionales.')}</p>}
          {partList.map((part) => {
            const current = value.parts?.[part.key];
            return (
              <div key={part.key} className="part-row">
                <span>{part.label}</span>
                <div className="segmented segmented-small" role="group" aria-label={part.label}>
                  <button type="button" aria-pressed={current === undefined} onClick={() => setPart(part.key, null)} title={part.default === null ? t('Lo que lleve el estilo o corte elegido') : t('Por defecto: {v}', { v: part.default ? t('sí') : t('no') })}>
                    {t('Auto')}
                  </button>
                  <button type="button" aria-pressed={current === true} onClick={() => setPart(part.key, true)}>
                    {t('Sí')}
                  </button>
                  <button type="button" aria-pressed={current === false} onClick={() => setPart(part.key, false)}>
                    {t('No')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'details' && (
        <div className="custom-section">
          {placement && (
            <p className="note placing-note" role="status">
              {placement === 'move' ? t('Haz clic en la prenda donde quieras mover el detalle (o arrástralo directamente).') : t('Haz clic en la prenda para colocar: {toLowerCase}.', { toLowerCase: DETAIL_KIND_LABEL[placement].toLowerCase() })}{' '}
              <button type="button" className="btn-link" onClick={() => onPlacement(null)}>
                {t('Cancelar')}
              </button>
            </p>
          )}
          {details.length > 0 ? (
            <>
              <p className="muted small">
                {t('{n} {v}. Pulsa uno para editarlo (también puedes pulsarlo o arrastrarlo en la prenda).', { n: details.length, v: details.length === 1 ? t('detalle') : t('detalles') })}
              </p>
              <DetailList
                details={details}
                selectedId={selectedId}
                onSelect={onSelect}
                onDuplicate={duplicateDetail}
                onRemove={removeDetail}
                canDuplicate={details.length < MAX_DETAILS}
                label={t('Detalles colocados')}
              />
            </>
          ) : (
            !placement && <p className="muted small">{t('Esta prenda aún no tiene detalles.')}</p>
          )}

          {selected ? (
            <>
            <button type="button" className="btn-link detail-back" onClick={() => onSelect(null)}>
              {t('← Añadir otro detalle')}
            </button>
            <DetailEditor
              detail={selected}
              onChange={(patch) => updateDetail(selected.id, patch)}
              onMove={() => onPlacement('move')}
              onRemove={() => removeDetail(selected.id)}
            />
            </>
          ) : (
            <>
              {onDraw && (
                <button type="button" className="btn draw-start" disabled={details.length >= MAX_DETAILS} onClick={onDraw}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                    <path d="M10.8 2.2a1.6 1.6 0 0 1 2.3 0l.7.7a1.6 1.6 0 0 1 0 2.3l-7.6 7.6-3.4.9.9-3.4 7.1-7.1Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                  {t('Dibujar sobre la prenda')}
                </button>
              )}
              <p className="muted small">{t('Añade un detalle y colócalo haciendo clic sobre la prenda. Luego puedes arrastrarlo para cambiarlo de sitio.')}</p>
              <div className="kind-grid">
                {PLACEABLE_KINDS.map((k) => (
                  <button key={k} type="button" className={`btn btn-small${placement === k ? ' is-active' : ''}`} disabled={details.length >= MAX_DETAILS} onClick={() => onPlacement(k)}>
                    {DETAIL_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              {details.length >= MAX_DETAILS && <p className="muted small">{t('Máximo {MAX_DETAILS} detalles por prenda.', { MAX_DETAILS })}</p>}
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

/** Quita los campos que no tienen sentido para el tipo (el backend los rechazaría). */
function clean(d: CustomDetail): CustomDetail {
  const out: CustomDetail = { ...d };
  if (!GRAPHIC_KINDS.includes(d.kind)) {
    delete out.text;
    delete out.font;
    delete out.assetId;
  }
  if (out.assetId) {
    delete out.text;
    delete out.font;
  }
  if (!out.text) delete out.font;
  if (!['patch', 'label', 'pocket', 'print', 'embroidery'].includes(d.kind)) delete out.shape;
  return out;
}

/** Crea un detalle nuevo en el punto elegido. */
export function newDetail(kind: DetailKind, position: [number, number, number], normal: [number, number, number]): CustomDetail {
  const def = DETAIL_DEFAULTS[kind];
  const d: CustomDetail = {
    id: `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    kind,
    position,
    normal,
    rotation: 0,
    size: def.size,
    color: def.color,
  };
  if (def.secondaryColor) d.secondaryColor = def.secondaryColor;
  if (def.text) {
    d.text = def.text;
    d.font = kind === 'patch' ? 'college' : kind === 'embroidery' ? 'script' : 'sans';
  }
  if (kind === 'patch') d.shape = 'rounded';
  return d;
}

function DetailEditor({
  detail,
  onChange,
  onMove,
  onRemove,
}: {
  detail: CustomDetail;
  onChange: (patch: Partial<CustomDetail>) => void;
  onMove: () => void;
  onRemove: () => void;
}) {
  const graphic = GRAPHIC_KINDS.includes(detail.kind);
  const drawing = detail.kind === 'drawing';
  const cutout = detail.kind === 'patch' && detail.shape === 'cutout';
  const [openColor, setOpenColor] = useState<'main' | 'second' | null>(null);
  const cm = Math.round(detail.size * 1000) / 10;
  const maxCm = Math.round((drawing ? MAX_DRAWING_SIZE : Math.min(0.3, MAX_DETAIL_SIZE)) * 100);
  const deg = Math.round((detail.rotation * 180) / Math.PI);
  // El dibujo y el parche recortado con imagen toman los colores de su imagen.
  const showMainColor = !drawing && !(cutout && detail.assetId);
  return (
    <div className="detail-editor">
      <h3 className="panel-subtitle">{DETAIL_KIND_LABEL[detail.kind]}</h3>
      <label className="field">
        <span>{t('Tamaño: {cm} cm', { cm })}</span>
        <input type="range" min={0.5} max={Math.max(maxCm, cm)} step={0.1} value={cm} onChange={(e) => onChange({ size: Number(e.target.value) / 100 })} />
      </label>
      <label className="field">
        <span>{t('Giro: {deg}°', { deg })}</span>
        <input type="range" min={-180} max={180} step={1} value={deg} onChange={(e) => onChange({ rotation: (Number(e.target.value) * Math.PI) / 180 })} />
      </label>
      {showMainColor && (
        <ColorRow
          label={cutout ? t('Color de las letras') : detail.kind === 'patch' ? t('Fondo') : t('Color')}
          value={detail.color}
          onChange={(c) => c && onChange({ color: c.toUpperCase() })}
          required
          open={openColor === 'main'}
          onToggle={() => setOpenColor((k) => (k === 'main' ? null : 'main'))}
        />
      )}
      {drawing && <p className="muted small">{t('Dibujo a mano alzada: se estampa sobre la tela desde el ángulo en que lo dibujaste. Puedes moverlo, girarlo o cambiar su tamaño.')}</p>}
      {!cutout && ['patch', 'label', 'pin', 'pocket'].includes(detail.kind) && (
        <ColorRow
          label={detail.kind === 'patch' ? t('Ribete y texto') : detail.kind === 'pocket' ? t('Pespunte') : t('Texto')}
          value={detail.secondaryColor}
          onChange={(c) => onChange({ secondaryColor: c ? c.toUpperCase() : undefined })}
          open={openColor === 'second'}
          onToggle={() => setOpenColor((k) => (k === 'second' ? null : 'second'))}
        />
      )}
      {detail.kind === 'patch' && (
        <>
          <SelectRow label={t('Forma')} value={detail.shape} labels={DETAIL_SHAPE_LABEL} onChange={(v) => onChange({ shape: (v as DetailShape) ?? undefined })} allowAuto={false} />
          <p className="muted small">
            {cutout
              ? t('Sin marco: el parche tiene la silueta de tu PNG (las zonas transparentes no se ven) o la de las letras.')
              : t('Para un logo con fondo transparente sin marco alrededor, elige «Recortado (sin marco)».')}
          </p>
        </>
      )}
      {graphic && (
        <>
          <label className="field">
            <span>{t('Texto')}</span>
            <input
              value={detail.text ?? ''}
              maxLength={40}
              disabled={!!detail.assetId}
              placeholder={detail.assetId ? t('Con imagen no lleva texto') : t('Escribe el texto')}
              onChange={(e) => onChange({ text: e.target.value || undefined, font: e.target.value ? detail.font ?? 'sans' : undefined })}
            />
          </label>
          {detail.text && !detail.assetId && (
            <SelectRow label={t('Letra')} value={detail.font} labels={DETAIL_FONT_LABEL} onChange={(v) => onChange({ font: (v as DetailFont) ?? 'sans' })} allowAuto={false} />
          )}
          <div className="field">
            <span>{t('Imagen (logo o estampado)')}</span>
            <AssetPicker value={detail.assetId} onChange={(id) => onChange({ assetId: id, ...(id ? { text: undefined, font: undefined } : {}) })} />
          </div>
        </>
      )}
      <p className="muted small">{t('Arrastra el detalle sobre la prenda para moverlo, o pulsa «Mover» y haz clic donde quieras.')}</p>
      <div className="actions">
        <button type="button" className="btn btn-small" onClick={onMove}>
          {t('Mover')}
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn-small btn-danger" onClick={onRemove}>
          {t('Quitar')}
        </button>
      </div>
    </div>
  );
}

/**
 * Opción de una lista: con pocas opciones cortas, botones (se ve todo de un
 * vistazo); con más, un desplegable propio.
 */
function SelectRow({
  label,
  value,
  labels,
  onChange,
  allowAuto = true,
}: {
  label: string;
  value: string | undefined;
  labels: Record<string, string>;
  onChange: (v: string | null) => void;
  allowAuto?: boolean;
}) {
  const id = useId();
  const options = [...(allowAuto ? [{ value: '', label: t('Auto') }] : []), ...Object.entries(labels).map(([k, l]) => ({ value: k, label: l }))];
  const compact = options.length <= 4 && options.every((o) => o.label.length <= 12);
  if (compact) {
    return (
      <div className="field">
        <span id={id}>{label}</span>
        <div className="segmented segmented-small segmented-fill" role="group" aria-labelledby={id}>
          {options.map((o) => (
            <button key={o.value} type="button" aria-pressed={(value ?? '') === o.value} onClick={() => onChange(o.value || null)} title={o.value ? undefined : t('Automático (según la prenda)')}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="field">
      <span id={id}>{label}</span>
      <Select
        labelledBy={id}
        value={value ?? ''}
        options={options.map((o) => (o.value ? o : { value: '', label: t('Automático (según la prenda)') }))}
        onChange={(v) => onChange(v || null)}
      />
    </div>
  );
}
