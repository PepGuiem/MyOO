import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, setBannedHandler, setUnauthorizedHandler, tokenStore, type BanInfo } from '../api/client';
import { authApi, usersApi } from '../api/endpoints';
import type { AuthResponse, User } from '../api/types';
import { locale, syncLocale, toAccountLocale } from '../i18n';

interface AuthState {
  user: User | null;
  /** true mientras comprobamos un token guardado al cargar la página. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
  /** Guarda la sesión que devuelve el backend (p. ej. tras entrar con Google). */
  completeAuth: (res: AuthResponse) => void;
  /** Vuelve a pedir el perfil (tras conectar una cuenta, cambiar la foto...). */
  refreshUser: () => Promise<User | null>;
  /** La sesión se cerró porque un admin suspendió la cuenta (se enseña al entrar). */
  banned: BanInfo | null;
  clearBanned: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => tokenStore.get() !== null);
  const [banned, setBanned] = useState<BanInfo | null>(null);

  /** Olvida la sesión en este navegador (sin llamar al servidor). */
  const clearSession = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  /**
   * Cerrar sesión: el servidor invalida el token (en todos los dispositivos de
   * la cuenta) y aquí se olvida. Si la llamada falla, la sesión se cierra igual.
   */
  const logout = useCallback(() => {
    if (tokenStore.get()) authApi.logout().catch(() => undefined);
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    // Cuenta suspendida: fuera de la sesión y, en la pantalla de acceso, el motivo.
    setBannedHandler((info) => {
      setBanned(info);
      clearSession();
    });
    return () => {
      setUnauthorizedHandler(null);
      setBannedHandler(null);
    };
  }, [clearSession]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    let cancelled = false;
    // Al abrir la web se renueva el token (vuelve a durar el plazo completo),
    // así quien entra a menudo no tiene que iniciar sesión otra vez. Solo un
    // 401/403 cierra la sesión: si el servidor aún arranca (justo después de
    // un despliegue) o falla la red, se reintenta y el token NO se borra.
    const restore = async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          let u: User;
          try {
            const res = await authApi.renew();
            if (cancelled) return;
            tokenStore.set(res.accessToken);
            u = res.user;
          } catch (err) {
            // Backend anterior sin /auth/renew: basta con el perfil.
            if (!(err instanceof ApiError && err.status === 404)) throw err;
            u = await usersApi.me();
          }
          if (cancelled) return;
          // El idioma de la cuenta manda (si difiere, la página se recarga en ese idioma).
          syncLocale(u.locale);
          setUser(u);
          return;
        } catch (err) {
          if (cancelled) return;
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            clearSession();
            return;
          }
          if (attempt >= 3) return;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    };
    void restore().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  // Con la web abierta mucho tiempo, renueva también cada 12 h.
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const timer = window.setInterval(() => {
      authApi
        .renew()
        .then((res) => tokenStore.set(res.accessToken))
        .catch(() => undefined);
    }, 12 * 60 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [userId]);

  const handleAuth = useCallback((res: AuthResponse) => {
    tokenStore.set(res.accessToken);
    setBanned(null);
    syncLocale(res.user.locale);
    setUser(res.user);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!tokenStore.get()) return null;
    const me = await usersApi.me();
    setUser(me);
    return me;
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      login: async (email, password) => handleAuth(await authApi.login({ email, password })),
      register: async (email, password, displayName) =>
        handleAuth(await authApi.register({ email, password, displayName: displayName || undefined, locale: toAccountLocale(locale) })),
      logout,
      setUser,
      completeAuth: handleAuth,
      refreshUser,
      banned,
      clearBanned: () => setBanned(null),
    }),
    [user, loading, handleAuth, logout, refreshUser, banned],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
