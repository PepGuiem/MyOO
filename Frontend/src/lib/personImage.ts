import { useEffect, useState } from 'react';
import { peopleApi } from '../api/endpoints';

/**
 * Foto o portada de otra persona como URL blob:. Necesitan el token, así que
 * se descargan una vez por (persona, imagen) y se guardan en memoria.
 * `key` cambia cuando la persona cambia la imagen.
 */
const cache = new Map<string, Promise<string | null>>();

export function usePersonImage(userId: string | null | undefined, key: string | null | undefined, kind: 'avatar' | 'cover'): string | null {
  const [state, setState] = useState<{ id: string; url: string | null } | null>(null);
  const id = userId && key ? `${kind}:${userId}:${key}` : null;
  useEffect(() => {
    if (!id || !userId) return;
    let p = cache.get(id);
    if (!p) {
      p = (kind === 'avatar' ? peopleApi.avatar(userId) : peopleApi.cover(userId))
        .then((b) => URL.createObjectURL(b))
        .catch(() => null);
      cache.set(id, p);
    }
    let alive = true;
    void p.then((url) => alive && setState({ id, url }));
    return () => {
      alive = false;
    };
  }, [id, userId, kind]);
  return id && state?.id === id ? state.url : null;
}
