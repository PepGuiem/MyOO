import { Link } from 'react-router-dom';
import { ApiError } from '../api/client';
import { t } from '../i18n';

/** Muestra un error de la API; si es un límite de plan, enlaza a la cuenta. */
export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  const isLimit = error instanceof ApiError && error.isPlanLimit;
  return (
    <p className="note note-error" role="alert">
      {isLimit ? t('Has llegado al límite de tu plan. ') : ''}
      {message}
      {isLimit && (
        <>
          {' '}
          <Link to="/account">{t('Ver planes')}</Link>
        </>
      )}
    </p>
  );
}
