import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, ideasApi } from '../../api/endpoints';
import type { Idea, IdeaCategory, IdeaStatus } from '../../api/types';
import { friendlyError, IDEA_CATEGORIES, IDEA_CATEGORY_LABEL, IDEA_STATUSES, IDEA_STATUS_LABEL, timeAgo } from '../../lib/community';
import { ErrorNote } from '../ErrorNote';
import { Icon } from '../Icon';
import { Modal } from '../Modal';
import { Select } from '../Select';
import { PersonAvatar, personName, profilePath } from '../social/PersonAvatar';
import { Busy } from '../Spinner';
import { ReportDialog } from './ReportDialog';
import { t, tn } from '../../i18n';

export function IdeaStatusBadge({ status }: { status: IdeaStatus }) {
  return <span className={`idea-status idea-status-${status.toLowerCase()}`}>{IDEA_STATUS_LABEL[status]}</span>;
}

/** Una idea del tablón: votos, estado, respuesta del equipo y acciones. */
export function IdeaCard({
  idea,
  isAdmin,
  highlighted,
  onChange,
  onRemove,
}: {
  idea: Idea;
  isAdmin: boolean;
  highlighted?: boolean;
  onChange: (idea: Idea) => void;
  onRemove: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<'report' | 'manage' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [voting, setVoting] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const long = idea.body.length > 280;
  const canDelete = idea.mine && idea.status === 'NEW' && !idea.adminReply;

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [highlighted]);

  async function vote() {
    if (voting) return;
    const on = !idea.votedByMe;
    setVoting(true);
    setError(null);
    // Se ve al momento; si falla, se deshace.
    onChange({ ...idea, votedByMe: on, voteCount: idea.voteCount + (on ? 1 : -1) });
    try {
      const r = await ideasApi.vote(idea.id, on);
      onChange({ ...idea, ...r });
    } catch (err) {
      onChange(idea);
      setError(err);
    } finally {
      setVoting(false);
    }
  }

  async function remove() {
    setMenu(false);
    try {
      await ideasApi.remove(idea.id);
      onRemove(idea.id);
    } catch (err) {
      setError(err);
    }
  }

  const hasMenu = canDelete || !idea.mine || isAdmin;

  return (
    <article ref={ref} className={`idea${highlighted ? ' is-highlighted' : ''}${idea.hidden ? ' is-hidden' : ''}`} aria-labelledby={`idea-${idea.id}`}>
      <button
        type="button"
        className={`idea-vote${idea.votedByMe ? ' is-voted' : ''}`}
        aria-pressed={idea.votedByMe}
        aria-label={`${idea.votedByMe ? t('Quitar tu voto') : t('Votar')}. ${tn(idea.voteCount, '{n} voto', '{n} votos')}`}
        onClick={() => void vote()}
        disabled={voting}
      >
        <Icon name="up" size={16} />
        <span>{idea.voteCount}</span>
      </button>

      <div className="idea-main">
        <header className="idea-head">
          <div className="idea-badges">
            {idea.pinned && (
              <span className="idea-flag">
                <Icon name="pin" size={12} /> {t('Fijada')}
              </span>
            )}
            <IdeaStatusBadge status={idea.status} />
            <span className="idea-cat">{IDEA_CATEGORY_LABEL[idea.category]}</span>
            {idea.hidden && (
              <span className="idea-flag">
                <Icon name="eyeOff" size={12} /> {t('Oculta')}
              </span>
            )}
          </div>
          {hasMenu && (
            <span className="menu-wrap">
              <button type="button" className="icon-btn" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((v) => !v)} onBlur={(e) => !e.currentTarget.parentElement?.contains(e.relatedTarget) && setMenu(false)}>
                <Icon name="more" size={16} />
                <span className="visually-hidden">{t('Más opciones')}</span>
              </button>
              {menu && (
                <span className="menu" role="menu">
                  {isAdmin && (
                    <button type="button" role="menuitem" onClick={() => (setMenu(false), setDialog('manage'))}>
                      {t('Gestionar (admin)')}
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" role="menuitem" className="danger-text" onClick={() => void remove()}>
                      {t('Borrar mi idea')}
                    </button>
                  )}
                  {!idea.mine && (
                    <button type="button" role="menuitem" onClick={() => (setMenu(false), setDialog('report'))}>
                      {t('Denunciar')}
                    </button>
                  )}
                </span>
              )}
            </span>
          )}
        </header>

        <h3 id={`idea-${idea.id}`} className="idea-title">
          {idea.title}
        </h3>
        <p className={`idea-body${long && !expanded ? ' is-clamped' : ''}`}>{idea.body}</p>
        {long && (
          <button type="button" className="link-btn idea-more" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t('Ver menos') : t('Leer más')}
          </button>
        )}

        {idea.adminReply && (
          <div className="idea-reply">
            <span className="idea-reply-label">
              <Icon name="shield" size={12} /> {t('Respuesta del equipo')}
              {idea.repliedAt && <time dateTime={idea.repliedAt}> · {timeAgo(idea.repliedAt)}</time>}
            </span>
            <p>{idea.adminReply}</p>
          </div>
        )}
        {idea.duplicateOfId && (
          <p className="small muted">
            {t('Repetida:')} <Link to={`/ideas?idea=${idea.duplicateOfId}`}>{t('ver la idea original')}</Link> {t('y vota allí.')}
          </p>
        )}

        <footer className="idea-foot">
          {idea.author ? (
            <Link to={profilePath(idea.author)} className="idea-author">
              <PersonAvatar person={idea.author} size={20} />
              {idea.mine ? t('Tú') : personName(idea.author)}
            </Link>
          ) : (
            <span className="idea-author muted">{t('Cuenta eliminada')}</span>
          )}
          <time dateTime={idea.createdAt} className="muted">
            {timeAgo(idea.createdAt)}
          </time>
        </footer>
        <ErrorNote error={error} />
      </div>

      {dialog === 'report' && <ReportDialog targetType="IDEA" targetId={idea.id} onClose={() => setDialog(null)} />}
      {dialog === 'manage' && (
        <IdeaAdminDialog
          idea={idea}
          onClose={() => setDialog(null)}
          onSaved={(i) => {
            onChange(i);
            setDialog(null);
          }}
          onDeleted={() => onRemove(idea.id)}
        />
      )}
    </article>
  );
}

/** Lo que puede hacer un admin con una idea: estado, respuesta, fijar, ocultar, borrar. */
export function IdeaAdminDialog({ idea, onClose, onSaved, onDeleted }: { idea: Idea; onClose: () => void; onSaved: (i: Idea) => void; onDeleted: () => void }) {
  const [status, setStatus] = useState<IdeaStatus>(idea.status);
  const [reply, setReply] = useState(idea.adminReply ?? '');
  const [pinned, setPinned] = useState(idea.pinned);
  const [hidden, setHidden] = useState(idea.hidden);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const ids = useId();

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await adminApi.updateIdea(idea.id, {
        status,
        adminReply: reply.trim() || null,
        pinned,
        hidden,
      });
      // La vista del admin no trae "mine" ni "votedByMe": se conservan.
      onSaved({ ...saved, mine: idea.mine, votedByMe: idea.votedByMe });
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await adminApi.deleteIdea(idea.id);
      onDeleted();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const statusChanged = status !== idea.status;
  const replyChanged = (reply.trim() || null) !== idea.adminReply;

  return (
    <Modal title={t('Gestionar idea')} onClose={onClose}>
      <form className="stack" onSubmit={save}>
        <p className="idea-admin-title">
          <strong>{idea.title}</strong> <span className="muted">{t('· {voteCount} votos', { voteCount: idea.voteCount })}</span>
        </p>
        <div className="field">
          <span id={`${ids}-status`}>{t('Estado')}</span>
          <Select value={status} labelledBy={`${ids}-status`} options={IDEA_STATUSES.map((s) => ({ value: s, label: IDEA_STATUS_LABEL[s] }))} onChange={(v) => setStatus(v as IdeaStatus)} />
        </div>
        <label className="field">
          <span>{t('Respuesta del equipo (pública)')}</span>
          <textarea rows={4} maxLength={2000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('Gracias por la idea. La tenemos en cuenta para…')} />
        </label>
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> {t('Fijar arriba')}
          </label>
          <label className="check">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> {t('Ocultar del tablón')}
          </label>
        </div>
        {(statusChanged || replyChanged) && (
          <p className="note small">
            {t('Al guardar se avisará {v}{v2}{v3}.', { v: replyChanged && reply.trim() ? t('a quien la propuso') : '', v2: replyChanged && reply.trim() && statusChanged ? t(' y ') : '', v3: statusChanged ? t('a quien la votó') : '' })}
          </p>
        )}
        <ErrorNote error={error} />
        <div className="dialog-actions">
          {confirmDelete ? (
            <>
              <span className="small danger-text">{t('¿Borrar la idea y sus votos? No se puede deshacer.')}</span>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>
                {t('No')}
              </button>
              <button type="button" className="btn btn-danger-solid" disabled={busy} onClick={() => void remove()}>
                {t('Sí, borrar')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" size={14} /> {t('Borrar')}
              </button>
              <span className="spacer" />
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                {t('Cancelar')}
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? <Busy text={t('Guardando…')} /> : t('Guardar')}
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

/** Formulario para proponer una idea (con las parecidas que ya existen). */
export function ProposeIdeaDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (i: Idea) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<IdeaCategory>('FEATURE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [similar, setSimilar] = useState<Idea[]>([]);
  const ids = useId();

  // ¿Ya la ha propuesto alguien? Mejor votar esa que repetirla.
  useEffect(() => {
    const q = title.trim();
    if (q.length < 4) {
      setSimilar([]);
      return;
    }
    let alive = true;
    const t = window.setTimeout(() => {
      ideasApi
        .list({ search: q.slice(0, 60), sort: 'top' })
        .then((r) => alive && setSimilar(r.data.slice(0, 3)))
        .catch(() => undefined);
    }, 350);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [title]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await ideasApi.create({ title: title.trim(), body: body.trim(), category }));
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  const valid = title.trim().length >= 5 && body.trim().length >= 10;

  return (
    <Modal title={t('Proponer una idea')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>{t('Título')}</span>
          <input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={t('Ej.: Calendario para planear los outfits de la semana')} required />
        </label>
        {similar.length > 0 && (
          <div className="idea-similar">
            <span className="small muted">{t('¿Es alguna de estas? Vota la que ya existe:')}</span>
            <ul>
              {similar.map((i) => (
                <li key={i.id}>
                  <Link to={`/ideas?idea=${i.id}`} onClick={onClose}>
                    {i.title}
                  </Link>{' '}
                  <span className="muted small">{t('· {voteCount} votos', { voteCount: i.voteCount })}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <fieldset className="field">
          <legend id={`${ids}-cat`}>{t('Tipo')}</legend>
          <div className="chips chips-small" role="radiogroup" aria-labelledby={`${ids}-cat`}>
            {IDEA_CATEGORIES.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={category === c} className={`chip${category === c ? ' is-active' : ''}`} onClick={() => setCategory(c)}>
                {IDEA_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span>{t('Cuéntala')}</span>
          <textarea rows={5} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('¿Qué te gustaría poder hacer y para qué te serviría?')} required />
          <small className="muted field-count">{body.length}/2000</small>
        </label>
        <ErrorNote error={error} />
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('Cancelar')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
            {busy ? <Busy text={t('Publicando…')} /> : t('Publicar idea')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
