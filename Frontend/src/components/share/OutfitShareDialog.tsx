import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GarmentLike } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { t } from '../../i18n';
import { canShareFile, composeShareImage, downloadFile, shareFile, shareFileName, SHARE_FORMATS, type ShareFormat } from '../../lib/shareImage';
import type { BodyShape } from '../../three/body';
import { OutfitSnapshot } from '../../three/OutfitMannequin';
import { ErrorBoundary } from '../ErrorBoundary';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { Spinner } from '../Spinner';

interface Picture {
  file: File;
  url: string;
}

/**
 * «Compartir imagen» de un outfit: genera una foto del maniquí vestido (solo
 * al abrir el diálogo o al cambiar de formato), la enseña y la comparte con
 * el menú del sistema o la descarga en PNG.
 */
export function OutfitShareDialog({
  name,
  garments,
  shape,
  isPrivate,
  onClose,
}: {
  name: string;
  garments: GarmentLike[];
  shape?: BodyShape;
  /** El outfit (o la cuenta) es privado: se avisa de que la imagen sí se verá fuera. */
  isPrivate: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const handle = user?.username ? `@${user.username}` : null;
  const title = name.trim() || t('Outfit');
  const [format, setFormat] = useState<ShareFormat>('post');
  const [pictures, setPictures] = useState<Partial<Record<ShareFormat, Picture>>>({});
  const [failed, setFailed] = useState<Partial<Record<ShareFormat, boolean>>>({});
  const [note, setNote] = useState<string | null>(null);
  const picture = pictures[format];
  const generating = !picture && !failed[format];

  // Las URL de las vistas previas se liberan al cerrar.
  const created = useRef<string[]>([]);
  useEffect(() => () => created.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const fail = useCallback((f: ShareFormat) => setFailed((prev) => ({ ...prev, [f]: true })), []);

  const capture = useCallback(
    (f: ShareFormat, frame: HTMLCanvasElement) => {
      composeShareImage(frame, f, { title, kicker: t('Outfit'), handle })
        .then((blob) => {
          const file = new File([blob], shareFileName(title, f), { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          created.current.push(url);
          setPictures((prev) => ({ ...prev, [f]: { file, url } }));
        })
        .catch(() => fail(f));
    },
    [title, handle, fail],
  );
  const onCapture = useCallback((frame: HTMLCanvasElement) => capture(format, frame), [capture, format]);

  const spec = SHARE_FORMATS[format];
  const shareable = useMemo(() => (picture ? canShareFile(picture.file) : false), [picture]);

  function share() {
    if (!picture) return;
    setNote(null);
    // Sin esperas antes: el navegador solo abre el menú dentro del clic.
    void shareFile(picture.file, title).then((r) => r === 'downloaded' && setNote(t('Imagen descargada.')));
  }

  function download() {
    if (!picture) return;
    downloadFile(picture.file);
    setNote(t('Imagen descargada.'));
  }

  function retry() {
    setFailed((prev) => ({ ...prev, [format]: false }));
  }

  return (
    <Modal title={t('Compartir imagen')} onClose={onClose} className="share-dialog">
      <div className="segmented segmented-small segmented-fill share-formats" role="group" aria-label={t('Formato')}>
        <button type="button" aria-pressed={format === 'post'} onClick={() => setFormat('post')}>
          {t('Publicación · 4:5')}
        </button>
        <button type="button" aria-pressed={format === 'story'} onClick={() => setFormat('story')}>
          {t('Historia · 9:16')}
        </button>
      </div>

      <div
        className="share-preview"
        // Cabe a lo ancho en el diálogo y, de alto, en 58vh (con su proporción).
        style={{ aspectRatio: `${spec.width} / ${spec.height}`, width: `min(100%, calc(min(58vh, 560px) * ${(spec.width / spec.height).toFixed(4)}))` }}
      >
        {picture ? (
          <img src={picture.url} alt={t('Vista previa de «{name}»', { name: title })} />
        ) : failed[format] ? (
          <div className="share-failed">
            <p className="note note-error">{t('No se ha podido crear la imagen.')}</p>
            <button type="button" className="btn wd-btn-line" onClick={retry}>
              <Icon name="refresh" size={14} /> {t('Reintentar')}
            </button>
          </div>
        ) : (
          <Spinner size={30} label={t('Creando la imagen…')} />
        )}
      </div>

      {generating && (
        <ErrorBoundary key={format} fallback={null} onError={() => fail(format)}>
          <OutfitSnapshot
            key={format}
            garments={garments}
            shape={shape}
            width={spec.width}
            height={spec.height}
            distance={spec.distance}
            targetY={spec.targetY}
            onCapture={onCapture}
          />
        </ErrorBoundary>
      )}

      {isPrivate && (
        <p className="share-warn" role="note">
          <Icon name="eyeOff" size={14} /> {t('Este outfit es privado, pero la imagen sí se podrá ver fuera de MyOO si la compartes.')}
        </p>
      )}

      <div className="actions share-actions">
        {shareable && (
          <button type="button" className="btn wd-add" onClick={share}>
            <Icon name="send" size={14} /> <span>{t('Compartir')}</span>
          </button>
        )}
        <button type="button" className={`btn ${shareable ? 'wd-btn-line' : 'wd-add'}`} disabled={!picture} onClick={download}>
          <Icon name="download" size={14} /> <span>{t('Descargar imagen')}</span>
        </button>
      </div>
      {note && (
        <p className="small share-note" role="status">
          {note}
        </p>
      )}
    </Modal>
  );
}
