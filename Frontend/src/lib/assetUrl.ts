import { useEffect, useState } from 'react';
import { assetsApi } from '../api/endpoints';

/**
 * URL local (blob:) de una imagen subida. Las imágenes necesitan el token, así
 * que no valen en un <img src="/api/..."> directo: se descargan una vez y se
 * guardan en memoria mientras dure la sesión.
 */
const cache = new Map<string, Promise<string | null>>();

export function assetObjectUrl(id: string): Promise<string | null> {
  let p = cache.get(id);
  if (!p) {
    p = assetsApi
      .content(id)
      .then((blob) => URL.createObjectURL(blob))
      .catch(() => null);
    cache.set(id, p);
  }
  return p;
}

export function useAssetUrl(id: string | null | undefined): string | null {
  const [url, setUrl] = useState<{ id: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void assetObjectUrl(id).then((u) => alive && setUrl({ id, url: u }));
    return () => {
      alive = false;
    };
  }, [id]);
  return id && url?.id === id ? url.url : null;
}
