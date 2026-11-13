import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setBannedHandler, setUnauthorizedHandler, tokenStore, type BanInfo } from '../api/client';
import { authApi, usersApi } from '../api/endpoints';
import type { AuthResponse, User } from '../api/types';

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

  const logout = useCallback(() => {
    // Con JWT el "logout" consiste en olvidar el token en el cliente.
    tokenStore.set(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    // Cuenta suspendida: fuera de la sesión y, en la pantalla de acceso, el motivo.
    setBannedHandler((info) => {
      setBanned(info);
      logout();
    });
    return () => {
      setUnauthorizedHandler(null);
      setBannedHandler(null);
    };
  }, [logout]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    usersApi
      .me()
      .then(setUser)
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const handleAuth = useCallback((res: AuthResponse) => {
    tokenStore.set(res.accessToken);
    setBanned(null);
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
        handleAuth(await authApi.register({ email, password, displayName: displayName || undefined })),
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
