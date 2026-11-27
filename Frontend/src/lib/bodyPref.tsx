import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { mannequinsApi } from '../api/endpoints';
import type { Mannequin } from '../api/types';
import { useAuth } from '../auth/AuthContext';
// bodyShapes (y no body/bodyMeasures): el arranque no debe descargar three.js.
import { BODY_SHAPES, DEFAULT_BODY, type BodyShape } from '../three/bodyShapes';

/** Prefijo de los ids de selección que son maniquíes de la cuenta: «m:<uuid>». */
const MANNEQUIN_PREFIX = 'm:';

export const mannequinSelectionId = (id: string) => MANNEQUIN_PREFIX + id;

type ShapeFromMeasures = (typeof import('../three/bodyMeasures'))['shapeFromMeasures'];

/** Silueta 3D de un maniquí de la cuenta (sus medidas reales). */
function shapeOfMannequin(m: Mannequin, shapeFromMeasures: ShapeFromMeasures): BodyShape {
  // El id cambia con updatedAt: al editar las medidas, makeBody recalcula.
  return shapeFromMeasures(m.sex, m.measures, `m:${m.id}:${m.updatedAt}`, m.name);
}

/**
 * Pasar medidas a silueta construye el cuerpo en 3D (three.js), así que ese
 * código se descarga aparte, solo cuando la cuenta tiene maniquíes propios.
 */
let measuresModule: Promise<ShapeFromMeasures> | null = null;
function loadShapeFromMeasures(): Promise<ShapeFromMeasures> {
  measuresModule ??= import('../three/bodyMeasures').then(
    (m) => m.shapeFromMeasures,
    (err: unknown) => {
      measuresModule = null; // se reintenta la próxima vez
      throw err;
    },
  );
  return measuresModule;
}

interface BodyPref {
  /** Silueta con la que se dibuja el maniquí en toda la app. */
  shape: BodyShape;
  /** Lo elegido: id de una silueta genérica o «m:<id>» de un maniquí de la cuenta. */
  selectedId: string;
  setShapeId: (id: string) => void;
  /** Maniquíes personalizados de la cuenta (vacío sin sesión). */
  mannequins: Mannequin[];
  mannequinShapes: Map<string, BodyShape>;
  mannequinsLoaded: boolean;
  reloadMannequins: () => Promise<Mannequin[]>;
}

const BodyContext = createContext<BodyPref | null>(null);

const storageKey = (userId: string | undefined) => (userId ? `myout.body.${userId}` : 'myout.body');

function readStored(userId: string | undefined): string | null {
  try {
    return localStorage.getItem(storageKey(userId)) ?? localStorage.getItem('myout.body');
  } catch {
    return null;
  }
}

/**
 * Maniquí elegido. Los maniquíes personalizados son de la CUENTA (backend, con
 * límite por plan); el que se usa por defecto también se guarda en la cuenta
 * (isDefault), así se ve el mismo en todos los dispositivos. Además se recuerda
 * en este navegador la última elección (también si es una silueta genérica).
 */
export function BodyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [mannequins, setMannequins] = useState<Mannequin[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => readStored(userId));
  const [fromMeasures, setFromMeasures] = useState<ShapeFromMeasures | null>(null);

  const reloadMannequins = useCallback(async () => {
    if (!userId) {
      setMannequins([]);
      setLoaded(false);
      return [];
    }
    try {
      const list = await mannequinsApi.list();
      // Antes de enseñarlos, el código que pasa sus medidas a silueta (así
      // nunca hay maniquíes sin silueta; mientras, se ve la genérica).
      if (list.length) {
        try {
          const fn = await loadShapeFromMeasures();
          setFromMeasures(() => fn);
        } catch {
          /* sin red: los maniquíes de la cuenta se ven con la silueta genérica */
        }
      }
      setMannequins(list);
      return list;
    } catch {
      // Sin maniquíes (p. ej. backend sin la migración): se usan los genéricos.
      setMannequins([]);
      return [];
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    setSelectedId(readStored(userId));
    setLoaded(false);
    void reloadMannequins();
  }, [userId, reloadMannequins]);

  const mannequinShapes = useMemo(
    () => (fromMeasures ? new Map(mannequins.map((m) => [m.id, shapeOfMannequin(m, fromMeasures)])) : new Map<string, BodyShape>()),
    [mannequins, fromMeasures],
  );

  const setShapeId = useCallback(
    (next: string) => {
      setSelectedId(next);
      try {
        localStorage.setItem(storageKey(userId), next);
      } catch {
        /* almacenamiento no disponible */
      }
      // Un maniquí de la cuenta pasa a ser el predeterminado (para otros dispositivos).
      if (next.startsWith(MANNEQUIN_PREFIX)) {
        const id = next.slice(MANNEQUIN_PREFIX.length);
        const m = mannequins.find((x) => x.id === id);
        if (m && !m.isDefault) {
          void mannequinsApi
            .update(id, { isDefault: true })
            .then(() => reloadMannequins())
            .catch(() => undefined);
        }
      }
    },
    [userId, mannequins, reloadMannequins],
  );

  const value = useMemo<BodyPref>(() => {
    const fallbackDefault = mannequins.find((m) => m.isDefault);
    let id = selectedId ?? (fallbackDefault ? mannequinSelectionId(fallbackDefault.id) : DEFAULT_BODY.id);
    let shape: BodyShape | undefined;
    if (id.startsWith(MANNEQUIN_PREFIX)) {
      shape = mannequinShapes.get(id.slice(MANNEQUIN_PREFIX.length));
      if (!shape && loaded) {
        // Borrado o de otra cuenta: el predeterminado de la cuenta o el genérico.
        id = fallbackDefault ? mannequinSelectionId(fallbackDefault.id) : DEFAULT_BODY.id;
        shape = fallbackDefault ? mannequinShapes.get(fallbackDefault.id) : undefined;
      }
    }
    shape ??= BODY_SHAPES.find((b) => b.id === id) ?? DEFAULT_BODY;
    return {
      shape,
      selectedId: id,
      setShapeId,
      mannequins,
      mannequinShapes,
      mannequinsLoaded: loaded,
      reloadMannequins,
    };
  }, [selectedId, mannequins, mannequinShapes, loaded, setShapeId, reloadMannequins]);

  return <BodyContext.Provider value={value}>{children}</BodyContext.Provider>;
}

export function useBodyShape(): BodyPref {
  const ctx = useContext(BodyContext);
  if (!ctx) throw new Error('useBodyShape must be used inside <BodyProvider>');
  return ctx;
}
