import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CalendarEntry } from '../../api/types';
import type { DayKey } from '../../lib/dates';
import { Icon } from '../Icon';
import { DayDetail } from './DayDetail';

/** Panel lateral con el detalle de un día (en el móvil sube desde abajo). */
export function DayPanel({
  date,
  entries,
  onClose,
  onChanged,
  onPrev,
  onNext,
}: {
  date: DayKey;
  entries: CalendarEntry[];
  onClose: () => void;
  onChanged: (info: { assigned?: DayKey }) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    setLeaving(true);
    window.setTimeout(onClose, 220);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === 'Escape') close();
      else if (!typing && e.key === 'ArrowLeft') onPrev();
      else if (!typing && e.key === 'ArrowRight') onNext();
    };
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  });

  return createPortal(
    <div className={`day-overlay${leaving ? ' is-leaving' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <aside className="day-panel" role="dialog" aria-modal="true" aria-label={`Día ${date}`}>
        <div className="day-panel-bar">
          <button type="button" className="icon-btn" onClick={onPrev} aria-label="Día anterior">
            <Icon name="back" />
          </button>
          <button type="button" className="icon-btn" onClick={onNext} aria-label="Día siguiente">
            <Icon name="forward" />
          </button>
          <span className="spacer" />
          <button type="button" className="icon-btn" onClick={close} aria-label="Cerrar">
            <Icon name="close" />
          </button>
        </div>
        <div key={date} className="day-panel-body">
          <DayDetail date={date} entries={entries} onChanged={onChanged} />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
