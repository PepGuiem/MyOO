import { t } from '../i18n';
import { FEATURES } from '../lib/features';
import type { NavGroupId, NavItemId } from '../lib/preferences';
import type { IconName } from './Icon';

/**
 * Entradas del menú que el usuario puede ocultar, fijar arriba o reordenar
 * (por grupos) en «Personalizar». Inicio, Armario y Admin no se tocan.
 * Los `id` se guardan en la cuenta: no renombrarlos.
 */
export interface NavCatalogItem {
  id: NavItemId;
  to: string;
  icon: IconName;
  label: () => string;
  group: NavGroupId;
}

export const NAV_CATALOG: NavCatalogItem[] = [
  { id: 'outfits', to: '/outfits', icon: 'layers', label: () => t('Outfits'), group: 'style' },
  { id: 'calendar', to: '/calendario', icon: 'calendar', label: () => t('Calendario'), group: 'style' },
  { id: 'stylist', to: '/estilista', icon: 'sparkles', label: () => t('Estilista'), group: 'style' },
  { id: 'mannequins', to: '/maniquies', icon: 'userCheck', label: () => t('Maniquíes'), group: 'style' },
  { id: 'sneakers', to: '/sneakers', icon: 'shoe', label: () => t('Sneakers'), group: 'collection' },
  { id: 'wishlist', to: '/wishlist', icon: 'heart', label: () => t('Wishlist'), group: 'collection' },
  { id: 'analytics', to: '/analitica', icon: 'trendUp', label: () => t('Analítica'), group: 'collection' },
  { id: 'messages', to: '/mensajes', icon: 'chat', label: () => t('Mensajes'), group: 'community' },
  { id: 'people', to: '/personas', icon: 'users', label: () => t('Personas'), group: 'community' },
  { id: 'battles', to: '/batallas', icon: 'bolt', label: () => t('Batallas'), group: 'community' },
  { id: 'market', to: '/market', icon: 'store', label: () => t('Market'), group: 'community' },
  { id: 'ideas', to: '/ideas', icon: 'bulb', label: () => t('Ideas'), group: 'community' },
  { id: 'news', to: '/novedades', icon: 'megaphone', label: () => t('Novedades'), group: 'community' },
];

export const NAV_GROUP_META: Record<NavGroupId, { label: () => string; icon: IconName }> = {
  style: { label: () => t('Estilo'), icon: 'sparkles' },
  collection: { label: () => t('Colección'), icon: 'gem' },
  community: { label: () => t('Comunidad'), icon: 'users' },
};

/** Entradas que existen ahora (el Market está apagado hasta su lanzamiento). */
export function availableNavItems(): NavCatalogItem[] {
  return NAV_CATALOG.filter((i) => i.id !== 'market' || FEATURES.market);
}
