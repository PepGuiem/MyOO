import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { peopleApi } from '../api/endpoints';
import type { PersonResult, UserBrief } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { FollowButton } from '../components/social/FollowButton';
import { PersonRow } from '../components/social/PersonRow';
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
    const t = window.setTimeout(() => {
      peopleApi
        .search(term)
        .then((r) => alive && setResults(r))
        .catch((err: unknown) => alive && setError(err))
        .finally(() => alive && setSearching(false));
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
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

  return (
    <section className="page people">
      <header className="page-head">
        <div>
          <h1>Personas</h1>
          <p className="muted">Encuentra gente por su @usuario y mira los outfits que comparte.</p>
        </div>
        {user && (
          <div className="head-actions">
            <Link to={`/u/${encodeURIComponent(user.username ?? user.id)}`} className="btn">
              Ver tu perfil público
            </Link>
          </div>
        )}
      </header>

      {!user?.username && (
        <p className="note">
          Aún no tienes @usuario: sin él nadie puede encontrarte. <Link to="/perfil">Ponte uno en tu perfil</Link>.
        </p>
      )}

      <ErrorNote error={error} />

      {requests && requests.length > 0 && (
        <section className="panel" aria-labelledby="req-title">
          <h2 id="req-title">Solicitudes para seguirte ({requests.length})</h2>
          <ul className="person-list">
            {requests.map((r) => (
              <PersonRow
                key={r.id}
                person={r}
                action={
                  <span className="actions">
                    <button type="button" className="btn btn-small btn-primary" onClick={() => void answer(r.id, true)}>
                      Aceptar
                    </button>
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => void answer(r.id, false)}>
                      Rechazar
                    </button>
                  </span>
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section className="panel" aria-labelledby="search-title">
        <h2 id="search-title" className="visually-hidden">
          Buscar
        </h2>
        <label className="search search-full search-large">
          <Icon name="search" size={16} />
          <input type="search" value={q} placeholder="Busca por @usuario o nombre" aria-label="Buscar personas" onChange={(e) => setQ(e.target.value)} />
        </label>
        {searching && <Spinner size={16} label="Buscando…" />}
        {results && !searching && results.length === 0 && <p className="muted">Nadie con ese nombre.</p>}
        {!results && !searching && <p className="muted small">Escribe al menos 2 letras.</p>}
        {results && results.length > 0 && (
          <ul className="person-list">
            {results.map((p) => (
              <PersonRow
                key={p.id}
                person={p}
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
      </section>
    </section>
  );
}
