import { useId, useState, type FormEvent } from 'react';
import { reportsApi } from '../../api/endpoints';
import type { ReportReason, ReportTarget } from '../../api/types';
import { REPORT_REASONS, REPORT_REASON_LABEL } from '../../lib/community';
import { ErrorNote } from '../ErrorNote';
import { Modal } from '../Modal';
import { Busy } from '../Spinner';
import { t } from '../../i18n';

const WHAT: Record<ReportTarget, string> = {
  USER: t('este perfil'),
  MESSAGE: t('este mensaje'),
  OUTFIT: t('este outfit'),
  IDEA: t('esta idea'),
  LISTING: t('este anuncio'),
};

/**
 * Denunciar algo. Lo ve solo el equipo de MyOut, junto con una copia de lo
 * denunciado; la otra persona no sabe quién la ha denunciado.
 */
export function ReportDialog({ targetType, targetId, onClose }: { targetType: ReportTarget; targetId: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const ids = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await reportsApi.create({ targetType, targetId, reason, details: details.trim() || undefined });
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Denunciar ${WHAT[targetType]}`} onClose={onClose}>
      {done ? (
        <div className="stack">
          <p>{t('Gracias por avisar. El equipo lo revisará y te llegará un aviso cuando lo hayamos mirado.')}</p>
          <p className="muted small">{t('La otra persona no sabrá quién la ha denunciado.')}</p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              {t('Cerrar')}
            </button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <fieldset className="field">
            <legend>{t('¿Qué pasa?')}</legend>
            <div className="report-reasons" role="radiogroup">
              {REPORT_REASONS.map((r) => (
                <label key={r} className={`report-reason${reason === r ? ' is-active' : ''}`}>
                  <input type="radio" name={`${ids}-reason`} value={r} checked={reason === r} onChange={() => setReason(r)} />
                  {REPORT_REASON_LABEL[r]}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field">
            <span>{t('Detalles (opcional)')}</span>
            <textarea rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder={t('Cuéntanos lo que haga falta para entenderlo')} />
          </label>
          <ErrorNote error={error} />
          <div className="dialog-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('Cancelar')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!reason || busy}>
              {busy ? <Busy text={t('Enviando…')} /> : t('Enviar denuncia')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
