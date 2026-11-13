import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { BodyProvider } from './lib/bodyPref';
import { AccountPage } from './pages/AccountPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { AuthPage } from './pages/AuthPage';
import { CalendarPage } from './pages/CalendarPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { WishlistPage } from './pages/WishlistPage';
import { WishItemPage } from './pages/WishItemPage';
import { SneakersPage } from './pages/SneakersPage';
import { SneakerItemPage } from './pages/SneakerItemPage';
import { HomePage } from './pages/HomePage';
import { MannequinsPage } from './pages/MannequinsPage';
import { OutfitEditorPage } from './pages/OutfitEditorPage';
import { OutfitsPage } from './pages/OutfitsPage';
import { AdminPage } from './pages/AdminPage';
import { ChatPage } from './pages/ChatPage';
import { IdeasPage } from './pages/IdeasPage';
import { MonitorPage } from './pages/MonitorPage';
import { ReleasesPage } from './pages/ReleasesPage';
import { PeoplePage } from './pages/PeoplePage';
import { PublicProfilePage } from './pages/PublicProfilePage';
import { RealtimeProvider } from './lib/realtime';
import { ProfilePage } from './pages/ProfilePage';
import { StylistPage } from './pages/StylistPage';
import { WardrobePage } from './pages/WardrobePage';
import { Spinner } from './components/Spinner';

// El visor 3D completo se carga solo cuando se abre (carga diferida).
const ItemShowcasePage = lazy(() => import('./pages/ItemShowcasePage'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="boot"><Spinner size={26} label="Cargando…" /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <BodyProvider>
        <Routes>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          {/* Vuelta de Google, Apple e Instagram (con o sin sesión) */}
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            element={
              <RequireAuth>
                {/* Conexión en tiempo real (chats, seguidores) mientras hay sesión */}
                <RealtimeProvider>
                  <Layout />
                </RealtimeProvider>
              </RequireAuth>
            }
          >
            <Route index element={<HomePage />} />
            <Route path="armario" element={<WardrobePage />} />
            <Route
              path="items/:id"
              element={
                <Suspense fallback={<div className="boot"><Spinner size={26} label="Cargando visor…" /></div>}>
                  <ItemShowcasePage />
                </Suspense>
              }
            />
            <Route path="outfits" element={<OutfitsPage />} />
            <Route path="outfits/new" element={<OutfitEditorPage key="new" />} />
            <Route path="outfits/:id" element={<OutfitEditorPage />} />
            <Route path="calendario" element={<CalendarPage />} />
            <Route path="analitica" element={<AnalyticsPage />} />
            <Route path="wishlist" element={<WishlistPage />} />
            <Route path="wishlist/:id" element={<WishItemPage />} />
            <Route path="sneakers" element={<SneakersPage />} />
            <Route path="sneakers/:id" element={<SneakerItemPage />} />
            <Route path="estilista" element={<StylistPage />} />
            <Route path="maniquies" element={<MannequinsPage />} />
            <Route path="perfil" element={<ProfilePage />} />
            <Route path="u/:handle" element={<PublicProfilePage />} />
            <Route path="personas" element={<PeoplePage />} />
            <Route path="mensajes" element={<ChatPage />} />
            <Route path="mensajes/:id" element={<ChatPage />} />
            <Route path="ideas" element={<IdeasPage />} />
            <Route path="novedades" element={<ReleasesPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="monitor" element={<MonitorPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BodyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
