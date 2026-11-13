/** Fichas de relleno mientras llega la lista (en lugar de un hueco vacío). */
export function TileSkeletons({ count = 8, outfit = false }: { count?: number; outfit?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`tile is-skeleton${outfit ? ' tile-outfit' : ''}`} aria-hidden="true">
          <div className="tile-stage" />
          <span className="skeleton-line" style={{ width: `${55 + ((i * 37) % 35)}%` }} />
          <span className="skeleton-line skeleton-line-small" />
        </div>
      ))}
    </>
  );
}
