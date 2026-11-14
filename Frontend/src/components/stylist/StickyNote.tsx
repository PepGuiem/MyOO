import { useRef, useState, type CSSProperties } from 'react';
import type { StylistTip } from '../../api/types';
import { t } from '../../i18n';
import { reducedMotion } from '../../lib/motion';
import { Icon } from '../Icon';

/**
 * Tipo de nota: ¡OJO! (aviso), TRUCO (mejora el outfit), IDEA (otra
 * combinación) y ¡BIEN! (lo que ya funciona). Sale del tipo de consejo que da
 * el motor del estilista, que siempre habla de las prendas del outfit.
 */
export const NOTE_KIND: Record<StylistTip['kind'], { label: string; tone: 'ojo' | 'truco' | 'idea' | 'bien'; icon: 'flag' | 'bulb' | 'swap' | 'check' }> = {
  missing: { label: t('¡OJO!'), tone: 'ojo', icon: 'flag' },
  add: { label: t('TRUCO'), tone: 'truco', icon: 'bulb' },
  styling: { label: t('TRUCO'), tone: 'truco', icon: 'bulb' },
  swap: { label: t('IDEA'), tone: 'idea', icon: 'swap' },
  praise: { label: t('¡BIEN!'), tone: 'bien', icon: 'check' },
};

const TILTS = [-4, 3, -2.5, 4.5, -1.5, 2];

/** Nota escrita a mano, pegada con cinta junto al maniquí. */
export function StickyNote({
  tip,
  slot,
  onAccept,
  onReject,
  onAnother,
}: {
  tip: StylistTip;
  slot: number;
  onAccept: () => void;
  onReject: () => void;
  onAnother?: () => void;
}) {
  const [leaving, setLeaving] = useState<'ok' | 'no' | null>(null);
  const timer = useRef(0);
  const kind = NOTE_KIND[tip.kind];
  const actionable = tip.kind !== 'praise' && tip.kind !== 'missing';

  /** Deja ver la animación (sello o arrugarse) antes de quitar la nota. */
  function leave(how: 'ok' | 'no', then: () => void) {
    if (leaving) return;
    if (reducedMotion()) return then();
    setLeaving(how);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(then, how === 'ok' ? 520 : 420);
  }

  return (
    <div
      className={`st-note tone-${kind.tone} pos-${slot % 4}${leaving ? ` is-${leaving}` : ''}`}
      style={{ '--tilt': `${TILTS[slot % TILTS.length]}deg`, '--n': slot, '--float': `${5.5 + (slot % 3) * 1.3}s` } as CSSProperties}
      role="note"
    >
      <span className="st-note-tape" aria-hidden="true" />
      <span className="st-note-tag">
        <Icon name={kind.icon} size={12} /> {kind.label}
      </span>
      <p>{tip.text}</p>
      {leaving === 'ok' && (
        <span className="st-note-stamp" aria-hidden="true">
          <Icon name="check" size={20} />
        </span>
      )}
      <div className="st-note-actions">
        {actionable ? (
          <>
            <button type="button" onClick={() => leave('ok', onAccept)} title={t('Aplicar al outfit')}>
              <Icon name="check" size={13} /> {t('Vale')}
            </button>
            {onAnother && (
              <button type="button" onClick={onAnother} title={t('Otra idea')}>
                <Icon name="refresh" size={13} /> {t('Otra')}
              </button>
            )}
            <button type="button" onClick={() => leave('no', onReject)} title={t('Descartar')} aria-label={t('Descartar consejo')}>
              <Icon name="close" size={13} />
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => leave(tip.kind === 'praise' ? 'ok' : 'no', tip.kind === 'praise' ? onAccept : onReject)}
            title={t('Cerrar')}
            aria-label={t('Cerrar nota')}
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
