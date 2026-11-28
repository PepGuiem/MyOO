import { useState } from 'react';
import { t } from '../../i18n';
import { applyUpdate, usePwa } from '../../lib/pwa';
import { Icon } from '../Icon';
import './pwa.css';

/**
 * Aviso «Hay una versión nueva · Recargar» cuando se ha publicado otra versión
 * de la web (el service worker nuevo espera a que la persona recargue). Se puede
 * cerrar: entonces la versión nueva entra la próxima vez que se abra la web.
 */
export function UpdateBanner() {
  const { updateReady } = usePwa();
  const [hidden, setHidden] = useState(false);
  if (!updateReady || hidden) return null;
  return (
    <div className="pwa-update" role="status" aria-live="polite">
      <Icon name="refresh" size={16} />
      <span className="pwa-update-text">{t('Hay una versión nueva')}</span>
      <button type="button" className="btn btn-primary pwa-update-reload" onClick={applyUpdate}>
        {t('Recargar')}
      </button>
      <button type="button" className="pwa-close" aria-label={t('Cerrar aviso')} title={t('Cerrar aviso')} onClick={() => setHidden(true)}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
