import { useState, type FormEvent } from 'react';
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
import { ToastProvider } from './fx/Toast';
import { Logo } from './Logo';

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
  const section = useLocation().pathname.split('/')[1] ?? '';
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
      <aside className="sidebar">
        <div className="sidebar-head">
          <Link to="/" className="sidebar-brand" aria-label="MyOut, inicio">
            <Logo decorative />
          </Link>
          <NotificationBell />
        </div>

        <nav className="nav" aria-label="Principal">
          <NavLink to="/" end className="nav-link">
            Inicio
          </NavLink>
          <NavLink to="/armario" className="nav-link">
            Armario
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
                    placeholder="Nombre del armario"
                    aria-label="Nombre del armario"
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
                  />
                </form>
              ) : (
                <button type="button" className="link-btn" onClick={() => setCreating(true)}>
                  + Nuevo armario
                </button>
              )}
              {createError ? <ErrorNote error={createError} /> : null}
            </li>
          </ul>
          <NavLink to="/outfits" className="nav-link">
            Outfits
          </NavLink>
          <NavLink to="/calendario" className="nav-link">
            Calendario
          </NavLink>
          <NavLink to="/analitica" className="nav-link">
            Analítica
          </NavLink>
          <NavLink to="/sneakers" className="nav-link">
            Sneakers
          </NavLink>
          <NavLink to="/wishlist" className="nav-link">
            Wishlist
          </NavLink>
          <NavLink to="/estilista" className="nav-link">
            Estilista
          </NavLink>
          <NavLink to="/maniquies" className="nav-link">
            Maniquíes
          </NavLink>
          <NavLink to="/mensajes" className="nav-link">
            Mensajes
            {unread > 0 && (
              <span className="badge" aria-label={`${unread} sin leer`}>
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </NavLink>
          <NavLink to="/personas" className="nav-link">
            Personas
            {requests > 0 && (
              <span className="badge" aria-label={`${requests} solicitudes`}>
                {requests}
              </span>
            )}
          </NavLink>
          <NavLink to="/ideas" className="nav-link">
            Ideas
          </NavLink>
          <NavLink to="/novedades" className="nav-link">
            Novedades
          </NavLink>
          <NavLink to="/perfil" className="nav-link">
            Perfil
          </NavLink>
          <NavLink to="/account" className="nav-link">
            Cuenta
          </NavLink>
          {user?.role === 'ADMIN' && (
            <>
              <NavLink to="/admin" className="nav-link nav-admin">
                <Icon name="shield" size={13} /> Admin
              </NavLink>
              <NavLink to="/monitor" className="nav-link nav-admin-sub">
                <Icon name="pulse" size={13} /> Monitor
              </NavLink>
            </>
          )}
        </nav>

        <Link to="/perfil" className="sidebar-user" title="Tu perfil">
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
