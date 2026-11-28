import { lazy, Suspense, useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import { garmentTypesApi, wardrobesApi } from '../api/endpoints';
import type { GarmentType, Wardrobe } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useAssetUrl } from '../lib/assetUrl';
import { useRealtime } from '../lib/realtime';
import { useAsync } from '../lib/useAsync';
import { loadViewCanvas, preload3dWhenIdle } from '../lib/preload3d';
import { subscribeViews, views } from '../three/viewStore';
import { NotificationBell } from './community/NotificationBell';
import { ErrorNote } from './ErrorNote';
import { Icon, type IconName } from './Icon';
import { LegalLinks } from './LegalLinks';
import { availableNavItems, NAV_GROUP_META, type NavCatalogItem } from './navCatalog';
import { usePreferences, type NavGroupId, type NavItemId } from '../lib/preferences';
import { ToastProvider } from './fx/Toast';
import { DemoImportOffer } from './demo/DemoImportOffer';
import { InstallAppCard } from './pwa/InstallApp';
import { Logo } from './Logo';
import { Spinner } from './Spinner';
import { t } from '../i18n';

// El canvas compartido de las miniaturas 3D usa three.js: se descarga aparte
// (lib/preload3d.ts) y no retrasa el arranque del menú.
const ViewCanvas = lazy(() => loadViewCanvas().then((m) => ({ default: m.ViewCanvas })));

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

  // Canvas 3D compartido: se monta en cuanto la página tiene su primera
  // miniatura y ya se queda (cambiar de página no lo vuelve a crear).
  const hasViews = useSyncExternalStore(subscribeViews, () => views.size > 0);
  const [canvasOn, setCanvasOn] = useState(hasViews);
  if (hasViews && !canvasOn) setCanvasOn(true);
  // En las páginas sin 3D, el motor 3D se precarga en un rato libre.
  useEffect(() => preload3dWhenIdle(), []);

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

  // Menú agrupado: cada grupo se pliega; el de la página actual se abre solo
  // y lo que abres o cierras se recuerda en este navegador.
  // Menú según «Personalizar»: entradas ocultas fuera, las fijadas arriba y
  // los grupos en el orden elegido. Admin siempre al final (solo admins).
  const { prefs } = usePreferences();
  const menu = prefs.menu;
  const badges: Partial<Record<NavItemId, { badge: number; badgeLabel: string }>> = {
    messages: { badge: unread, badgeLabel: t('{unread} sin leer', { unread }) },
    people: { badge: requests, badgeLabel: t('{n} solicitudes', { n: requests }) },
  };
  const toItem = (i: NavCatalogItem): NavItemDef => ({ to: i.to, icon: i.icon, label: i.label(), ...badges[i.id] });
  const visible = availableNavItems().filter((i) => !menu.hidden.includes(i.id));
  const pinned = menu.pinned
    .map((id) => visible.find((i) => i.id === id))
    .filter((i): i is NavCatalogItem => !!i)
    .map(toItem);
  const groups: NavGroupDef[] = [
    ...menu.groupOrder
      .map((g) => ({
        id: LEGACY_GROUP_ID[g],
        label: NAV_GROUP_META[g].label(),
        icon: NAV_GROUP_META[g].icon,
        items: visible.filter((i) => i.group === g && !menu.pinned.includes(i.id)).map(toItem),
      }))
      .filter((g) => g.items.length > 0),
    ...(user?.role === 'ADMIN'
      ? [
          {
            id: 'admin',
            label: t('Admin'),
            icon: 'shield' as IconName,
            items: [
              { to: '/admin', icon: 'shield' as IconName, label: t('Panel') },
              { to: '/monitor', icon: 'pulse' as IconName, label: t('Monitor') },
            ],
          },
        ]
      : []),
  ];
  const compact = menu.compact;
  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(`${to}/`);
  const [open, setOpen] = useState<Record<string, boolean>>(() => readOpenGroups());
  const toggle = (id: string) =>
    setOpen((cur) => {
      const next = { ...cur, [id]: !cur[id] };
      saveOpenGroups(next);
      return next;
    });
  // Al llegar a una página, su grupo se abre (sin cerrar los demás).
  const activeGroup = section === 'armario' ? 'armario' : groups.find((g) => g.items.some((i) => isActive(i.to)))?.id;
  useEffect(() => {
    if (!activeGroup) return;
    setOpen((cur) => (cur[activeGroup] ? cur : { ...cur, [activeGroup]: true }));
  }, [activeGroup]);

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
        <nav id="main-nav" className={`nav nx${compact ? ' is-compact' : ''}`} aria-label={t('Principal')}>
          <NavItem to="/" end icon="home" label={t('Inicio')} />

          <div className={`nx-row${open.armario ? ' is-open' : ''}`}>
            <NavItem to="/armario" icon="wardrobe" label={t('Armario')} />
            <button
              type="button"
              className="nx-caret"
              aria-expanded={!!open.armario}
              aria-controls="nx-wardrobes"
              aria-label={open.armario ? t('Ocultar armarios') : t('Ver armarios')}
              onClick={() => toggle('armario')}
            >
              <Icon name="down" size={14} />
            </button>
          </div>
          <div id="nx-wardrobes" className={`nx-fold${open.armario ? ' is-open' : ''}`} inert={!open.armario}>
            <ul className="wardrobe-list nx-wardrobes">
              {data.wardrobes.map((w) => (
                <li key={w.id}>
                  <Link to={`/armario?w=${w.id}`} className={`wardrobe-link${activeWardrobe === w.id ? ' is-active' : ''}`}>
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
          </div>

          {pinned.length > 0 && (
            <ul className="nx-list nx-pinned" aria-label={t('Fijadas')}>
              {pinned.map((i) => (
                <li key={i.to}>
                  <NavItem {...i} />
                </li>
              ))}
            </ul>
          )}

          {groups.map((g) => {
            const isOpen = compact || !!open[g.id];
            const pending = g.items.reduce((n, i) => n + (i.badge ?? 0), 0);
            return (
              <section key={g.id} className={`nx-group${isOpen ? ' is-open' : ''}${g.id === 'admin' ? ' nx-admin' : ''}`}>
                <button
                  type="button"
                  className={`nx-head${g.items.some((i) => isActive(i.to)) ? ' has-active' : ''}`}
                  aria-expanded={isOpen}
                  aria-controls={`nx-${g.id}`}
                  onClick={() => toggle(g.id)}
                >
                  <Icon name={g.icon} size={14} />
                  <span className="nx-head-label">{g.label}</span>
                  {!isOpen && pending > 0 && (
                    <span className="badge" aria-label={t('{n} pendientes', { n: pending })}>
                      {pending > 99 ? '99+' : pending}
                    </span>
                  )}
                  <Icon name="down" size={13} className="nx-chevron" />
                </button>
                <div id={`nx-${g.id}`} className={`nx-fold${isOpen ? ' is-open' : ''}`} inert={!isOpen}>
                  <ul className="nx-list">
                    {g.items.map((i) => (
                      <li key={i.to}>
                        <NavItem {...i} />
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}

          {/* Web instalable: se puede cerrar y no vuelve en un tiempo */}
          <InstallAppCard />

          {/* Tú: perfil y cuenta, siempre a mano al final */}
          <div className="nx-me">
            <NavLink to="/perfil" className="nx-me-link" title={t('Tu perfil')}>
              <span className={`avatar avatar-xs${avatar ? ' has-image' : ''}`} aria-hidden="true">
                {avatar ? <img src={avatar} alt="" /> : shownName.replace('@', '').charAt(0).toUpperCase()}
              </span>
              <span className="nx-me-text">
                <span className="nx-me-name">{shownName}</span>
                <span className="nx-me-sub">{t('Tu perfil')}</span>
              </span>
            </NavLink>
            <NavLink to="/personalizar" className="nx-me-account" title={t('Personalizar')} aria-label={t('Personalizar')}>
              <Icon name="palette" size={16} />
            </NavLink>
            <NavLink to="/account" className="nx-me-account" title={t('Cuenta')} aria-label={t('Cuenta')}>
              <Icon name="key" size={16} />
            </NavLink>
          </div>
          <LegalLinks className="legal-links-nav" />
        </nav>
      </aside>

      <main className="main">
        {wardrobes.error ? <ErrorNote error={wardrobes.error} /> : null}
        <div key={section} className="route-anim">
          <Suspense fallback={<div className="boot"><Spinner size={26} label={t('Cargando…')} /></div>}>
            <Outlet context={data} />
          </Suspense>
        </div>
      </main>

      {canvasOn ? (
        <Suspense fallback={null}>
          <ViewCanvas />
        </Suspense>
      ) : null}
    </div>
    {/* Outfit montado en /demo antes de tener cuenta: se ofrece crearlo */}
    <DemoImportOffer onWardrobesChanged={wardrobes.reload} />
    </ToastProvider>
  );
}

interface NavItemDef {
  to: string;
  icon: IconName;
  label: string;
  end?: boolean;
  badge?: number;
  badgeLabel?: string;
}

interface NavGroupDef {
  id: string;
  label: string;
  icon: IconName;
  items: NavItemDef[];
}

/** Enlace del menú: icono + texto + aviso (mensajes sin leer, solicitudes...). */
function NavItem({ to, icon, label, end, badge, badgeLabel }: NavItemDef) {
  return (
    <NavLink to={to} end={end} className="nav-link nx-link" title={label}>
      <Icon name={icon} size={15} />
      <span className="nx-label">{label}</span>
      {!!badge && badge > 0 && (
        <span className="badge" aria-label={badgeLabel}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

const OPEN_KEY = 'myout.nav.open';

/** Ids de grupo que ya se guardaban abiertos/cerrados en este navegador. */
const LEGACY_GROUP_ID: Record<NavGroupId, string> = { style: 'estilo', collection: 'coleccion', community: 'comunidad' };

function readOpenGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveOpenGroups(value: Record<string, boolean>): void {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(value));
  } catch {
    // sin almacenamiento (modo privado): no se recuerda, sin más
  }
}
