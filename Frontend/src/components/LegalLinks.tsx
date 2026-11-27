import { NavLink } from 'react-router-dom';
import { t } from '../i18n';
import { LEGAL_DOCS, legalPath, legalShortTitle } from '../lib/legal';

/** Enlaces a las páginas legales (menú, cuenta y páginas legales). */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav className={`legal-links${className ? ` ${className}` : ''}`} aria-label={t('Información legal')}>
      <ul>
        {LEGAL_DOCS.map((doc) => (
          <li key={doc}>
            <NavLink to={legalPath(doc)}>{legalShortTitle(doc)}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
