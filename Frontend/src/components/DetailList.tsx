import { useEffect, useState } from 'react';
import { assetsApi } from '../api/endpoints';
import type { CustomDetail } from '../api/types';
import { DETAIL_FONT_LABEL, DETAIL_KIND_LABEL, DETAIL_SHAPE_LABEL } from '../lib/customLabels';
import { Icon } from './Icon';

/**
 * Lista de los detalles de una prenda (parches, bordados, estampados,
 * dibujos…): una fila por detalle con su miniatura, qué es y cuánto mide, y
 * botones para editarlo, duplicarlo o quitarlo. Pulsar la fila lo resalta en
 * el 3D. Se usa en el visor, en «Personalizar» y en el formulario de prenda.
 */
export function DetailList({
  details,
  selectedId,
  onSelect,
  onEdit,
  onDuplicate,
  onRemove,
  canDuplicate = true,
  label = 'Detalles de la prenda',
}: {
  details: CustomDetail[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onEdit?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onRemove?: (id: string) => void;
  canDuplicate?: boolean;
  label?: string;
}) {
  if (!details.length) return null;
  return (
    <ul className="detail-rows" aria-label={label}>
      {details.map((d) => {
        const active = d.id === selectedId;
        return (
          <li key={d.id} className={`detail-row${active ? ' is-active' : ''}`}>
            <button
              type="button"
              className="detail-row-main"
              aria-pressed={onSelect ? active : undefined}
              onClick={onSelect ? () => onSelect(active ? null : d.id) : onEdit ? () => onEdit(d.id) : undefined}
              title={onSelect ? (active ? 'Quitar el resaltado' : 'Resaltar en la prenda') : undefined}
            >
              <DetailThumb detail={d} />
              <span className="detail-row-text">
                <span className="detail-row-title">{detailTitle(d)}</span>
                <span className="detail-row-meta">{detailMeta(d)}</span>
              </span>
            </button>
            <span className="detail-row-actions">
              {onEdit && (
                <button type="button" className="icon-btn" aria-label={`Editar ${detailTitle(d)}`} title="Editar" onClick={() => onEdit(d.id)}>
                  <Icon name="edit" size={15} />
                </button>
              )}
              {onDuplicate && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Duplicar ${detailTitle(d)}`}
                  title={canDuplicate ? 'Duplicar' : 'Has llegado al máximo de detalles'}
                  disabled={!canDuplicate}
                  onClick={() => onDuplicate(d.id)}
                >
                  <Icon name="copy" size={15} />
                </button>
              )}
              {onRemove && (
                <button type="button" className="icon-btn icon-btn-danger" aria-label={`Quitar ${detailTitle(d)}`} title="Quitar" onClick={() => onRemove(d.id)}>
                  <Icon name="trash" size={15} />
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** «Parche · MYOUT», «Estampado (imagen)», «Dibujo»… */
export function detailTitle(d: CustomDetail): string {
  const kind = DETAIL_KIND_LABEL[d.kind];
  if (d.text) return `${kind} · ${d.text}`;
  if (d.assetId && d.kind !== 'drawing') return `${kind} con imagen`;
  return kind;
}

function detailMeta(d: CustomDetail): string {
  const cm = Math.round(d.size * 1000) / 10;
  const parts = [`${cm.toLocaleString('es-ES')} cm`];
  if (d.shape) parts.push(DETAIL_SHAPE_LABEL[d.shape].toLowerCase());
  if (d.font && d.text) parts.push(`letra ${DETAIL_FONT_LABEL[d.font].toLowerCase()}`);
  const where = d.normal[2] < -0.35 ? 'detrás' : Math.abs(d.normal[0]) > 0.6 ? (d.position[0] > 0 ? 'lado izquierdo' : 'lado derecho') : 'delante';
  parts.push(where);
  return parts.join(' · ');
}

/** URLs locales de las imágenes de los detalles (la imagen pide el token). */
const thumbCache = new Map<string, Promise<string | null>>();
function assetUrl(id: string): Promise<string | null> {
  let p = thumbCache.get(id);
  if (!p) {
    p = assetsApi.content(id).then(
      (blob) => URL.createObjectURL(blob),
      () => null,
    );
    thumbCache.set(id, p);
  }
  return p;
}

function DetailThumb({ detail: d }: { detail: CustomDetail }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!d.assetId) {
      setUrl(null);
      return;
    }
    let alive = true;
    void assetUrl(d.assetId).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [d.assetId]);
  const round = d.shape === 'circle' || d.kind === 'pin' || d.kind === 'button' || d.kind === 'rivet' || d.kind === 'stud';
  return (
    <span className={`detail-thumb${round ? ' is-round' : ''}`} style={{ background: url ? undefined : d.kind === 'patch' || d.kind === 'label' ? d.color : undefined }} aria-hidden="true">
      {url ? (
        <img src={url} alt="" />
      ) : d.text ? (
        <span className="detail-thumb-text" style={{ color: d.kind === 'patch' || d.kind === 'label' ? d.secondaryColor ?? '#F2F2F2' : d.color }}>
          {d.text.slice(0, 4)}
        </span>
      ) : (
        <span className="detail-thumb-dot" style={{ background: d.color }} />
      )}
    </span>
  );
}
