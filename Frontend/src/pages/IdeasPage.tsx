import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ideasApi } from '../api/endpoints';
import type { Idea, IdeaSort, IdeaStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { IdeaCard, ProposeIdeaDialog } from '../components/community/IdeaCard';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { Spinner } from '../components/Spinner';
import { IDEA_STATUSES, IDEA_STATUS_LABEL } from '../lib/community';

const SORTS: { value: IdeaSort; label: string }[] = [
  { value: 'top', label: 'Más votadas' },
  { value: 'new', label: 'Recientes' },
  { value: 'mine', label: 'Mías' },
];

/** Tablón de ideas: /ideas (y /ideas?idea=<id> para ir a una concreta). */
export function IdeasPage() {
  const [params, setParams] = useSearchParams();
  const focus = params.get('idea');
  const [proposing, setProposing] = useState(false);
  const [created, setCreated] = useState<Idea | null>(null);

  return (
    <section className="page ideas-page">
      <header className="page-head">
        <div>
          <h1>Ideas</h1>
          <p className="muted">¿Qué echas de menos en MyOut? Propónlo o vota lo que ya han propuesto. El equipo lo lee todo y contesta aquí.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-primary" onClick={() => setProposing(true)}>
            <Icon name="bulb" size={15} /> Proponer una idea
          </button>
        </div>
      </header>

      <IdeaBoard
        focusId={focus}
        prepend={created}
        onFocusDone={() => {
          if (focus) setParams({}, { replace: true });
        }}
      />

      {proposing && (
        <ProposeIdeaDialog
          onClose={() => setProposing(false)}
          onCreated={(i) => {
            setProposing(false);
            setCreated(i);
          }}
        />
      )}
    </section>
  );
}

/**
 * Lista de ideas con orden, filtro por estado y búsqueda. Se usa en /ideas y
 * en la pestaña «Ideas» del panel de admin.
 */
export function IdeaBoard({
  defaultSort = 'top',
  defaultStatus = '',
  focusId,
  prepend,
  onFocusDone,
}: {
  defaultSort?: IdeaSort;
  defaultStatus?: IdeaStatus | '';
  focusId?: string | null;
  prepend?: Idea | null;
  onFocusDone?: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [sort, setSort] = useState<IdeaSort>(defaultSort);
  const [status, setStatus] = useState<IdeaStatus | ''>(defaultStatus);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Idea[] | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [focused, setFocused] = useState<Idea | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setSearch(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const fetchPage = useCallback(
    (p: number) => ideasApi.list({ sort, status: status || undefined, search: search || undefined, page: p }),
    [sort, status, search],
  );

  useEffect(() => {
    let alive = true;
    setItems(null);
    setError(null);
    fetchPage(1)
      .then((r) => {
        if (!alive) return;
        setItems(r.data);
        setPage(1);
        setTotalPages(r.meta.totalPages);
        setTotal(r.meta.total);
      })
      .catch((err: unknown) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, [fetchPage]);

  // Venir de un aviso (/ideas?idea=…): se trae esa idea y se resalta.
  useEffect(() => {
    if (!focusId) return;
    let alive = true;
    ideasApi
      .get(focusId)
      .then((i) => {
        if (!alive) return;
        setFocused(i);
        setHighlight(i.id);
      })
      .catch((err: unknown) => alive && setError(err))
      .finally(() => onFocusDone?.());
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (!prepend) return;
    setItems((l) => [prepend, ...(l ?? []).filter((i) => i.id !== prepend.id)]);
    setTotal((t) => t + 1);
    setHighlight(prepend.id);
  }, [prepend]);

  async function more() {
    setLoadingMore(true);
    try {
      const r = await fetchPage(page + 1);
      setItems((l) => [...(l ?? []), ...r.data.filter((i) => !l?.some((x) => x.id === i.id))]);
      setPage(page + 1);
      setTotalPages(r.meta.totalPages);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  }

  const update = (i: Idea) => {
    setItems((l) => l?.map((x) => (x.id === i.id ? i : x)) ?? l);
    setFocused((f) => (f?.id === i.id ? i : f));
  };
  const remove = (id: string) => {
    setItems((l) => l?.filter((x) => x.id !== id) ?? l);
    setFocused((f) => (f?.id === id ? null : f));
    setTotal((t) => Math.max(0, t - 1));
  };

  // La idea a la que se ha venido va arriba si no está en la página cargada.
  const list = items ? (focused && !items.some((i) => i.id === focused.id) ? [focused, ...items] : items) : null;

  return (
    <div className="idea-board">
      <div className="idea-toolbar">
        <div className="segmented segmented-tabs" role="group" aria-label="Ordenar">
          {SORTS.map((s) => (
            <button key={s.value} type="button" aria-pressed={sort === s.value} onClick={() => setSort(s.value)}>
              {s.label}
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={15} />
          <input type="search" value={q} placeholder="Buscar ideas" aria-label="Buscar ideas" onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="chips chips-small idea-filters" role="group" aria-label="Filtrar por estado">
        <button type="button" className={`chip${status === '' ? ' is-active' : ''}`} aria-pressed={status === ''} onClick={() => setStatus('')}>
          Todas
        </button>
        {IDEA_STATUSES.map((s) => (
          <button key={s} type="button" className={`chip${status === s ? ' is-active' : ''}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
            {IDEA_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <ErrorNote error={error} />
      {!list && !error && <Spinner label="Cargando ideas…" />}
      {list && list.length === 0 && (
        <div className="empty">
          <p>{sort === 'mine' ? 'Aún no has propuesto ninguna idea.' : search || status ? 'No hay ideas con ese filtro.' : 'Todavía no hay ideas. ¡Estrena el tablón!'}</p>
        </div>
      )}
      {list && list.length > 0 && (
        <>
          <p className="muted small idea-count">{total === 1 ? '1 idea' : `${total} ideas`}</p>
          <div className="idea-list">
            {list.map((i) => (
              <IdeaCard key={i.id} idea={i} isAdmin={isAdmin} highlighted={highlight === i.id} onChange={update} onRemove={remove} />
            ))}
          </div>
          {page < totalPages && (
            <button type="button" className="btn idea-load-more" disabled={loadingMore} onClick={() => void more()}>
              {loadingMore ? 'Cargando…' : 'Cargar más'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
