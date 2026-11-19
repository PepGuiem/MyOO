import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import { garmentTypesApi, wardrobesApi } from '../api/endpoints';
import type { GarmentType, Wardrobe } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useAssetUrl } from '../lib/assetUrl';
import { useRealtime } from '../lib/realtime';
import { useAsync } from '../lib/useAsync';
import { ViewCanvas } from '../three/ViewCanvas';
import { NotificationBell } from './community/NotificationBell';
import { ErrorNote } from './ErrorNote';
import { Icon } from './Icon';
import { FEATURES } from '../lib/features';
import { ToastProvider } from './fx/Toast';
import { Logo } from './Logo';
import { t } from '../i18n';

export interface AppData {
  wardrobes: Wardrobe[];
  garmentTypes: GarmentType[];
  reloadWardrobes: () => Promise<void>;
}

export function useAppData(): AppData {
  return useOutletContext<AppData>();
}

export function Layout() {
  const { user } = useAuth();
  const { unread, requests } = useRealtime();
  const avatar = useAssetUrl(user?.avatarAssetId);
  const shownName = user?.displayName || (user?.username ? `@${user.username}` : user?.email) || '';
  const [params] = useSearchParams();
  // Cambiar de sección (no de ficha ni de filtro) reproduce la entrada de página.
  const location = useLocation();
  const section = location.pathname.split('/')[1] ?? '';
  // Móvil: el menú es un panel lateral que entra deslizándose.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [menuOpen]);
  const activeWardrobe = params.get('w');

  const wardrobes = useAsync(() => wardrobesApi.list(), []);
  const types = useAsync(() => garmentTypesApi.list(), []);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [createError, setCreateError] = useState<unknown>(null);

  async function createWardrobe(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await wardrobesApi.create({ name: newName.trim() });
      setNewName('');
      setCreating(false);
      setCreateError(null);
      await wardrobes.reload();
    } catch (err) {
      setCreateError(err);
    }
  }

  const data: AppData = {
    wardrobes: wardrobes.data?.data ?? [],
    garmentTypes: types.data ?? [],
    reloadWardrobes: wardrobes.reload,
  };

  return (
    <ToastProvider>
    <div className="shell">
      <aside className={`sidebar${menuOpen ? ' is-open' : ''}`}>
        <div className="sidebar-head">
          <Link to="/" className="sidebar-brand" aria-label={t('MyOO, inicio')}>
            <Logo decorative />
          </Link>
          <NotificationBell />
          <button
            type="button"
            className="menu-toggle"
            aria-label={menuOpen ? t('Cerrar menú') : t('Abrir menú')}
            aria-expanded={menuOpen}
            aria-controls="main-nav"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span aria-hidden="true" />
          </button>
        </div>

        <button type="button" className="nav-scrim" aria-label={t('Cerrar menú')} tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)} />
        <nav id="main-nav" className="nav" aria-label={t('Principal')}>
          <NavLink to="/" end className="nav-link">
            {t('Inicio')}
          </NavLink>
          <NavLink to="/armario" className="nav-link">
            {t('Armario')}
          </NavLink>
          <ul className="wardrobe-list">
            {data.wardrobes.map((w) => (
              <li key={w.id}>
                <Link
                  to={`/armario?w=${w.id}`}
                  className={`wardrobe-link${activeWardrobe === w.id ? ' is-active' : ''}`}
                >
                  <span>{w.name}</span>
                  <span className="count">{w.itemCount}</span>
                </Link>
              </li>
            ))}
            <li>
              {creating ? (
                <form onSubmit={createWardrobe} className="inline-form">
                  <input
                    autoFocus
                    value={newName}
                    maxLength={80}
                    placeholder={t('Nombre del armario')}
                    aria-label={t('Nombre del armario')}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
                  />
                </form>
              ) : (
                <button type="button" className="link-btn" onClick={() => setCreating(true)}>
                  {t('+ Nuevo armario')}
                </button>
              )}
              {createError ? <ErrorNote error={createError} /> : null}
            </li>
          </ul>
          <NavLink to="/outfits" className="nav-link">
            {t('Outfits')}
          </NavLink>
          <NavLink to="/calendario" className="nav-link">
            {t('Calendario')}
          </NavLink>
          <NavLink to="/analitica" className="nav-link">
            {t('Analítica')}
          </NavLink>
          <NavLink to="/sneakers" className="nav-link">
            {t('Sneakers')}
          </NavLink>
          <NavLink to="/wishlist" className="nav-link">
            {t('Wishlist')}
          </NavLink>
          <NavLink to="/batallas" className="nav-link">
            {t('Batallas')}
          </NavLink>
          {FEATURES.market && (
            <NavLink to="/market" className="nav-link">
              {t('Market')}
            </NavLink>
          )}
          <NavLink to="/estilista" className="nav-link">
            {t('Estilista')}
          </NavLink>
          <NavLink to="/maniquies" className="nav-link">
            {t('Maniquíes')}
          </NavLink>
          <NavLink to="/mensajes" className="nav-link">
            {t('Mensajes')}
            {unread > 0 && (
              <span className="badge" aria-label={t('{unread} sin leer', { unread })}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
          <NavLink to="/personas" className="nav-link">
            {t('Personas')}
            {requests > 0 && (
              <span className="badge" aria-label={`${requests} solicitudes`}>
                {requests}
              </span>
            )}
          </NavLink>
          <NavLink to="/ideas" className="nav-link">
            {t('Ideas')}
          </NavLink>
          <NavLink to="/novedades" className="nav-link">
            {t('Novedades')}
          </NavLink>
          <NavLink to="/perfil" className="nav-link">
            {t('Perfil')}
          </NavLink>
          <NavLink to="/account" className="nav-link">
            {t('Cuenta')}
          </NavLink>
          {user?.role === 'ADMIN' && (
            <>
              <NavLink to="/admin" className="nav-link nav-admin">
                <Icon name="shield" size={13} /> {t('Admin')}
              </NavLink>
              <NavLink to="/monitor" className="nav-link nav-admin-sub">
                <Icon name="pulse" size={13} /> {t('Monitor')}
              </NavLink>
            </>
          )}
        </nav>

        <Link to="/perfil" className="sidebar-user" title={t('Tu perfil')}>
          <span className={`avatar avatar-xs${avatar ? ' has-image' : ''}`} aria-hidden="true">
            {avatar ? <img src={avatar} alt="" /> : shownName.replace('@', '').charAt(0).toUpperCase()}
          </span>
          <span className="sidebar-user-name">{shownName}</span>
        </Link>
      </aside>

      <main className="main">
        {wardrobes.error ? <ErrorNote error={wardrobes.error} /> : null}
        <div key={section} className="route-anim">
          <Outlet context={data} />
        </div>
      </main>

      <ViewCanvas />
    </div>
    </ToastProvider>
  );
}
