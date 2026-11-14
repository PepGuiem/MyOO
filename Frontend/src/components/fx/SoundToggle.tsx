import { useEffect, useState } from 'react';
import { onSfxChange, setSfxEnabled, sfxEnabled } from '../../lib/sfx';
import { Icon } from '../Icon';
import { t } from '../../i18n';

/** Botón para activar o quitar los sonidos de la interfaz (apagados por defecto). */
export function SoundToggle() {
  const [on, setOn] = useState(sfxEnabled);
  useEffect(() => onSfxChange(setOn), []);
  return (
    <button
      type="button"
      className={`sound-toggle${on ? ' is-on' : ''}`}
      aria-pressed={on}
      title={on ? t('Quitar sonidos') : t('Activar sonidos')}
      onClick={() => setSfxEnabled(!on)}
    >
      <Icon name={on ? 'volume' : 'mute'} size={16} />
      <span className="visually-hidden">{t('Sonidos')}</span>
      <span className="sound-bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </button>
  );
}
