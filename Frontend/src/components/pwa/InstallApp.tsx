import { useState } from 'react';
import { t } from '../../i18n';
import { dismissInstall, installAvailable, installDismissed, promptInstall, usePwa } from '../../lib/pwa';
import { Icon } from '../Icon';
import './pwa.css';

/** Ayuda para iPhone/iPad: Safari no tiene botón de instalar propio. */
function IosHelp() {
  return <p className="pwa-ios-help">{t('En Safari, toca Compartir y luego «Añadir a pantalla de inicio».')}</p>;
}

/**
 * Tarjeta del menú «Instalar la app». Solo sale si el navegador lo permite (o
 * en iOS, con la ayuda) y se puede cerrar: entonces no vuelve en 30 días.
 */
export function InstallAppCard() {
  const pwa = usePwa();
  const [closed, setClosed] = useState(installDismissed);
  const [help, setHelp] = useState(false);
  const mode = installAvailable(pwa);
  if (!mode || closed) return null;

  const close = () => {
    dismissInstall();
    setClosed(true);
  };

  return (
    <div className="pwa-install">
      <div className="pwa-install-row">
        <button
          type="button"
          className="pwa-install-btn"
          aria-expanded={mode === 'ios' ? help : undefined}
          onClick={() => (mode === 'prompt' ? void promptInstall() : setHelp((h) => !h))}
        >
          <Icon name="download" size={15} />
          <span>{t('Instalar la app')}</span>
        </button>
        <button type="button" className="pwa-close" aria-label={t('Ahora no')} title={t('Ahora no')} onClick={close}>
          <Icon name="close" size={13} />
        </button>
      </div>
      {mode === 'ios' && help ? <IosHelp /> : null}
    </div>
  );
}

/**
 * Fila «App» de la cuenta: el mismo ofrecimiento, siempre a mano (aunque se
 * haya cerrado la tarjeta del menú). No sale si ya está instalada.
 */
export function InstallAppFact() {
  const pwa = usePwa();
  const mode = installAvailable(pwa);
  if (!mode) return null;
  return (
    <div>
      <dt>{t('App')}</dt>
      <dd>
        {mode === 'prompt' ? (
          <button type="button" className="btn wd-btn-line" onClick={() => void promptInstall()}>
            <Icon name="download" size={14} /> <span>{t('Instalar la app')}</span>
          </button>
        ) : (
          <IosHelp />
        )}
      </dd>
    </div>
  );
}
