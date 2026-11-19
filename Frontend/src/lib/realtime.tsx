import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiBaseUrl } from '../api/client';
import { chatApi, notificationsApi, peopleApi, realtimeApi } from '../api/endpoints';
import type { RealtimeEvent } from '../api/types';
import { useAuth } from '../auth/AuthContext';

type Listener = (event: RealtimeEvent) => void;
export type RealtimeStatus = 'off' | 'connecting' | 'online';

interface RealtimeState {
  status: RealtimeStatus;
  /** Escucha los eventos del WebSocket. Devuelve la función para dejar de escuchar. */
  subscribe: (listener: Listener) => () => void;
  /** Manda un mensaje pequeño al servidor (p. ej. "estoy escribiendo"). */
  send: (payload: Record<string, unknown>) => void;
  /** Mensajes sin leer en total y solicitudes para seguirte. */
  unread: number;
  requests: number;
  /** Avisos de la campanita sin leer. */
  notifications: number;
  refreshUnread: () => void;
  refreshRequests: () => void;
  refreshNotifications: () => void;
  setNotifications: (n: number) => void;
}

const RealtimeContext = createContext<RealtimeState | null>(null);

/** URL del WebSocket a partir de la de la API (`/api` → ws://<esta web>/api/ws). */
function socketUrl(ticket: string): string {
  const base = apiBaseUrl();
  const http = /^https?:\/\//.test(base) ? base : `${window.location.origin}${base}`;
  return `${http.replace(/^http/, 'ws')}/ws?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * Conexión en tiempo real (una por pestaña, mientras hay sesión):
 * pide un ticket de un solo uso, abre el WebSocket y, si se corta, vuelve a
 * conectar esperando cada vez un poco más (1 s, 2 s, 4 s… hasta 30 s).
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, refreshUser } = useAuth();
  const userId = user?.id ?? null;
  const listeners = useRef(new Set<Listener>());
  const socket = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>('off');
  const [unread, setUnread] = useState(0);
  const [requests, setRequests] = useState(0);
  const [notifications, setNotifications] = useState(0);
  const unreadTimer = useRef<number | undefined>(undefined);

  const refreshUnread = useCallback(() => {
    window.clearTimeout(unreadTimer.current);
    unreadTimer.current = window.setTimeout(() => {
      chatApi
        .unread()
        .then((r) => setUnread(r.unread))
        .catch(() => undefined);
    }, 250);
  }, []);

  const refreshRequests = useCallback(() => {
    peopleApi
      .requests()
      .then((r) => setRequests(r.length))
      .catch(() => undefined);
  }, []);

  const refreshNotifications = useCallback(() => {
    notificationsApi
      .unread()
      .then((r) => setNotifications(r.unread))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let attempt = 0;
    let timer: number | undefined;

    const schedule = () => {
      if (stopped) return;
      const delay = Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 400;
      timer = window.setTimeout(() => void connect(), delay);
    };

    const connect = async () => {
      if (stopped) return;
      setStatus('connecting');
      let ticket: string;
      try {
        ticket = (await realtimeApi.ticket()).ticket;
      } catch {
        setStatus('off');
        schedule();
        return;
      }
      if (stopped) return;
      const ws = new WebSocket(socketUrl(ticket));
      socket.current = ws;
      ws.onmessage = (ev) => {
        let event: RealtimeEvent;
        try {
          event = JSON.parse(String(ev.data)) as RealtimeEvent;
        } catch {
          return;
        }
        if (event.type === 'ready') {
          attempt = 0;
          setStatus('online');
          // Lo que pasó mientras no había conexión se recupera pidiéndolo.
          refreshUnread();
          refreshRequests();
          refreshNotifications();
        }
        if (event.type === 'message' || event.type === 'read' || event.type === 'message_deleted') refreshUnread();
        if (event.type === 'follow_request') refreshRequests();
        if (event.type === 'notification') setNotifications((n) => n + 1);
        for (const l of listeners.current) l(event);
      };
      ws.onclose = (ev) => {
        if (socket.current === ws) socket.current = null;
        setStatus('off');
        // 4004: cuenta suspendida → al pedir el perfil llega el 403 y se
        // cierra la sesión con el motivo. 4003: cuenta borrada. 1000: al salir.
        if (ev.code === 4004) {
          void refreshUser().catch(() => undefined);
          return;
        }
        if (!stopped && ev.code !== 4003) schedule();
      };
    };

    void connect();
    refreshUnread();
    refreshRequests();
    refreshNotifications();
    // Al volver a la pestaña, si se había cortado, se reconecta ya.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !socket.current && !stopped) {
        window.clearTimeout(timer);
        attempt = 0;
        void connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      socket.current?.close(1000);
      socket.current = null;
      setStatus('off');
    };
  }, [userId, refreshUnread, refreshRequests, refreshNotifications, refreshUser]);

  // Sin conexión en tiempo real (en Vercel no hay WebSocket), los contadores
  // de mensajes, solicitudes y avisos se actualizan cada 30 s.
  useEffect(() => {
    if (!userId || status === 'online') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      refreshUnread();
      refreshRequests();
      refreshNotifications();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [userId, status, refreshUnread, refreshRequests, refreshNotifications]);

  const value = useMemo<RealtimeState>(
    () => ({
      status,
      unread,
      requests,
      notifications,
      refreshUnread,
      refreshRequests,
      refreshNotifications,
      setNotifications,
      subscribe: (l) => {
        listeners.current.add(l);
        return () => listeners.current.delete(l);
      },
      send: (payload) => {
        const ws = socket.current;
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
      },
    }),
    [status, unread, requests, notifications, refreshUnread, refreshRequests, refreshNotifications],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): RealtimeState {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error('useRealtime must be used inside <RealtimeProvider>');
  return ctx;
}

/** Ejecuta `handler` con cada evento (siempre la última versión del handler). */
export function useRealtimeEvent(handler: (event: RealtimeEvent) => void): void {
  const { subscribe } = useRealtime();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}
