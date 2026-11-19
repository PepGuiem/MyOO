import { useEffect, useState } from 'react';
import { releasesApi } from '../api/endpoints';
import type { Release } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/Spinner';
import { NoMatch } from '../components/street/EmptyStage';
import { SectionHead } from '../components/street/SectionHead';
import { UPCOMING } from '../lib/features';
import { longDate, RELEASE_TAG_LABEL } from '../lib/community';
import { t } from '../i18n';

/** Novedades: lo nuevo de MyOO, de lo más reciente a lo más antiguo. */
export function ReleasesPage() {
  const [items, setItems] = useState<Release[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (window.location.hash === '#proximamente') document.getElementById('proximamente')?.scrollIntoView({ block: 'start' });
  }, []);

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
    <section className="page releases-page ux nv">
      <header className="ux-head nv-head">
        <div>
          <span className="wd-kicker">
            <Icon name="megaphone" size={12} /> {t('Changelog')}
          </span>
          <h1 className="wd-title ux-title" data-text={t('Novedades')}>
            {t('Novedades')}
          </h1>
          <p className="ux-lede">{t('Lo nuevo de MyOO. Cuando publiquemos algo te llegará un aviso a la campanita.')}</p>
        </div>
      </header>

      {UPCOMING.length > 0 && (
        <section id="proximamente" className="upcoming" aria-labelledby="upcoming-title">
          <SectionHead n={1} id="upcoming-title" title={t('Próximamente')}>
            <span className="rec-dot" aria-hidden="true" />
          </SectionHead>
          <ul className="upcoming-list">
            {UPCOMING.map((u) => (
              <li key={u.id} className="upcoming-card">
                <span className="upcoming-icon" aria-hidden="true">
                  <Icon name={u.icon} size={22} />
                </span>
                <div>
                  <span className="release-tag release-tag-soon">{t('Próximo lanzamiento')}</span>
                  <h3>{u.title}</h3>
                  <p>{u.body}</p>
                  <ul className="upcoming-points">
                    {u.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SectionHead n={UPCOMING.length > 0 ? 2 : 1} title={t('Publicadas')} />
      <ErrorNote error={error} />
      {!items && !error && <Spinner label={t('Cargando novedades…')} />}
      {items && items.length === 0 && <NoMatch icon="megaphone" title={t('Sin novedades')} text={t('Aún no hay novedades publicadas.')} />}
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
        <button type="button" className="btn wd-btn-line nv-more" onClick={() => void more()}>
          {t('Ver anteriores')}
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
          <span className="release-draft">{t('Borrador')}</span>
        )}
        {r.version && <span className="release-version">v{r.version.replace(/^v/i, '')}</span>}
      </div>
      <div className="release-content">
        {r.tags.length > 0 && (
          <ul className="release-tags" aria-label={t('Tipo')}>
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
