import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { PreferencesProvider } from './lib/preferences';
import { BrandFavicon } from './components/Logo';
import { GlobalFx } from './components/fx/GlobalFx';
import { NeonScene } from './components/fx/NeonScene';
import { Layout } from './components/Layout';
import { BodyProvider } from './lib/bodyPref';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { AuthPage } from './pages/AuthPage';
import { FEATURES } from './lib/features';
import { HomePage } from './pages/HomePage';
import { RealtimeProvider } from './lib/realtime';
import { Spinner } from './components/Spinner';
import { t } from './i18n';

// Carga diferida: cada página (y el visor 3D) se descarga la primera vez que
// se abre, así la web arranca con mucho menos código. Inicio, acceso y la
// vuelta del login van en el paquete principal.
const ItemShowcasePage = lazy(() => import('./pages/ItemShowcasePage'));
const PersonalizePage = lazy(() => import('./pages/PersonalizePage').then((m) => ({ default: m.PersonalizePage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })));
const CalendarPage = lazy(() => import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })));
const WishlistPage = lazy(() => import('./pages/WishlistPage').then((m) => ({ default: m.WishlistPage })));
const WishItemPage = lazy(() => import('./pages/WishItemPage').then((m) => ({ default: m.WishItemPage })));
const SneakersPage = lazy(() => import('./pages/SneakersPage').then((m) => ({ default: m.SneakersPage })));
const SneakerItemPage = lazy(() => import('./pages/SneakerItemPage').then((m) => ({ default: m.SneakerItemPage })));
const BattlesPage = lazy(() => import('./pages/BattlesPage').then((m) => ({ default: m.BattlesPage })));
const BattlePage = lazy(() => import('./pages/BattlePage').then((m) => ({ default: m.BattlePage })));
const MarketPage = lazy(() => import('./pages/MarketPage').then((m) => ({ default: m.MarketPage })));
const ListingPage = lazy(() => import('./pages/ListingPage').then((m) => ({ default: m.ListingPage })));
const MannequinsPage = lazy(() => import('./pages/MannequinsPage').then((m) => ({ default: m.MannequinsPage })));
const OutfitEditorPage = lazy(() => import('./pages/OutfitEditorPage').then((m) => ({ default: m.OutfitEditorPage })));
const OutfitsPage = lazy(() => import('./pages/OutfitsPage').then((m) => ({ default: m.OutfitsPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })));
const IdeasPage = lazy(() => import('./pages/IdeasPage').then((m) => ({ default: m.IdeasPage })));
const MonitorPage = lazy(() => import('./pages/MonitorPage').then((m) => ({ default: m.MonitorPage })));
const ReleasesPage = lazy(() => import('./pages/ReleasesPage').then((m) => ({ default: m.ReleasesPage })));
const PeoplePage = lazy(() => import('./pages/PeoplePage').then((m) => ({ default: m.PeoplePage })));
const PublicProfilePage = lazy(() => import('./pages/PublicProfilePage').then((m) => ({ default: m.PublicProfilePage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const StylistPage = lazy(() => import('./pages/StylistPage').then((m) => ({ default: m.StylistPage })));
const WardrobePage = lazy(() => import('./pages/WardrobePage').then((m) => ({ default: m.WardrobePage })));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="boot"><Spinner size={26} label={t('Cargando…')} /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export function App() {
  return (
    <BrowserRouter>
      {/* Fondo de neón y efectos globales: una sola vez para toda la app */}
      <NeonScene />
      <GlobalFx />
      <BrandFavicon />
      <AuthProvider>
        <PreferencesProvider>
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
                <Suspense fallback={<div className="boot"><Spinner size={26} label={t('Cargando visor…')} /></div>}>
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
            <Route path="batallas" element={<BattlesPage />} />
            <Route path="batallas/:id" element={<BattlePage />} />
            {/* STREET MARKET: apagado hasta su lanzamiento (ver lib/features.ts). */}
            <Route path="market" element={FEATURES.market ? <MarketPage /> : <Navigate to="/novedades#proximamente" replace />} />
            <Route path="market/:id" element={FEATURES.market ? <ListingPage /> : <Navigate to="/novedades#proximamente" replace />} />
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
            <Route path="personalizar" element={<PersonalizePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BodyProvider>
        </PreferencesProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
