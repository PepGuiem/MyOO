import { useState } from 'react';
import { usersApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { locale, LOCALE_NAMES, LOCALES, switchLocale, t, toAccountLocale, type Locale } from '../i18n';
import { ErrorNote } from './ErrorNote';

/**
 * Elegir idioma (español / inglés). Con sesión se guarda en la cuenta, así
 * que se aplica en cualquier dispositivo; sin sesión, solo en este navegador.
 * Al cambiarlo la página se recarga en el idioma nuevo.
 */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<Locale | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function pick(next: Locale) {
    if (next === locale || busy) return;
    setBusy(next);
    setError(null);
    try {
      if (user) await usersApi.update({ locale: toAccountLocale(next) });
      if (!switchLocale(next)) {
        setError(new Error(t('Tu navegador no deja guardar el idioma. Prueba fuera del modo privado.')));
        setBusy(null);
      }
    } catch (err) {
      setError(err);
      setBusy(null);
    }
  }

  return (
    <div className={`lang-switch${compact ? ' is-compact' : ''}`}>
      <div className="segmented" role="radiogroup" aria-label={t('Idioma')}>
        {LOCALES.map((l) => (
          <button key={l} type="button" role="radio" lang={l} aria-checked={l === locale} aria-pressed={l === locale} disabled={!!busy} onClick={() => void pick(l)}>
            {compact ? l.toUpperCase() : LOCALE_NAMES[l]}
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
    </div>
  );
}
