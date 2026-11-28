import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { mannequinSelectionId, useBodyShape } from '../lib/bodyPref';
import { play } from '../lib/sfx';
// bodyShapes (y no body): las siluetas sin three.js, para no arrastrar el motor 3D.
import { BODY_SHAPES, type BodyShape } from '../three/bodyShapes';
import { Icon } from './Icon';
import { t } from '../i18n';

const SEXES: { id: BodyShape['sex']; label: string }[] = [
  { id: 'male', label: t('Hombre') },
  { id: 'female', label: t('Mujer') },
];

/**
 * Selector de maniquí: los maniquíes personalizados de la cuenta (con medidas
 * reales) y las siluetas genéricas de hombre o de mujer. El cambio de
 * hombre a mujer desliza el interruptor y las siluetas entran de nuevo.
 */
export function BodySelector({ className = '', measures = true }: { className?: string; /** Enlace «Con tus medidas» (no en la demo sin cuenta). */ measures?: boolean }) {
  const { shape, selectedId, setShapeId, mannequins } = useBodyShape();
  const ownSelected = selectedId.startsWith('m:');
  const shapes = BODY_SHAPES.filter((b) => b.sex === shape.sex);
  const pickSex = (sex: BodyShape['sex']) => {
    if (sex === shape.sex && !ownSelected) return;
    const first = BODY_SHAPES.find((b) => b.sex === sex);
    if (first) {
      play('swoosh');
      setShapeId(first.id);
    }
  };
  const pick = (id: string) => {
    if (id === selectedId) return;
    play('click');
    setShapeId(id);
  };

  return (
    <div className={`body-selector ${className}`} role="group" aria-label={t('Maniquí')}>
      <span className="body-selector-label">{t('Maniquí')}</span>

      <div
        className={`sex-toggle${ownSelected ? ' is-off' : ''}`}
        data-sex={shape.sex}
        role="group"
        aria-label={t('Hombre o mujer')}
      >
        <span className="sex-thumb" aria-hidden="true" />
        {SEXES.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === shape.sex && !ownSelected} onClick={() => pickSex(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      <div key={shape.sex} className="chips chips-small body-shapes" role="group" aria-label={t('Silueta genérica')}>
        {shapes.map((b, i) => (
          <button
            key={b.id}
            type="button"
            className={`chip chip-shape${b.id === selectedId ? ' is-active' : ''}`}
            style={{ '--i': i } as CSSProperties}
            aria-pressed={b.id === selectedId}
            onClick={() => pick(b.id)}
          >
            <ShapeGlyph shape={b} />
            {b.label}
          </button>
        ))}
      </div>

      {mannequins.length > 0 && (
        <div className="chips chips-small" role="group" aria-label={t('Tus maniquíes')}>
          {mannequins.map((m) => {
            const id = mannequinSelectionId(m.id);
            return (
              <button
                key={m.id}
                type="button"
                className={`chip chip-own${id === selectedId ? ' is-active' : ''}`}
                aria-pressed={id === selectedId}
                onClick={() => pick(id)}
                title={`${m.measures.heightCm} cm · ${m.measures.chestCm}/${m.measures.waistCm}/${m.measures.hipCm}`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      )}
      {measures && (
        <Link to="/maniquies" className="chip chip-measure">
          <Icon name={mannequins.length ? 'edit' : 'plus'} size={12} />
          {mannequins.length ? t('Editar maniquíes') : t('Con tus medidas')}
        </Link>
      )}
    </div>
  );
}

/** Silueta mínima con las proporciones de la forma (hombros, cintura, cadera, altura). */
function ShapeGlyph({ shape }: { shape: BodyShape }) {
  const s = shape.shoulder * 40;
  const w = shape.waist * 40;
  const h = shape.hip * 40;
  const top = 18 - 14 * shape.height;
  const cx = 8;
  return (
    <svg className="shape-glyph" viewBox="0 0 16 18" width="12" height="14" aria-hidden="true">
      <circle cx={cx} cy={top + 1.6} r="1.6" fill="currentColor" />
      <path
        d={`M${cx - s} ${top + 4} L${cx + s} ${top + 4} L${cx + w} ${top + 8.5} L${cx + h} ${top + 10.5} L${cx + h * 0.55} 18 L${cx - h * 0.55} 18 L${cx - h} ${top + 10.5} L${cx - w} ${top + 8.5} Z`}
        fill="currentColor"
      />
    </svg>
  );
}
