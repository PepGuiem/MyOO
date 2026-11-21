import { useMemo, useState } from 'react';
import type { UserBrief } from '../../api/types';
import { t } from '../../i18n';
import { encodeQr, type QrCode } from '../../lib/qr';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { brandSvgUrl, useBrandSvg } from '../../lib/brandColors';
import { MARK_URL } from '../Logo';
import { personName, profilePath } from './PersonAvatar';

const QUIET = 4; // margen blanco obligatorio alrededor del QR (en módulos)
const INK = '#0b0b0c';
const PAPER = '#f1eee9';

/**
 * Dirección pública del perfil. En la web es esta misma página; en la app de
 * Android/iOS el origen es "localhost", así que se usa el de la API publicada.
 */
export function profileUrl(person: Pick<UserBrief, 'id' | 'username'>): string {
  const api = import.meta.env.VITE_API_URL as string | undefined;
  const origin = api && /^https?:\/\//.test(api) ? new URL(api).origin : window.location.origin;
  return `${origin}${profilePath(person)}`;
}

/** Tamaño del hueco central para el logo (en módulos, impar para centrarlo). */
function logoSpan(size: number): number {
  const s = Math.round(size * 0.24);
  return s % 2 === 0 ? s + 1 : s;
}

/** Geometría del QR en unidades de módulo (incluido el margen). */
function qrShapes(qr: QrCode, withLogo: boolean) {
  const { size, modules } = qr;
  const span = withLogo ? logoSpan(size) : 0;
  const lo = (size - span) / 2;
  const inLogo = (x: number, y: number) => withLogo && x >= lo - 0.5 && x < lo + span + 0.5 && y >= lo - 0.5 && y < lo + span + 0.5;
  let d = '';
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      if (!modules[y][x] || inLogo(x, y)) continue;
      d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
    }
  return { total: size + QUIET * 2, d, logo: withLogo ? { x: lo + QUIET, size: span } : null };
}

/**
 * El SVG del QR (también se usa para la imagen descargable). Ojos cuadrados
 * clásicos: con el logo en el centro, los ojos redondeados fallaban en algunos
 * lectores; así lo lee cualquier cámara.
 */
function qrSvg(qr: QrCode, logoHref: string | null, px?: number): string {
  const s = qrShapes(qr, !!logoHref);
  const logo = s.logo
    ? `<rect x="${s.logo.x - 0.3}" y="${s.logo.x - 0.3}" width="${s.logo.size + 0.6}" height="${s.logo.size + 0.6}" rx="1.4" fill="${PAPER}"/>` +
      `<image href="${logoHref}" x="${s.logo.x + 0.3}" y="${s.logo.x + 0.3}" width="${s.logo.size - 0.6}" height="${s.logo.size - 0.6}"/>`
    : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.total} ${s.total}"${px ? ` width="${px}" height="${px}"` : ''} shape-rendering="crispEdges">` +
    `<rect width="${s.total}" height="${s.total}" rx="2" fill="${PAPER}"/>` +
    `<path d="${s.d}" fill="${INK}"/>` +
    logo +
    `</svg>`
  );
}

/** QR dibujado (escalable). Lleva el icono de MyOO en el centro. */
export function QrImage({ text, label, className = '' }: { text: string; label: string; className?: string }) {
  const mark = useBrandSvg(MARK_URL);
  const svg = useMemo(() => qrSvg(encodeQr(text, 'H'), mark), [text, mark]);
  return <span className={`qr-image ${className}`} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** El logo como data: URL (para pintarlo en el canvas); null si no carga. */
async function dataUrl(url: string): Promise<string | null> {
  const res = await fetch(url);
  const blob = await res.blob();
  if (!res.ok || !blob.type.startsWith('image/')) return null;
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** PNG de 1080 px (cuadrado, para redes) con el QR y el nombre debajo. */
async function qrPng(text: string, caption: string): Promise<Blob> {
  const logo = await brandSvgUrl(MARK_URL)
    .then(dataUrl)
    .catch(() => null);
  const side = 860;
  const svg = qrSvg(encodeQr(text, 'H'), logo, side);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const W = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = W;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, W);
  ctx.drawImage(img, (W - side) / 2, 60, side, side);
  ctx.fillStyle = INK;
  ctx.font = '700 46px Archivo, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(caption, W / 2, 1000, W - 80);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
}

/** Diálogo con el QR de un perfil: descargar, copiar el enlace o compartir. */
export function ProfileQrDialog({
  person,
  isSelf,
  onClose,
}: {
  person: Pick<UserBrief, 'id' | 'username' | 'displayName'>;
  isSelf: boolean;
  onClose: () => void;
}) {
  const url = profileUrl(person);
  const name = personName(person);
  const handle = person.username ? `@${person.username}` : name;
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function download() {
    setBusy(true);
    try {
      const blob = await qrPng(url, handle);
      const href = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = href;
      a.download = `myoo-qr-${person.username ?? person.id}.png`;
      document.body.append(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch {
      setNote(t('No se ha podido crear la imagen.'));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNote(t('Enlace copiado'));
    } catch {
      setNote(url);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: t('{name} en MyOO', { name }), url });
    } catch {
      // cancelado por la persona
    }
  }

  return (
    <Modal title={isSelf ? t('Tu QR') : t('QR de {name}', { name })} onClose={onClose} className="qr-dialog">
      <div className="qr-card">
        <span className="wd-kicker">
          <Icon name="qr" size={12} /> {t('Scan me')}
        </span>
        <QrImage text={url} label={t('Código QR del perfil de {name}', { name })} />
        <strong className="qr-handle">{handle}</strong>
        <span className="qr-url">{url.replace(/^https?:\/\//, '')}</span>
      </div>
      <p className="muted small qr-help">
        {isSelf
          ? t('Enséñalo o compártelo: al escanearlo con la cámara se abre tu perfil en MyOO.')
          : t('Al escanearlo con la cámara se abre este perfil en MyOO.')}
      </p>
      <div className="actions qr-actions">
        <button type="button" className="btn wd-add" disabled={busy} onClick={() => void download()}>
          <Icon name="download" size={14} /> <span>{busy ? t('Preparando…') : t('Descargar imagen')}</span>
        </button>
        <button type="button" className="btn wd-btn-line" onClick={() => void copy()}>
          <Icon name="copy" size={14} /> <span>{t('Copiar enlace')}</span>
        </button>
        {canShare && (
          <button type="button" className="btn wd-btn-line" onClick={() => void share()}>
            <Icon name="send" size={14} /> <span>{t('Compartir')}</span>
          </button>
        )}
      </div>
      {note && (
        <p className="small qr-note" role="status">
          {note}
        </p>
      )}
    </Modal>
  );
}
