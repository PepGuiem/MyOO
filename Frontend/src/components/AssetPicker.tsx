import { useEffect, useRef, useState } from 'react';
import { assetsApi } from '../api/endpoints';
import type { Asset } from '../api/types';
import { forgetAssetImage } from '../lib/assetImages';
import { ErrorNote } from './ErrorNote';
import { Icon } from './Icon';
import { t } from '../i18n';

const ACCEPT = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Galería de imágenes del usuario (logos, estampados) para usar en un detalle.
 * Permite subir una nueva (PNG, JPEG o WebP, máx. 2 MB) y borrar las que no
 * use ninguna prenda.
 */
export function AssetPicker({ value, onChange }: { value: string | undefined; onChange: (id: string | undefined) => void }) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const urlsRef = useRef(urls);
  urlsRef.current = urls;

  useEffect(() => {
    let alive = true;
    assetsApi
      .list()
      .then((list) => alive && setAssets(list))
      .catch((err: unknown) => alive && setError(err));
    return () => {
      alive = false;
    };
  }, []);

  // Miniaturas: la imagen necesita el token, así que la pedimos y usamos una URL local.
  useEffect(() => {
    if (!assets) return;
    let alive = true;
    for (const a of assets) {
      if (urlsRef.current[a.id]) continue;
      assetsApi
        .content(a.id)
        .then((blob) => {
          if (!alive) return;
          const url = URL.createObjectURL(blob);
          setUrls((u) => ({ ...u, [a.id]: url }));
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [assets]);

  useEffect(() => () => Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u)), []);

  async function upload(file: File) {
    setError(null);
    if (!ACCEPT.includes(file.type)) {
      setError(new Error(t('La imagen debe ser PNG, JPEG o WebP.')));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(new Error(t('La imagen ocupa más de 2 MB.')));
      return;
    }
    setBusy(true);
    try {
      const asset = await assetsApi.upload(file);
      setAssets((list) => [asset, ...(list ?? [])]);
      onChange(asset.id);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await assetsApi.remove(id);
      forgetAssetImage(id);
      setAssets((list) => (list ?? []).filter((a) => a.id !== id));
      if (value === id) onChange(undefined);
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="asset-picker">
      <div className="asset-grid" role="listbox" aria-label={t('Imágenes')}>
        <button type="button" className={`asset-tile asset-none${!value ? ' is-active' : ''}`} aria-selected={!value} role="option" onClick={() => onChange(undefined)}>
          {t('Sin imagen')}
        </button>
        {(assets ?? []).map((a) => (
          <div key={a.id} className={`asset-tile${value === a.id ? ' is-active' : ''}`}>
            <button type="button" role="option" aria-selected={value === a.id} aria-label={a.name} onClick={() => onChange(a.id)}>
              {urls[a.id] ? <img src={urls[a.id]} alt="" /> : <span className="muted small">…</span>}
            </button>
            <button type="button" className="asset-delete" aria-label={`Borrar ${a.name}`} title={t('Borrar imagen')} onClick={() => void remove(a.id)}>
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
      <label className="btn btn-small asset-upload">
        {busy ? t('Subiendo…') : t('Subir imagen')}
        <input
          ref={input}
          type="file"
          accept={ACCEPT.join(',')}
          hidden
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </label>
      <p className="muted small">{t('PNG con fondo transparente para logos. Máx. 2 MB.')}</p>
      <ErrorNote error={error} />
    </div>
  );
}
