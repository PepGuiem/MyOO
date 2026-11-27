import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, apiBaseUrl } from '../api/client';
import { chatApi, notificationsApi, peopleApi, realtimeApi } from '../api/endpoints';
import type { RealtimeEvent, RealtimeToken } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ablySseUrl, parseAblyEvent } from './ablyEvents';

type Listener = (event: RealtimeEvent) => void;
export type RealtimeStatus = 'off' | 'connecting' | 'online';

interface RealtimeState {
  status: RealtimeStatus;
  /** Escucha los eventos en tiempo real. Devuelve la función para dejar de escuchar. */
  subscribe: (listener: Listener) => () => void;
  /** Manda un mensaje pequeño al servidor (p. ej. "estoy escribiendo"; solo con WebSocket). */
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

/** Con la pestaña oculta este rato se cierra la conexión de Ably (se reabre al volver). */
const HIDDEN_CLOSE_MS = 5 * 60_000;
/** El token de Ably se renueva 2 minutos antes de caducar. */
const RENEW_BEFORE_MS = 2 * 60_000;

/** URL del WebSocket a partir de la de la API (`/api` → ws://<esta web>/api/ws). */
function socketUrl(ticket: string): string {
  const base = apiBaseUrl();
  const http = /^https?:\/\//.test(base) ? base : `${window.location.origin}${base}`;
  return `${http.replace(/^http/, 'ws')}/ws?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * Conexión en tiempo real (una por pestaña, mientras hay sesión):
 * - Con Ably en el servidor (`POST /realtime/token` da un token): escucha tu
 *   canal de Ably por SSE. Solo llegan el tipo y los ids; el contenido se
 *   pide a la API.
 * - Sin Ably: pide un ticket de un solo uso y abre el WebSocket.
 * Si se corta, vuelve a conectar esperando cada vez un poco más (1 s, 2 s,
 * 4 s… hasta 30 s). Mientras no hay conexión, las páginas consultan cada poco.
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
    /** 'ws': el WebSocket de siempre (sin Ably). 'ably': SSE de Ably. */
    let mode: 'ws' | 'ably' | null = null;

    const backoff = () => Math.min(30_000, 1000 * 2 ** attempt++) + Math.random() * 400;

    /** Lo común a los dos sistemas: contadores y avisar a quien escucha. */
    const deliver = (event: RealtimeEvent) => {
      if (event.type === 'ready') {
        attempt = 0;
        setStatus('online');
        // Lo que pasó mientras no había conexión se recupera pidiéndolo.
        refreshUnread();
        refreshRequests();
        refreshNotifications();
      }
      if (event.type === 'message' || event.type === 'message_ref' || event.type === 'read' || event.type === 'message_deleted') refreshUnread();
      if (event.type === 'follow_request') refreshRequests();
      if (event.type === 'notification') {
        // Por Ably no llega el aviso entero: se pide el número real.
        if (mode === 'ably') refreshNotifications();
        else setNotifications((n) => n + 1);
      }
      for (const l of listeners.current) l(event);
    };

    // --- WebSocket (sin Ably: como siempre) ------------------------------------

    const scheduleWs = () => {
      if (stopped) return;
      timer = window.setTimeout(() => void connectWs(), backoff());
    };

    const connectWs = async () => {
      if (stopped) return;
      setStatus('connecting');
      let ticket: string;
      try {
        ticket = (await realtimeApi.ticket()).ticket;
      } catch {
        setStatus('off');
        scheduleWs();
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
        deliver(event);
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
        if (!stopped && ev.code !== 4003) scheduleWs();
      };
    };

    // --- Ably (con ABLY_API_KEY en el backend) ---------------------------------
    // EventSource a Ably con un token que solo deja escuchar tu canal. El
    // token se renueva antes de caducar (se abre la conexión nueva y luego se
    // cierra la vieja) y, si se corta, se reconecta esperando cada vez más.

    let current: EventSource | null = null;
    let pending: EventSource | null = null;
    let renewTimer: number | undefined;
    let hiddenTimer: number | undefined;
    /** Cerrada por llevar la pestaña oculta mucho rato. */
    let sleeping = false;

    const closeAbly = () => {
      window.clearTimeout(renewTimer);
      current?.close();
      pending?.close();
      current = null;
      pending = null;
    };

    const ablyFailed = () => {
      if (stopped || sleeping) return;
      window.clearTimeout(renewTimer);
      if (current) {
        // La conexión anterior sigue viva: se vuelve a intentar renovar en 30 s.
        renewTimer = window.setTimeout(() => void openAbly(), 30_000);
        return;
      }
      setStatus('off');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void openAbly(), backoff());
    };

    const openAbly = async (given?: RealtimeToken) => {
      if (stopped || sleeping) return;
      if (!current) setStatus('connecting');
      let tok = given;
      if (!tok) {
        try {
          tok = await realtimeApi.token();
        } catch {
          ablyFailed();
          return;
        }
      }
      if (stopped || sleeping) return;
      if (!tok.enabled) {
        // Ya no hay Ably en el servidor: vuelve al sistema de siempre.
        closeAbly();
        mode = 'ws';
        attempt = 0;
        void connectWs();
        return;
      }
      pending?.close();
      const source = new EventSource(ablySseUrl(tok.channel, tok.token));
      pending = source;
      source.onopen = () => {
        if (source !== pending) return;
        pending = null;
        const wasOnline = current !== null;
        current?.close();
        current = source;
        attempt = 0;
        if (!wasOnline) deliver({ type: 'ready' });
      };
      source.onmessage = (ev) => {
        const event = parseAblyEvent(String(ev.data));
        if (event) deliver(event);
      };
      // Corte de red, token caducado o rechazado: se cierra y se gestiona aquí
      // (el EventSource reintentaría solo con el token viejo).
      source.onerror = () => {
        source.close();
        if (source === pending) pending = null;
        else if (source === current) current = null;
        else return;
        ablyFailed();
      };
      window.clearTimeout(renewTimer);
      renewTimer = window.setTimeout(() => void openAbly(), Math.max(30_000, tok.expiresIn * 1000 - RENEW_BEFORE_MS));
    };

    const start = async () => {
      setStatus('connecting');
      let tok: RealtimeToken;
      try {
        tok = await realtimeApi.token();
      } catch (err) {
        // 4xx (p. ej. un backend sin esta ruta): el sistema de siempre. Un
        // fallo del servidor o de red: se reintenta (si resulta que no hay
        // Ably, `openAbly` vuelve al WebSocket).
        tok = { enabled: false };
        if (!(err instanceof ApiError) || err.status === 0 || err.status >= 500) {
          if (stopped) return;
          mode = 'ably';
          ablyFailed();
          return;
        }
      }
      if (stopped) return;
      if (tok.enabled) {
        mode = 'ably';
        if (document.visibilityState === 'hidden') onVisibility();
        void openAbly(tok);
      } else {
        mode = 'ws';
        void connectWs();
      }
    };

    void start();
    refreshUnread();
    refreshRequests();
    refreshNotifications();

    function onVisibility() {
      if (stopped) return;
      const visible = document.visibilityState === 'visible';
      if (mode === 'ws') {
        // Al volver a la pestaña, si se había cortado, se reconecta ya.
        if (visible && !socket.current) {
          window.clearTimeout(timer);
          attempt = 0;
          void connectWs();
        }
        return;
      }
      if (mode !== 'ably') return;
      window.clearTimeout(hiddenTimer);
      if (!visible) {
        // Oculta unos minutos: se cierra (no gasta conexiones de Ably).
        hiddenTimer = window.setTimeout(() => {
          sleeping = true;
          window.clearTimeout(timer);
          closeAbly();
          setStatus('off');
        }, HIDDEN_CLOSE_MS);
        return;
      }
      if (sleeping || (!current && !pending)) {
        sleeping = false;
        attempt = 0;
        window.clearTimeout(timer);
        void openAbly();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(hiddenTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      socket.current?.close(1000);
      socket.current = null;
      closeAbly();
      setStatus('off');
    };
  }, [userId, refreshUnread, refreshRequests, refreshNotifications, refreshUser]);

  // Sin conexión en tiempo real (en Vercel no hay WebSocket y Ably es
  // opcional), los contadores de mensajes, solicitudes y avisos se
  // actualizan cada 30 s.
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
