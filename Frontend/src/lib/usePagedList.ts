import { useCallback, useEffect, useRef, useState } from 'react';
import type { Paginated } from '../api/types';

/**
 * Lista paginada para scroll infinito: pide la página 1 al cambiar `deps`
 * (filtros) y las siguientes con `loadMore()`. Descarta respuestas viejas
 * (si cambias de filtro con una petición en marcha, no se mezclan) y no
 * repite elementos si una página se solapa con la anterior.
 */
export function usePagedList<T extends { id: string }>(fetchPage: (page: number) => Promise<Paginated<T>>, deps: unknown[]) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const request = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const load = useCallback((p: number, reset: boolean) => {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    fetchRef
      .current(p)
      .then((res) => {
        if (id !== request.current) return;
        setItems((prev) => {
          if (reset) return res.data;
          const seen = new Set(prev.map((x) => x.id));
          return [...prev, ...res.data.filter((x) => !seen.has(x.id))];
        });
        setPage(p);
        setTotalPages(res.meta.totalPages);
        setTotal(res.meta.total);
      })
      .catch((err: unknown) => {
        if (id === request.current) setError(err);
      })
      .finally(() => {
        if (id === request.current) setLoading(false);
      });
  }, []);

  // Filtros nuevos: lista vacía y página 1.
  useEffect(() => {
    setItems([]);
    setPage(0);
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const hasMore = page < totalPages;
  const loadMore = useCallback(() => {
    if (!loading && hasMore && !error) load(page + 1, false);
  }, [loading, hasMore, error, load, page]);

  /** Vuelve a la página 1 sin vaciar la lista (tras crear o borrar algo). */
  const reload = useCallback(() => load(1, true), [load]);

  return { items, setItems, total, setTotal, loading, error, hasMore, loadMore, reload, page };
}
