import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../../api/endpoints';
import type { AppNotification } from '../../api/types';
import { NOTIFICATION_ICON, timeAgo } from '../../lib/community';
import { useRealtime, useRealtimeEvent } from '../../lib/realtime';
import { ErrorNote } from '../ErrorNote';
import { Icon } from '../Icon';
import { Spinner } from '../Spinner';
import { t } from '../../i18n';

const PAGE = 30;

/**
 * Campanita de avisos: novedades de la app, respuestas a tus ideas, nuevos
 * seguidores… Los nuevos llegan al momento por el WebSocket.
 */
export function NotificationBell() {
  const { notifications: count, setNotifications } = useRealtime();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError(null);
    notificationsApi
      .list()
      .then((r) => {
        setItems(r);
        setMore(r.length === PAGE);
      })
      .catch(setError);
  }, []);

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(360, window.innerWidth - 16);
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', place);
    };
  }, [open, load, place]);

  // Con la lista abierta, lo nuevo aparece arriba sin recargar a mano.
  useRealtimeEvent((e) => {
    if (e.type === 'notification' && open) load();
  });

  async function loadMore() {
    const last = items?.[items.length - 1];
    if (!last) return;
    try {
      const r = await notificationsApi.list(last.createdAt);
      setItems((l) => [...(l ?? []), ...r]);
      setMore(r.length === PAGE);
    } catch (err) {
      setError(err);
    }
  }

  async function readAll() {
    try {
      const r = await notificationsApi.read();
      setNotifications(r.unread);
      const now = new Date().toISOString();
      setItems((l) => l?.map((n) => ({ ...n, readAt: n.readAt ?? now })) ?? l);
    } catch (err) {
      setError(err);
    }
  }

  function openItem(n: AppNotification) {
    if (!n.readAt) {
      setItems((l) => l?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? l);
      notificationsApi
        .read([n.id])
        .then((r) => setNotifications(r.unread))
        .catch(() => undefined);
    }
    if (n.link) {
      setOpen(false);
      navigate(n.link);
    }
  }

  const label = count > 0 ? t('Avisos ({count} sin leer)', { count }) : t('Avisos');

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`bell${count > 0 ? ' has-unread' : ''}`}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="bell" size={18} />
        {count > 0 && <span className="bell-count">{count > 99 ? '99+' : count}</span>}
      </button>
      {open &&
        pos &&
        createPortal(
          <div ref={panel} className="notif-panel" role="dialog" aria-label={t('Avisos')} style={{ top: pos.top, left: pos.left }}>
            <header className="notif-head">
              <strong>{t('Avisos')}</strong>
              {items?.some((n) => !n.readAt) && (
                <button type="button" className="link-btn" onClick={() => void readAll()}>
                  {t('Marcar todo como leído')}
                </button>
              )}
            </header>
            <ErrorNote error={error} />
            {!items && !error && <Spinner size={16} label={t('Cargando avisos…')} />}
            {items && items.length === 0 && (
              <p className="notif-empty muted">
                {t('Nada por aquí todavía. Te avisaremos de las novedades de MyOO, de las respuestas a tus ideas y de quién te sigue.')}
              </p>
            )}
            {items && items.length > 0 && (
              <ul className="notif-list">
                {items.map((n) => (
                  <li key={n.id}>
                    <button type="button" className={`notif-item${n.readAt ? '' : ' is-unread'}`} onClick={() => openItem(n)}>
                      <span className="notif-icon">
                        <Icon name={NOTIFICATION_ICON[n.type]} size={15} />
                      </span>
                      <span className="notif-text">
                        <span className="notif-title">{n.title}</span>
                        {n.body && <span className="notif-body">{n.body}</span>}
                        <time className="notif-time" dateTime={n.createdAt}>
                          {timeAgo(n.createdAt)}
                        </time>
                      </span>
                      {!n.readAt && <span className="notif-dot" aria-label={t('Sin leer')} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {more && (
              <button type="button" className="link-btn notif-more" onClick={() => void loadMore()}>
                {t('Ver anteriores')}
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
