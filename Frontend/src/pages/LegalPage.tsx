import { Link, Navigate, useParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { LegalLinks } from '../components/LegalLinks';
import { Logo } from '../components/Logo';
import { t } from '../i18n';
import { isLegalDoc, legalTitle } from '../lib/legal';

/**
 * Páginas legales públicas (se ven sin sesión). Solo la estructura: los
 * textos están pendientes de redactar y no se inventan aquí.
 */
export function LegalPage() {
  const { doc } = useParams();
  if (!isLegalDoc(doc)) return <Navigate to="/legal/terminos" replace />;
  const title = legalTitle(doc);

  return (
    <div className="legal-page ux">
      <main className="legal-card" aria-labelledby="legal-title">
        <Link to="/" className="legal-brand" aria-label={t('MyOO, inicio')}>
          <Logo className="legal-logo" decorative />
        </Link>
        <span className="wd-kicker">
          <Icon name="book" size={12} /> {t('Legal')}
        </span>
        <h1 id="legal-title" className="wd-title legal-title" data-text={title}>
          {title}
        </h1>
        <p className="note legal-pending" role="note">
          <Icon name="edit" size={14} /> {t('Pendiente de redactar')}
        </p>
        <LegalLinks className="legal-links-page" />
        <Link to="/" className="btn wd-btn-line legal-back">
          <Icon name="back" size={14} /> <span>{t('Volver a MyOO')}</span>
        </Link>
      </main>
    </div>
  );
}
