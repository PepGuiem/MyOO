import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from 'react';
import { LoadingOverlay } from '../components/Spinner';

/**
 * Carga dentro de un escenario 3D: las prendas y el maniquí avisan mientras
 * descargan su modelo (`useReportLoading`) y el escenario enseña el icono de
 * carga encima. El contexto llega dentro del <Canvas> (React Three Fiber lo
 * comparte). Fuera de un `LoadingScope` el aviso no hace nada.
 */
type Report = (key: string, loading: boolean) => void;
const LoadingCtx = createContext<Report | null>(null);

export function LoadingScope({ children, label }: { children: ReactNode; label?: string }) {
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback<Report>((key, loading) => {
    setKeys((prev) => {
      if (prev.has(key) === loading) return prev;
      const next = new Set(prev);
      if (loading) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  return (
    <LoadingCtx.Provider value={report}>
      {children}
      <LoadingOverlay show={keys.size > 0} label={label} />
    </LoadingCtx.Provider>
  );
}

export function useReportLoading(loading: boolean): void {
  const report = useContext(LoadingCtx);
  const id = useId();
  useEffect(() => {
    if (!report) return;
    report(id, loading);
    return () => report(id, false);
  }, [report, id, loading]);
}
