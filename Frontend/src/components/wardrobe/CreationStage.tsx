import { useState } from 'react';
import type { CustomDetail, GarmentLike, GarmentType } from '../../api/types';
import { t } from '../../i18n';
import { colorName } from '../../lib/colors';
import { CATEGORY_LABEL } from '../../lib/labels';
import { reducedMotion } from '../../lib/motion';
import { CreationStudio } from '../../three/CreationStudio';
import type { PhotoPlacement } from '../../three/GarmentViewer';
import { Icon } from '../Icon';

/** Paso del formulario que se marca en el plató cuando ya está hecho. */
export interface CreationStep {
  key: string;
  label: string;
  done: boolean;
}

/**
 * Escenario de la creación de prendas (columna izquierda del editor): el plató
 * 3D y, encima, las etiquetas del estilo de la calle (cinta, tipo de prenda,
 * nombre que se va escribiendo, color elegido y pasos completados). Solo
 * presentación: todos los datos llegan del formulario.
 */
export function CreationStage({
  garment,
  type,
  name,
  color,
  editing,
  steps,
  place,
  onPlaced,
  photoReading,
  photoThumbnail,
}: {
  /** Prenda a mostrar (null si aún no hay tipo). */
  garment: GarmentLike | null;
  type: GarmentType | undefined;
  name: string;
  color: string;
  editing: boolean;
  steps: CreationStep[];
  place: PhotoPlacement | null;
  onPlaced: (key: string, details: CustomDetail[]) => void;
  /** Se está leyendo una foto («Desde una foto»). */
  photoReading: boolean;
  /** Recorte de la prenda de la foto, si se leyó bien. */
  photoThumbnail?: string;
}) {
  const [reduced] = useState(reducedMotion);
  const [spin, setSpin] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const done = steps.filter((s) => s.done).length;
  const ready = done === steps.length;
  const validColor = /^#[0-9a-fA-F]{6}$/.test(color);
  const title = name.trim() || type?.name || t('Sin nombre');

  return (
    <div className={`editor-stage cs-stage${photoReading ? ' is-scanning' : ''}`}>
      {/* Pared del estudio: foco de luz, haz y marcas de visor (decoración) */}
      <div className="cs-backdrop" aria-hidden="true">
        <span className="cs-beam" />
        <span className="cs-corners" />
      </div>

      <div className="cs-canvas">
        {garment && (
          <CreationStudio garment={garment} place={place} onPlaced={onPlaced} spin={spin} resetSignal={resetSignal} reduced={reduced} />
        )}
      </div>

      <div className="cs-hud">
        <div className="cs-top">
          <span className="cs-kicker">
            <Icon name="sparkles" size={11} />
            {editing ? t('Editando en vivo') : t('Vista previa en vivo')}
          </span>
          <div className="cs-tools">
            {!reduced && (
              <button
                type="button"
                className={`cs-tool${spin ? ' is-on' : ''}`}
                aria-pressed={spin}
                aria-label={t('Girar la prenda')}
                title={t('Girar la prenda')}
                onClick={() => setSpin((v) => !v)}
              >
                <Icon name={spin ? 'pause' : 'refresh'} size={15} />
              </button>
            )}
            <button
              type="button"
              className="cs-tool"
              aria-label={t('Restablecer vista')}
              title={t('Restablecer vista')}
              onClick={() => setResetSignal((n) => n + 1)}
            >
              <Icon name="target" size={15} />
            </button>
          </div>
        </div>

        {type && (
          <div className="cs-label" aria-hidden="true">
            <span className="cs-cat">
              {CATEGORY_LABEL[type.category]} <i>/</i> {type.name}
            </span>
            <strong className={`cs-name${name.trim() ? '' : ' is-placeholder'}`}>{title}</strong>
          </div>
        )}

        <p className="cs-hint" aria-hidden="true">
          {t('Arrastra para girar')}
        </p>

        <div className="cs-dock">
          <div className="cs-dock-row">
            {validColor && (
              <span className="cs-swatch">
                <i style={{ background: color }} aria-hidden="true" />
                <span>{colorName(color)}</span>
                <small>{color.toUpperCase()}</small>
              </span>
            )}
            <span className={`cs-status${ready ? ' is-ready' : ''}`}>
              {ready ? t('Lista para guardar') : t('{done} de {total} pasos', { done, total: steps.length })}
            </span>
          </div>
          <ol className="cs-steps" aria-label={t('Pasos de la prenda')}>
            {steps.map((s, i) => (
              <li key={s.key} className={s.done ? 'is-done' : undefined}>
                <b aria-hidden="true">{s.done ? <Icon name="check" size={10} /> : String(i + 1).padStart(2, '0')}</b>
                <span>{s.label}</span>
                <span className="visually-hidden">{s.done ? t('Hecho') : t('Pendiente')}</span>
              </li>
            ))}
          </ol>
          <span className="cs-meter" aria-hidden="true">
            <i style={{ transform: `scaleX(${done / Math.max(1, steps.length)})` }} />
          </span>
        </div>
      </div>

      {photoThumbnail && !photoReading && (
        <figure className="cs-photo">
          <img src={photoThumbnail} alt={t('Prenda recortada de la foto')} />
          <figcaption>{t('Tu foto')}</figcaption>
        </figure>
      )}

      {photoReading && (
        <div className="cs-scan" role="status">
          <span className="cs-scan-line" aria-hidden="true" />
          <span className="cs-scan-label">{t('Leyendo la foto…')}</span>
        </div>
      )}
    </div>
  );
}
