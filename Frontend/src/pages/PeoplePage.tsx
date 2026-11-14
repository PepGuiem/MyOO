import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { peopleApi } from '../api/endpoints';
import type { PersonResult, UserBrief } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { FollowButton } from '../components/social/FollowButton';
import { PersonAvatar, personName, profilePath } from '../components/social/PersonAvatar';
import { t, tn } from '../i18n';
import { Spinner } from '../components/Spinner';
import { useRealtime, useRealtimeEvent } from '../lib/realtime';

/** Personas: buscar gente, solicitudes para seguirte. */
export function PeoplePage() {
  const { user } = useAuth();
  const { refreshRequests } = useRealtime();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PersonResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [requests, setRequests] = useState<(UserBrief & { requestedAt: string })[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const term = q.trim().replace(/^@/, '');
  const input = useRef<HTMLInputElement>(null);

  const loadRequests = () =>
    peopleApi
      .requests()
      .then(setRequests)
      .catch(setError);
  useEffect(() => {
    void loadRequests();
  }, []);
  useRealtimeEvent((e) => {
    if (e.type === 'follow_request') void loadRequests();
  });

  useEffect(() => {
    if (term.length < 2) {
      setResults(null);
      return;
    }
    let alive = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      peopleApi
        .search(term)
        .then((r) => alive && setResults(r))
        .catch((err: unknown) => alive && setError(err))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [term]);

  async function answer(id: string, accept: boolean) {
    try {
      if (accept) await peopleApi.accept(id);
      else await peopleApi.decline(id);
      setRequests((l) => l?.filter((r) => r.id !== id) ?? l);
      refreshRequests();
    } catch (err) {
      setError(err);
    }
  }

  const state = searching ? 'searching' : !results ? 'idle' : results.length === 0 ? 'none' : 'results';

  return (
    <section className="page people pp">
      <header className="pp-head">
        <div>
          <span className="wd-kicker">
            <Icon name="users" size={12} /> {t('Street network')}
          </span>
          <h1 className="wd-title pp-title" data-text={t('Personas')}>
            {t('Personas')}
          </h1>
          <p className="pp-lede">{t('Encuentra gente por su @usuario y mira los outfits que comparte.')}</p>
        </div>
        {user && (
          <div className="wd-head-actions">
            <Link to={`/u/${encodeURIComponent(user.username ?? user.id)}`} className="btn wd-btn-line">
              <Icon name="eye" size={14} /> {t('Ver tu perfil público')}
            </Link>
          </div>
        )}
      </header>

      {!user?.username && (
        <p className="pp-note">
          <Icon name="flag" size={14} />
          <span>
            {t('Aún no tienes @usuario: sin él nadie puede encontrarte.')} <Link to="/perfil">{t('Ponte uno en tu perfil')}</Link>.
          </span>
        </p>
      )}

      <ErrorNote error={error} />

      <section className={`pp-search is-${state}`} aria-labelledby="search-title">
        <h2 id="search-title" className="visually-hidden">
          {t('Buscar')}
        </h2>
        <label className="pp-search-box">
          <span className="pp-search-icon" aria-hidden="true">
            <Icon name="search" size={20} />
          </span>
          <input
            ref={input}
            type="search"
            value={q}
            placeholder={t('Busca por @usuario o nombre')}
            aria-label={t('Buscar personas')}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && (
            <button
              type="button"
              className="pp-clear"
              aria-label={t('Borrar la búsqueda')}
              onClick={() => {
                setQ('');
                input.current?.focus();
              }}
            >
              <Icon name="close" size={14} />
            </button>
          )}
          <span className="pp-search-scan" aria-hidden="true" />
        </label>
        <p className="pp-status" role="status" aria-live="polite">
          {state === 'searching' && (
            <>
              <Spinner size={14} /> {t('Buscando…')}
            </>
          )}
          {state === 'idle' && t('Escribe al menos 2 letras.')}
          {state === 'results' && tn(results!.length, '{n} persona', '{n} personas')}
        </p>
      </section>

      {requests && requests.length > 0 && (
        <section className="pp-requests" aria-labelledby="req-title">
          <div className="hm-section-head">
            <span className="hm-section-n" aria-hidden="true">
              {requests.length}
            </span>
            <h2 id="req-title">{t('Solicitudes para seguirte')}</h2>
          </div>
          <ul className="pp-grid">
            {requests.map((r, i) => (
              <PersonCard
                key={r.id}
                person={r}
                index={i}
                tag={t('Quiere seguirte')}
                action={
                  <>
                    <button type="button" className="btn wd-add pp-accept" onClick={() => void answer(r.id, true)}>
                      <Icon name="check" size={14} /> <span>{t('Aceptar')}</span>
                    </button>
                    <button type="button" className="btn wd-btn-line" onClick={() => void answer(r.id, false)}>
                      {t('Rechazar')}
                    </button>
                  </>
                }
              />
            ))}
          </ul>
        </section>
      )}

      {state === 'results' && (
        <ul className="pp-grid" key={term}>
          {results!.map((p, i) => (
            <PersonCard
              key={p.id}
              person={p}
              index={i}
              action={
                <FollowButton
                  small
                  userId={p.id}
                  state={p.following}
                  onChange={(following) => setResults((l) => l?.map((x) => (x.id === p.id ? { ...x, following } : x)) ?? l)}
                />
              }
            />
          ))}
        </ul>
      )}

      {state === 'none' && (
        <div className="pp-empty">
          <Icon name="search" size={30} />
          <h2>{t('Nadie con ese nombre')}</h2>
          <p className="muted">{t('Prueba con su @usuario exacto o con otra parte del nombre.')}</p>
        </div>
      )}

      {state === 'idle' && (
        <div className="pp-empty pp-idle">
          <div className="pp-radar" aria-hidden="true">
            <span />
            <span />
            <span />
            <Icon name="users" size={34} />
          </div>
          <h2>{t('Encuentra a tu gente')}</h2>
          <p className="muted">{t('Busca por @usuario o por nombre. Verás sus outfits compartidos y podrás seguirles.')}</p>
        </div>
      )}
    </section>
  );
}

/** Tarjeta de persona: foto con aro, nombre, @usuario y su acción. */
function PersonCard({ person, index, action, tag }: { person: UserBrief; index: number; action: ReactNode; tag?: string }) {
  return (
    <li className="pp-card" style={{ '--i': index } as CSSProperties}>
      <Link to={profilePath(person)} className="pp-card-link">
        <span className="pp-avatar">
          <PersonAvatar person={person} size={64} />
        </span>
        <span className="pp-card-text">
          <strong>
            {personName(person)}
            {person.isPrivate && (
              <span className="pp-lock" title={t('Cuenta privada')}>
                <Icon name="lock" size={12} />
              </span>
            )}
          </strong>
          {person.username && <small>@{person.username}</small>}
          {tag && <em>{tag}</em>}
        </span>
      </Link>
      <div className="pp-card-action">{action}</div>
    </li>
  );
}
