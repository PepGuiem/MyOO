import { assetsApi } from '../api/endpoints';

/**
 * Imágenes subidas por el usuario, ya decodificadas (para texturas de los
 * detalles). Se piden una vez con el token y se guardan en memoria.
 */
const cache = new Map<string, Promise<ImageBitmap | null>>();

export function loadAssetImage(id: string): Promise<ImageBitmap | null> {
  let p = cache.get(id);
  if (!p) {
    p = assetsApi
      .content(id)
      .then((blob) => createImageBitmap(blob))
      // Imagen borrada o sin permiso: el detalle se dibuja sin ella.
      .catch(() => null);
    cache.set(id, p);
  }
  return p;
}

/** Olvida una imagen (p. ej. al borrarla). */
export function forgetAssetImage(id: string): void {
  void cache.get(id)?.then((img) => img?.close());
  cache.delete(id);
}
