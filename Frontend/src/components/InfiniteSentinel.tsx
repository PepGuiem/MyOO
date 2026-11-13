import { useEffect, useRef } from 'react';
import { ErrorNote } from './ErrorNote';
import { Spinner } from './Spinner';

/**
 * Marca invisible al final de una lista: cuando se acerca a la pantalla
 * (800 px antes) pide la página siguiente. Si la página nueva no llena la
 * pantalla, vuelve a pedir otra al terminar de cargar.
 */
export function InfiniteSentinel({
  hasMore,
  loading,
  error,
  onMore,
  endLabel,
  count,
}: {
  hasMore: boolean;
  loading: boolean;
  error: unknown;
  onMore: () => void;
  /** Texto al llegar al final (si hay más de una tanda). */
  endLabel?: string;
  count: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const more = useRef(onMore);
  more.current = onMore;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loading || error) return;
    if (typeof IntersectionObserver === 'undefined') return;
    // Se crea de nuevo al acabar cada carga: si la marca sigue a la vista,
    // el observador avisa enseguida y se pide otra tanda.
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && more.current(), { rootMargin: '800px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, error]);

  return (
    <div ref={ref} className="infinite-end" aria-live="polite">
      {loading && count > 0 && <Spinner size={18} label="Cargando más…" />}
      {error ? (
        <div className="infinite-error">
          <ErrorNote error={error} />
          <button type="button" className="btn btn-small" onClick={onMore}>
            Reintentar
          </button>
        </div>
      ) : null}
      {!hasMore && !loading && endLabel && count > 0 && <p className="infinite-done">{endLabel}</p>}
      {/* Por si el navegador no tiene IntersectionObserver */}
      {hasMore && !loading && !error && typeof IntersectionObserver === 'undefined' && (
        <button type="button" className="btn" onClick={onMore}>
          Cargar más
        </button>
      )}
    </div>
  );
}
