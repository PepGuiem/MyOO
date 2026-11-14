import { useEffect, useState } from 'react';
import { peopleApi } from '../../api/endpoints';
import type { PersonResult } from '../../api/types';
import { Icon } from '../Icon';
import { Spinner } from '../Spinner';
import { PersonAvatar, personName } from './PersonAvatar';
import { t } from '../../i18n';

/** Buscador de personas por @usuario o nombre (para chats y grupos). */
export function PeoplePicker({
  onPick,
  selected = [],
  exclude = [],
  autoFocus = false,
}: {
  onPick: (p: PersonResult) => void;
  selected?: string[];
  exclude?: string[];
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PersonResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const term = q.trim().replace(/^@/, '');

  useEffect(() => {
    if (term.length < 2) {
      setResults(null);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = window.setTimeout(() => {
      peopleApi
        .search(term)
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]))
        .finally(() => alive && setLoading(false));
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [term]);

  const shown = (results ?? []).filter((p) => !exclude.includes(p.id));

  return (
    <div className="people-picker">
      <label className="search search-full">
        <Icon name="search" size={14} />
        <input
          type="search"
          value={q}
          placeholder={t('Busca por @usuario o nombre')}
          aria-label={t('Buscar personas')}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {loading && <Spinner size={16} label={t('Buscando…')} />}
      {results && !loading && shown.length === 0 && <p className="muted small">{t('Nadie con ese nombre.')}</p>}
      {shown.length > 0 && (
        <ul className="picker-list">
          {shown.map((p) => {
            const on = selected.includes(p.id);
            return (
              <li key={p.id}>
                <button type="button" className={`picker-item${on ? ' is-selected' : ''}`} aria-pressed={on} onClick={() => onPick(p)}>
                  <PersonAvatar person={p} size={34} />
                  <span className="person-text">
                    <strong>{personName(p)}</strong>
                    {p.username && <small className="muted">@{p.username}</small>}
                  </span>
                  {on && <Icon name="check" size={14} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
