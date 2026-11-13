import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { chatApi, outfitsApi } from '../api/endpoints';
import type { ChatMessage, ConversationDetail, ConversationMember, ConversationSummary, Outfit, PersonResult, SharedOutfit } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { ReportDialog } from '../components/community/ReportDialog';
import { Modal } from '../components/Modal';
import { PeoplePicker } from '../components/social/PeoplePicker';
import { PersonAvatar, personName, profilePath } from '../components/social/PersonAvatar';
import { Busy, Spinner } from '../components/Spinner';
import { useBodyShape } from '../lib/bodyPref';
import { useRealtime, useRealtimeEvent } from '../lib/realtime';
import { OutfitView } from '../three/OutfitMannequin';

const PAGE = 40;

/** Nombre de una conversación: el título del grupo o la otra persona. */
function convName(c: { isGroup: boolean; title: string | null; members: ConversationMember[] }, me: string): string {
  if (c.isGroup) return c.title ?? 'Grupo';
  const other = c.members.find((m) => m.id !== me);
  return other ? personName(other) : 'Solo tú';
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/** Texto de un aviso del sistema en un grupo. */
function systemText(m: ChatMessage, members: ConversationMember[], me: string): string {
  const who = m.sender ? (m.sender.id === me ? 'Has' : `${personName(m.sender)} ha`) : 'Alguien ha';
  const nameOf = (id: string) => (id === me ? 'ti' : personName(members.find((x) => x.id === id) ?? null).replace('Usuario eliminado', 'alguien'));
  const body = m.body ?? '';
  if (body === 'created') return `${who} creado el grupo`;
  if (body === 'renamed') return `${who} cambiado el nombre del grupo`;
  if (body === 'left') return m.sender?.id === me ? 'Has salido del grupo' : `${personName(m.sender)} ha salido del grupo`;
  if (body.startsWith('added:')) return `${who} añadido a ${nameOf(body.slice(6))}`;
  if (body.startsWith('removed:')) return `${who} quitado a ${nameOf(body.slice(8))}`;
  return '';
}

function preview(m: ChatMessage | null, me: string): string {
  if (!m) return 'Sin mensajes todavía';
  if (m.deleted) return 'Mensaje eliminado';
  if (m.kind === 'SYSTEM') return 'Aviso del grupo';
  const mine = m.sender?.id === me ? 'Tú: ' : '';
  if (m.kind === 'OUTFIT') return `${mine}Ha enviado un outfit${m.body ? ` · ${m.body}` : ''}`;
  return `${mine}${m.body ?? ''}`;
}

export function ChatPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [convs, setConvs] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [creating, setCreating] = useState<'direct' | 'group' | null>(null);
  const me = user?.id ?? '';

  const load = useCallback(() => {
    chatApi
      .list()
      .then(setConvs)
      .catch(setError);
  }, []);
  useEffect(load, [load]);

  useRealtimeEvent((e) => {
    if (e.type === 'ready' || e.type === 'conversation') load();
    if (e.type === 'message') {
      setConvs((list) => {
        if (!list) return list;
        const i = list.findIndex((c) => c.id === e.message.conversationId);
        if (i < 0) {
          load();
          return list;
        }
        const c = list[i];
        const mineOrOpen = e.message.sender?.id === me || c.id === id;
        const updated = { ...c, lastMessage: e.message, lastMessageAt: e.message.createdAt, unread: mineOrOpen ? 0 : c.unread + (e.message.kind === 'SYSTEM' ? 0 : 1) };
        return [updated, ...list.slice(0, i), ...list.slice(i + 1)];
      });
    }
  });

  const markSeen = useCallback((cid: string) => setConvs((l) => l?.map((c) => (c.id === cid ? { ...c, unread: 0 } : c)) ?? l), []);

  return (
    <section className={`page chat${id ? ' has-thread' : ''}`}>
      <aside className="chat-list" aria-label="Conversaciones">
        <header className="chat-list-head">
          <h1>Mensajes</h1>
          <div className="actions">
            <button type="button" className="btn btn-small" onClick={() => setCreating('direct')}>
              <Icon name="chat" size={14} /> Nuevo
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setCreating('group')}>
              <Icon name="users" size={14} /> Grupo
            </button>
          </div>
        </header>
        <ErrorNote error={error} />
        {!convs && <Spinner label="Cargando…" />}
        {convs && convs.length === 0 && (
          <div className="chat-empty">
            <p className="muted">Aún no tienes conversaciones.</p>
            <Link to="/personas" className="btn btn-small">
              Buscar personas
            </Link>
          </div>
        )}
        <ul className="conv-list">
          {convs?.map((c) => {
            const other = c.isGroup ? null : c.members.find((m) => m.id !== me) ?? null;
            return (
              <li key={c.id}>
                <Link to={`/mensajes/${c.id}`} className={`conv-item${c.id === id ? ' is-active' : ''}${c.unread ? ' is-unread' : ''}`}>
                  {c.isGroup ? (
                    <span className="avatar conv-group-avatar" aria-hidden="true">
                      <Icon name="users" size={18} />
                    </span>
                  ) : (
                    <PersonAvatar person={other} size={44} />
                  )}
                  <span className="conv-text">
                    <span className="conv-top">
                      <strong>{convName(c, me)}</strong>
                      <time dateTime={c.lastMessageAt}>{timeLabel(c.lastMessageAt)}</time>
                    </span>
                    <span className="conv-bottom">
                      <span className="conv-preview">{preview(c.lastMessage, me)}</span>
                      {c.unread > 0 && <span className="badge" aria-label={`${c.unread} sin leer`}>{c.unread > 99 ? '99+' : c.unread}</span>}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="chat-main">
        {id ? (
          <Thread key={id} id={id} me={me} onSeen={markSeen} onLeft={() => navigate('/mensajes', { replace: true })} />
        ) : (
          <div className="chat-placeholder">
            <Icon name="chat" size={36} />
            <p className="muted">Elige una conversación o empieza una nueva.</p>
          </div>
        )}
      </div>

      {creating === 'direct' && <NewDirect onClose={() => setCreating(null)} onOpen={(cid) => navigate(`/mensajes/${cid}`)} />}
      {creating === 'group' && (
        <NewGroup
          onClose={() => setCreating(null)}
          onOpen={(cid) => {
            load();
            navigate(`/mensajes/${cid}`);
          }}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Una conversación
// ---------------------------------------------------------------------------

function Thread({ id, me, onSeen, onLeft }: { id: string; me: string; onSeen: (id: string) => void; onLeft: () => void }) {
  const { send: sendRt } = useRealtime();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [reporting, setReporting] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const loadDetail = useCallback(() => {
    chatApi
      .get(id)
      .then(setDetail)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) onLeft();
        else setError(err);
      });
  }, [id, onLeft]);

  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    onSeen(id);
    chatApi.read(id).catch(() => undefined);
  }, [id, onSeen]);

  useEffect(() => {
    loadDetail();
    chatApi
      .messages(id)
      .then((m) => {
        setMessages(m);
        setMore(m.length === PAGE);
        markRead();
      })
      .catch(setError);
  }, [id, loadDetail, markRead]);

  // Al volver a la pestaña, lo que llegó mientras tanto queda leído.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && markRead();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  useRealtimeEvent((e) => {
    if (e.type === 'message' && e.message.conversationId === id) {
      setMessages((l) => (l && !l.some((m) => m.id === e.message.id) ? [...l, e.message] : l));
      setTyping((t) => {
        const n = { ...t };
        if (e.message.sender) delete n[e.message.sender.id];
        return n;
      });
      if (e.message.sender?.id !== me) markRead();
      if (e.message.kind === 'SYSTEM') loadDetail();
    }
    if (e.type === 'message_deleted' && e.conversationId === id) {
      setMessages((l) => l?.map((m) => (m.id === e.messageId ? { ...m, deleted: true, body: null, outfit: null } : m)) ?? l);
    }
    if (e.type === 'read' && e.conversationId === id) {
      setDetail((d) => (d ? { ...d, members: d.members.map((m) => (m.id === e.userId ? { ...m, lastReadAt: e.at } : m)) } : d));
    }
    if (e.type === 'typing' && e.conversationId === id) setTyping((t) => ({ ...t, [e.userId]: Date.now() }));
    if (e.type === 'conversation' && e.conversationId === id) loadDetail();
    if (e.type === 'ready') loadDetail();
  });

  // "Está escribiendo…" desaparece a los 4 s sin avisos nuevos.
  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const t = window.setInterval(() => {
      setTyping((cur) => Object.fromEntries(Object.entries(cur).filter(([, at]) => Date.now() - at < 4000)));
    }, 1000);
    return () => window.clearInterval(t);
  }, [typing]);

  // Bajar al último mensaje si ya estabas abajo.
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  async function loadOlder() {
    if (!messages?.length) return;
    const el = scroller.current;
    const before = el?.scrollHeight ?? 0;
    const older = await chatApi.messages(id, messages[0].createdAt);
    setMore(older.length === PAGE);
    stick.current = false;
    setMessages((l) => [...older, ...(l ?? [])]);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  }

  async function remove(m: ChatMessage) {
    try {
      await chatApi.deleteMessage(id, m.id);
    } catch (err) {
      setError(err);
    }
  }

  if (!detail || !messages) {
    return (
      <div className="chat-thread">
        <ErrorNote error={error} />
        {!error && <Spinner label="Cargando conversación…" />}
      </div>
    );
  }

  const others = detail.members.filter((m) => m.id !== me);
  const other = detail.isGroup ? null : others[0] ?? null;
  const typingNames = Object.keys(typing)
    .map((uid) => detail.members.find((m) => m.id === uid))
    .filter((m): m is ConversationMember => !!m)
    .map(personName);
  const myLast = [...messages].reverse().find((m) => m.sender?.id === me && !m.deleted);
  const seenBy = myLast ? others.filter((m) => m.lastReadAt && m.lastReadAt >= myLast.createdAt) : [];

  return (
    <div className="chat-thread">
      <header className="thread-head">
        <Link to="/mensajes" className="btn btn-small btn-ghost thread-back" aria-label="Volver a las conversaciones">
          <Icon name="back" size={14} />
        </Link>
        {other ? (
          <Link to={profilePath(other)} className="thread-who">
            <PersonAvatar person={other} size={36} />
            <span>
              <strong>{personName(other)}</strong>
              {other.username && <small className="muted">@{other.username}</small>}
            </span>
          </Link>
        ) : detail.isGroup ? (
          <button type="button" className="thread-who" onClick={() => setShowInfo((v) => !v)} aria-expanded={showInfo}>
            <span className="avatar conv-group-avatar" aria-hidden="true">
              <Icon name="users" size={16} />
            </span>
            <span>
              <strong>{detail.title}</strong>
              <small className="muted">{detail.members.length} personas</small>
            </span>
          </button>
        ) : (
          <span className="thread-who">
            <strong>Solo tú</strong>
          </span>
        )}
        {detail.isGroup && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setShowInfo((v) => !v)} aria-expanded={showInfo}>
            <Icon name="more" size={16} />
            <span className="visually-hidden">Información del grupo</span>
          </button>
        )}
      </header>

      <div className="thread-body">
        <div
          className="messages"
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          aria-live="polite"
        >
          {more && (
            <button type="button" className="btn btn-small btn-ghost load-older" onClick={() => void loadOlder()}>
              Cargar anteriores
            </button>
          )}
          {messages.length === 0 && <p className="muted chat-hint">Escribe el primer mensaje.</p>}
          {messages.map((m, i) => {
            if (m.kind === 'SYSTEM') {
              return (
                <p key={m.id} className="msg-system">
                  {systemText(m, detail.members, me)}
                </p>
              );
            }
            const mine = m.sender?.id === me;
            const prev = messages[i - 1];
            const grouped = prev && prev.kind !== 'SYSTEM' && prev.sender?.id === m.sender?.id && Date.parse(m.createdAt) - Date.parse(prev.createdAt) < 5 * 60_000;
            return (
              <div key={m.id} className={`msg${mine ? ' is-mine' : ''}${grouped ? ' is-grouped' : ''}`}>
                {!mine && detail.isGroup && !grouped && <span className="msg-author">{personName(m.sender)}</span>}
                <div className="msg-row">
                  {!mine && detail.isGroup && (grouped ? <span className="msg-avatar-gap" /> : <PersonAvatar person={m.sender} size={28} />)}
                  <div className={`bubble${m.deleted ? ' is-deleted' : ''}`}>
                    {m.deleted ? (
                      <em>Mensaje eliminado</em>
                    ) : (
                      <>
                        {m.outfit && <OutfitBubble outfit={m.outfit} />}
                        {m.body && <p>{m.body}</p>}
                      </>
                    )}
                    <time dateTime={m.createdAt}>{timeLabel(m.createdAt)}</time>
                  </div>
                  {mine && !m.deleted && (
                    <button type="button" className="msg-delete" title="Eliminar mensaje" onClick={() => void remove(m)}>
                      <Icon name="trash" size={13} />
                      <span className="visually-hidden">Eliminar mensaje</span>
                    </button>
                  )}
                  {!mine && !m.deleted && m.sender && (
                    <button type="button" className="msg-delete msg-report" title="Denunciar mensaje" onClick={() => setReporting(m.id)}>
                      <Icon name="flag" size={13} />
                      <span className="visually-hidden">Denunciar mensaje</span>
                    </button>
                  )}
                </div>
                {myLast?.id === m.id && seenBy.length > 0 && (
                  <small className="msg-seen">{detail.isGroup ? `Visto por ${seenBy.length}` : 'Visto'}</small>
                )}
              </div>
            );
          })}
          {typingNames.length > 0 && (
            <p className="typing">
              <span className="typing-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              {typingNames.join(', ')} {typingNames.length > 1 ? 'están' : 'está'} escribiendo…
            </p>
          )}
        </div>

        {showInfo && detail.isGroup && <GroupInfo detail={detail} me={me} onChange={setDetail} onLeft={onLeft} />}
      </div>

      <ErrorNote error={error} />
      {detail.canSend ? (
        <Composer id={id} onTyping={() => sendRt({ type: 'typing', conversationId: id })} onSent={(m) => setMessages((l) => (l && !l.some((x) => x.id === m.id) ? [...l, m] : l))} />
      ) : (
        <p className="chat-blocked muted">No puedes escribir en esta conversación (por su privacidad o por un bloqueo).</p>
      )}
      {reporting && <ReportDialog targetType="MESSAGE" targetId={reporting} onClose={() => setReporting(null)} />}
    </div>
  );
}

function OutfitBubble({ outfit }: { outfit: SharedOutfit }) {
  const [active, setActive] = useState(false);
  const { shape } = useBodyShape();
  const garments = useMemo(() => outfit.items.map((i) => ({ ...i.wardrobeItem, styling: i.styling })), [outfit.items]);
  return (
    <div className="outfit-bubble" onMouseEnter={() => setActive(true)} onMouseLeave={() => setActive(false)}>
      <div className="outfit-bubble-stage">
        <OutfitView className="tile-view" garments={garments} shape={shape} active={active} distance={4.9} />
      </div>
      <strong>{outfit.name}</strong>
      <small className="muted">{outfit.items.map((i) => i.wardrobeItem.name).join(' · ')}</small>
    </div>
  );
}

function Composer({ id, onTyping, onSent }: { id: string; onTyping: () => void; onSent: (m: ChatMessage) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [picking, setPicking] = useState(false);
  const lastTyping = useRef(0);

  async function send(body: { body?: string; outfitId?: string }) {
    setBusy(true);
    setError(null);
    try {
      onSent(await chatApi.send(id, body));
      if (body.body) setText('');
    } catch (err) {
      setError(err instanceof ApiError && err.body?.code === 'slow_down' ? new Error('Vas muy rápido: espera un momento.') : err);
    } finally {
      setBusy(false);
    }
  }

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if (body && !busy) void send({ body });
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <ErrorNote error={error} />
      <div className="composer-row">
        <button type="button" className="btn btn-small btn-ghost" title="Enviar un outfit" onClick={() => setPicking(true)} disabled={busy}>
          <Icon name="hanger" size={16} />
          <span className="visually-hidden">Enviar un outfit</span>
        </button>
        <textarea
          rows={1}
          maxLength={2000}
          value={text}
          placeholder="Escribe un mensaje"
          aria-label="Mensaje"
          onKeyDown={onKey}
          onChange={(e) => {
            setText(e.target.value);
            if (Date.now() - lastTyping.current > 2000) {
              lastTyping.current = Date.now();
              onTyping();
            }
          }}
        />
        <button type="submit" className="btn btn-primary btn-small" disabled={busy || !text.trim()}>
          <Icon name="send" size={14} />
          <span className="visually-hidden">Enviar</span>
        </button>
      </div>
      {picking && (
        <OutfitPicker
          onClose={() => setPicking(false)}
          onPick={(o) => {
            setPicking(false);
            void send({ outfitId: o.id, body: text.trim() || undefined });
            setText('');
          }}
        />
      )}
    </form>
  );
}

function OutfitPicker({ onClose, onPick }: { onClose: () => void; onPick: (o: Outfit) => void }) {
  const [outfits, setOutfits] = useState<Outfit[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    outfitsApi
      .list()
      .then((r) => setOutfits(r.data))
      .catch(setError);
  }, []);
  return (
    <Modal title="Enviar un outfit" onClose={onClose}>
      <ErrorNote error={error} />
      {!outfits && !error && <Spinner label="Cargando tus outfits…" />}
      {outfits?.length === 0 && <p className="muted">Aún no tienes outfits.</p>}
      <ul className="outfit-pick-list">
        {outfits?.map((o) => (
          <li key={o.id}>
            <button type="button" className="picker-item" onClick={() => onPick(o)}>
              <Icon name="hanger" size={16} />
              <span className="person-text">
                <strong>{o.name}</strong>
                <small className="muted">{o.items.map((i) => i.wardrobeItem.name).join(' · ')}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Grupo: miembros, nombre y salir
// ---------------------------------------------------------------------------

const ROLE_LABEL = { OWNER: 'Creador', ADMIN: 'Admin', MEMBER: '' } as const;

function GroupInfo({ detail, me, onChange, onLeft }: { detail: ConversationDetail; me: string; onChange: (d: ConversationDetail) => void; onLeft: () => void }) {
  const myRole = detail.members.find((m) => m.id === me)?.role ?? 'MEMBER';
  const canAdmin = myRole !== 'MEMBER';
  const [title, setTitle] = useState(detail.title ?? '');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err);
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function rename(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || t === detail.title) return;
    const d = await run(() => chatApi.rename(detail.id, t));
    if (d) onChange(d);
  }

  async function add(p: PersonResult) {
    const d = await run(() => chatApi.addMembers(detail.id, [p.id]));
    if (d) {
      onChange(d);
      setAdding(false);
    }
  }

  async function removeMember(m: ConversationMember) {
    await run(() => chatApi.removeMember(detail.id, m.id));
    onChange({ ...detail, members: detail.members.filter((x) => x.id !== m.id) });
  }

  async function toggleAdmin(m: ConversationMember) {
    const d = await run(() => chatApi.setRole(detail.id, m.id, m.role === 'ADMIN' ? 'MEMBER' : 'ADMIN'));
    if (d) onChange(d);
  }

  async function leave() {
    if (!confirmLeave) {
      setConfirmLeave(true);
      return;
    }
    const ok = await run(() => chatApi.removeMember(detail.id, me));
    if (ok !== undefined) onLeft();
  }

  return (
    <aside className="group-info" aria-label="Información del grupo">
      {canAdmin ? (
        <form className="inline-form" onSubmit={rename}>
          <label className="field">
            <span>Nombre del grupo</span>
            <input maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={rename} />
          </label>
        </form>
      ) : (
        <h2>{detail.title}</h2>
      )}

      <div className="group-members-head">
        <strong>{detail.members.length} personas</strong>
        {canAdmin && (
          <button type="button" className="btn btn-small" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
            <Icon name="plus" size={12} /> Añadir
          </button>
        )}
      </div>
      {adding && <PeoplePicker autoFocus exclude={detail.members.map((m) => m.id)} onPick={(p) => void add(p)} />}

      <ul className="group-members">
        {detail.members.map((m) => (
          <li key={m.id}>
            <Link to={profilePath(m)} className="person-link">
              <PersonAvatar person={m} size={30} />
              <span className="person-text">
                <strong>{m.id === me ? 'Tú' : personName(m)}</strong>
                {ROLE_LABEL[m.role] && <small className="muted">{ROLE_LABEL[m.role]}</small>}
              </span>
            </Link>
            {m.id !== me && m.role !== 'OWNER' && (
              <span className="group-member-actions">
                {myRole === 'OWNER' && (
                  <button type="button" className="link-btn" disabled={busy} onClick={() => void toggleAdmin(m)}>
                    {m.role === 'ADMIN' ? 'Quitar admin' : 'Hacer admin'}
                  </button>
                )}
                {canAdmin && (myRole === 'OWNER' || m.role === 'MEMBER') && (
                  <button type="button" className="link-btn danger-text" disabled={busy} onClick={() => void removeMember(m)}>
                    Quitar
                  </button>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>

      <ErrorNote error={error} />
      <button type="button" className={`btn btn-small${confirmLeave ? ' btn-danger-solid' : ' btn-ghost'}`} disabled={busy} onClick={() => void leave()}>
        {confirmLeave ? 'Pulsa otra vez para salir' : 'Salir del grupo'}
      </button>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Nueva conversación y nuevo grupo
// ---------------------------------------------------------------------------

function NewDirect({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function pick(p: PersonResult) {
    setBusy(true);
    setError(null);
    try {
      const c = await chatApi.direct(p.id);
      onClose();
      onOpen(c.id);
    } catch (err) {
      setError(
        err instanceof ApiError && err.body?.code === 'cannot_message'
          ? new Error(`${personName(p)} no recibe mensajes tuyos (según su privacidad).`)
          : err,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Nueva conversación" onClose={onClose}>
      <PeoplePicker autoFocus onPick={(p) => void pick(p)} />
      {busy && <Busy text="Abriendo…" />}
      <ErrorNote error={error} />
    </Modal>
  );
}

function NewGroup({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [people, setPeople] = useState<PersonResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function toggle(p: PersonResult) {
    setPeople((l) => (l.some((x) => x.id === p.id) ? l.filter((x) => x.id !== p.id) : [...l, p]));
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const c = await chatApi.createGroup(title.trim(), people.map((p) => p.id));
      onClose();
      onOpen(c.id);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal title="Nuevo grupo" onClose={onClose}>
      <form className="stack" onSubmit={create}>
        <label className="field">
          <span>Nombre del grupo</span>
          <input required maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        {people.length > 0 && (
          <div className="chips">
            {people.map((p) => (
              <button key={p.id} type="button" className="chip is-active" onClick={() => toggle(p)} title="Quitar">
                {personName(p)} <Icon name="close" size={10} />
              </button>
            ))}
          </div>
        )}
        <PeoplePicker selected={people.map((p) => p.id)} onPick={toggle} />
        <p className="muted small">Solo puedes añadir a quien acepte mensajes tuyos según su privacidad.</p>
        <ErrorNote error={error} />
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || people.length === 0}>
            {busy ? <Busy text="Creando…" /> : `Crear grupo (${people.length + 1})`}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
