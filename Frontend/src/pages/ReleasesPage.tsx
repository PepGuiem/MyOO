import { useEffect, useState } from 'react';
import { releasesApi } from '../api/endpoints';
import type { Release } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { Spinner } from '../components/Spinner';
import { longDate, RELEASE_TAG_LABEL } from '../lib/community';

/** Novedades: lo nuevo de MyOut, de lo más reciente a lo más antiguo. */
export function ReleasesPage() {
  const [items, setItems] = useState<Release[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    releasesApi
      .list(1)
      .then((r) => {
        setItems(r.data);
        setTotalPages(r.meta.totalPages);
      })
      .catch(setError);
  }, []);

  async function more() {
    try {
      const r = await releasesApi.list(page + 1);
      setItems((l) => [...(l ?? []), ...r.data]);
      setPage(page + 1);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section className="page releases-page">
      <header className="page-head">
        <div>
          <h1>Novedades</h1>
          <p className="muted">Lo nuevo de MyOut. Cuando publiquemos algo te llegará un aviso a la campanita.</p>
        </div>
      </header>

      <ErrorNote error={error} />
      {!items && !error && <Spinner label="Cargando novedades…" />}
      {items && items.length === 0 && (
        <div className="empty">
          <p>Aún no hay novedades publicadas.</p>
        </div>
      )}
      {items && items.length > 0 && (
        <ol className="release-list">
          {items.map((r) => (
            <li key={r.id}>
              <ReleaseEntry release={r} />
            </li>
          ))}
        </ol>
      )}
      {items && page < totalPages && (
        <button type="button" className="btn" onClick={() => void more()}>
          Ver anteriores
        </button>
      )}
    </section>
  );
}

export function ReleaseEntry({ release: r }: { release: Release }) {
  return (
    <article className="release" aria-labelledby={`rel-${r.id}`}>
      <div className="release-meta">
        {r.publishedAt ? (
          <time dateTime={r.publishedAt}>{longDate(r.publishedAt)}</time>
        ) : (
          <span className="release-draft">Borrador</span>
        )}
        {r.version && <span className="release-version">v{r.version.replace(/^v/i, '')}</span>}
      </div>
      <div className="release-content">
        {r.tags.length > 0 && (
          <ul className="release-tags" aria-label="Tipo">
            {r.tags.map((t) => (
              <li key={t} className={`release-tag release-tag-${t.toLowerCase()}`}>
                {RELEASE_TAG_LABEL[t]}
              </li>
            ))}
          </ul>
        )}
        <h2 id={`rel-${r.id}`} className="release-title">
          {r.title}
        </h2>
        <ReleaseBody text={r.body} />
      </div>
    </article>
  );
}

/**
 * Texto de una novedad: párrafos separados por una línea en blanco y listas
 * con líneas que empiezan por «- ». Sin HTML (todo se pinta como texto).
 */
export function ReleaseBody({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="release-body">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^[-*•]\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^[-*•]\s+/, '')}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {l}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
