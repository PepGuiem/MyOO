import type { Preferences } from '../lib/preferences';
import { api, apiBaseUrl, fetchBlob, uploadFile } from './client';
import type {
  AccountLocale,
  Battle,
  BattleSide,
  BattleSummary,
  BattleTab,
  Leaderboard,
  Listing,
  ListingInput,
  MarketQuery,
  MarketSummary,
  Asset,
  Mannequin,
  MannequinInput,
  AuthResponse,
  GarmentCategory,
  InstagramOverview,
  OAuthLoginResponse,
  OAuthProviders,
  OAuthUserExchange,
  ProfileInput,
  ProviderSlug,
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  PersonResult,
  PublicProfile,
  SharedOutfit,
  UserBrief,
  GarmentType,
  MyPlan,
  Outfit,
  OutfitInput,
  OutfitListQuery,
  OutfitSummary,
  OutfitRatingState,
  CalendarEntry,
  StyleAnalytics,
  CalendarEntryInput,
  WishlistCategory,
  WishlistInput,
  WishlistItem,
  WishlistPrice,
  WishlistSort,
  WishlistStatus,
  WishlistSummary,
  Sneaker,
  SneakerInput,
  SneakerScope,
  SneakerStats,
  CalendarInsights,
  CalendarSuggestion,
  RatingComparison,
  RatingEntry,
  RatingResult,
  Paginated,
  Plan,
  StylistAlternatives,
  StylistContext,
  StylistInsights,
  StylistResult,
  StylistSignal,
  Subscription,
  User,
  AdminAction,
  AdminReport,
  MonitorActivity,
  MonitorDatabase,
  MonitorFeedItem,
  MonitorLive,
  MonitorRange,
  AdminStats,
  AdminUser,
  AdminUserDetail,
  AppNotification,
  Idea,
  IdeaAdminInput,
  IdeaCategory,
  IdeaInput,
  IdeaSort,
  IdeaStatus,
  Release,
  ReleaseInput,
  ReportReason,
  ReportStatus,
  ReportTarget,
  Wardrobe,
  WardrobeItem,
  WardrobeItemInput,
  ColorGroup,
  ItemSort,
  Season,
  WardrobeFacets,
} from './types';

export const authApi = {
  register: (body: { email: string; password: string; displayName?: string; locale?: AccountLocale }) =>
    api<AuthResponse>('POST', '/auth/register', { body }),
  login: (body: { email: string; password: string }) =>
    api<AuthResponse>('POST', '/auth/login', { body }),
  /** Con sesión: devuelve un token nuevo con la caducidad completa. */
  renew: () => api<AuthResponse>('POST', '/auth/renew'),
  /** Cierra la sesión en el servidor: el token deja de valer en todos los dispositivos. */
  logout: () => api<void>('POST', '/auth/logout'),
};

/** Login con Google/Apple y cuentas conectadas (el backend habla con el proveedor). */
export const oauthApi = {
  providers: () => api<OAuthProviders>('GET', '/auth/oauth/providers'),
  /** URL a la que se navega para entrar con un proveedor (no es una llamada fetch). */
  loginUrl: (provider: ProviderSlug) => `${apiBaseUrl()}/auth/oauth/${provider}/start`,
  /** Con sesión: prepara conectar una cuenta (link) o confirmar tu identidad (reauth). */
  prepare: (provider: ProviderSlug, intent: 'link' | 'reauth') =>
    api<{ url: string }>('POST', `/auth/oauth/${provider}/prepare`, { body: { intent } }),
  exchange: (result: string) => api<OAuthLoginResponse>('POST', '/auth/oauth/exchange', { body: { result } }),
  exchangeForUser: (result: string) => api<OAuthUserExchange>('POST', '/auth/oauth/exchange/me', { body: { result } }),
};

export const usersApi = {
  me: () => api<User>('GET', '/users/me'),
  /** «Descargar mis datos»: todo lo de la cuenta en JSON (sin contraseñas ni tokens). */
  exportData: () => api<Record<string, unknown>>('GET', '/users/me/export'),
  savePreferences: (body: Preferences) => api<Preferences>('PUT', '/users/me/preferences', { body }),
  update: (body: ProfileInput) => api<User>('PATCH', '/users/me', { body }),
  usernameAvailable: (username: string) =>
    api<{ username: string; available: boolean; valid: boolean }>('GET', '/users/me/username-available', { query: { username } }),
  /** Crear o cambiar la contraseña (pide la actual, o la prueba de Google/Apple si no hay). */
  setPassword: (body: { newPassword: string; currentPassword?: string; reauthToken?: string }) =>
    api<void>('POST', '/users/me/password', { body }),
  unlink: (provider: ProviderSlug) => api<void>('DELETE', `/users/me/accounts/${provider}`),
  instagram: () => api<InstagramOverview>('GET', '/users/me/instagram'),
  useInstagramPhoto: () => api<{ avatarAssetId: string }>('POST', '/users/me/instagram/use-photo'),
  /** Borra la cuenta y todos sus datos (pide la contraseña, o la prueba de Google/Apple). */
  remove: (body: { password?: string; reauthToken?: string }) => api<void>('DELETE', '/users/me', { body }),
};

export const plansApi = {
  list: () => api<Plan[]>('GET', '/plans'),
  mine: () => api<MyPlan>('GET', '/plans/me'),
};

export const subscriptionsApi = {
  history: () => api<Subscription[]>('GET', '/subscriptions'),
  changePlan: (planCode: string) =>
    api<Subscription>('POST', '/subscriptions/change-plan', { body: { planCode } }),
};

export const garmentTypesApi = {
  list: () => api<GarmentType[]>('GET', '/garment-types'),
};

export const wardrobesApi = {
  list: () => api<Paginated<Wardrobe>>('GET', '/wardrobes', { query: { pageSize: 100 } }),
  create: (body: { name: string; description?: string }) =>
    api<Wardrobe>('POST', '/wardrobes', { body }),
  update: (id: string, body: { name?: string; description?: string | null }) =>
    api<Wardrobe>('PATCH', `/wardrobes/${id}`, { body }),
  remove: (id: string) => api<void>('DELETE', `/wardrobes/${id}`),
};

export interface ItemFilters {
  wardrobeId?: string;
  category?: GarmentCategory;
  search?: string;
  page?: number;
  pageSize?: number;
  /** exclude (por defecto): solo lo que tienes. include: también la wishlist. only: solo la wishlist. */
  wishlist?: 'exclude' | 'include' | 'only';
  garmentTypeId?: string;
  season?: Season;
  /** Marca (sin distinguir mayúsculas). */
  brand?: string;
  /** Grupo de color (negro, blanco, azul…). */
  color?: ColorGroup;
  /** Solo favoritas. */
  favorite?: boolean;
  sort?: ItemSort;
}

export const itemsApi = {
  list: (filters: ItemFilters = {}) =>
    api<Paginated<WardrobeItem>>('GET', '/wardrobe-items', {
      query: { pageSize: 48, ...filters, favorite: filters.favorite ? 'true' : undefined },
    }),
  /** Resumen del armario (o de un armario): totales y valores para los filtros. */
  facets: (wardrobeId?: string) => api<WardrobeFacets>('GET', '/wardrobe-items/facets', { query: { wardrobeId } }),
  /** Marca o desmarca una prenda como favorita. */
  setFavorite: (id: string, on: boolean) =>
    api<{ id: string; isFavorite: boolean }>(on ? 'PUT' : 'DELETE', `/wardrobe-items/${id}/favorite`),
  /**
   * Descarga todas las páginas (para el selector de prendas de outfits).
   * `wishlist: 'include'` trae también las de la wishlist (marcadas con `wishlistStatus`).
   */
  async listAll(opts: { wishlist?: ItemFilters['wishlist'] } = {}): Promise<WardrobeItem[]> {
    const all: WardrobeItem[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await itemsApi.list({ page, pageSize: 100, ...opts });
      all.push(...res.data);
      if (page >= res.meta.totalPages) break;
    }
    return all;
  },
  get: (id: string) => api<WardrobeItem>('GET', `/wardrobe-items/${id}`),
  create: (body: WardrobeItemInput) => api<WardrobeItem>('POST', '/wardrobe-items', { body }),
  update: (id: string, body: Partial<WardrobeItemInput>) =>
    api<WardrobeItem>('PATCH', `/wardrobe-items/${id}`, { body }),
  remove: (id: string) => api<void>('DELETE', `/wardrobe-items/${id}`),
};

export const assetsApi = {
  list: () => api<Asset[]>('GET', '/assets'),
  upload: (file: File) => uploadFile<Asset>('/assets', file),
  /** Contenido de la imagen como Blob (lleva el token; no vale un <img src>). */
  content: (id: string) => fetchBlob(`/assets/${id}/content`),
  remove: (id: string) => api<void>('DELETE', `/assets/${id}`),
};

export const outfitsApi = {
  list: (page = 1, pageSize = 48, filters: Omit<OutfitListQuery, 'page' | 'pageSize'> = {}) =>
    api<Paginated<Outfit>>('GET', '/outfits', {
      query: { page, pageSize, ...filters, favorite: filters.favorite ? 'true' : undefined },
    }),
  summary: () => api<OutfitSummary>('GET', '/outfits/summary'),
  duplicate: (id: string) => api<Outfit>('POST', `/outfits/${id}/duplicate`),
  setFavorite: (id: string, isFavorite: boolean) => api<Outfit>('PATCH', `/outfits/${id}`, { body: { isFavorite } }),
  get: (id: string) => api<Outfit>('GET', `/outfits/${id}`),
  create: (body: OutfitInput) => api<Outfit>('POST', '/outfits', { body }),
  update: (id: string, body: Partial<OutfitInput>) =>
    api<Outfit>('PATCH', `/outfits/${id}`, { body }),
  remove: (id: string) => api<void>('DELETE', `/outfits/${id}`),
};

/** STYLE ANALYTICS: tus hábitos de vestir, calculados con tus datos de ahora. */
export const analyticsApi = {
  overview: (tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid') =>
    api<StyleAnalytics>('GET', '/analytics', { query: { tz } }),
};

/** WISHLIST: prendas que quieres comprar, sus precios y tu presupuesto. */
export const wishlistApi = {
  list: (query: { page?: number; pageSize?: number; status?: WishlistStatus; category?: WishlistCategory; search?: string; sort?: WishlistSort } = {}) =>
    api<Paginated<WishlistItem>>('GET', '/wishlist', { query: { pageSize: 100, ...query } }),
  /** Toda la lista (máx. 500 artículos). */
  async listAll(): Promise<WishlistItem[]> {
    const all: WishlistItem[] = [];
    for (let page = 1; page <= 5; page++) {
      const res = await wishlistApi.list({ page, pageSize: 100 });
      all.push(...res.data);
      if (page >= res.meta.totalPages) break;
    }
    return all;
  },
  get: (id: string) => api<WishlistItem>('GET', `/wishlist/${id}`),
  summary: () => api<WishlistSummary>('GET', '/wishlist/summary'),
  updateBudget: (body: { budget?: number | null; saved?: number; currency?: string }) =>
    api<WishlistSummary>('PUT', '/wishlist/budget', { body }),
  /** Pide precios a los servicios de seguimiento (si no hay ninguno, no cambia nada). */
  refreshPrices: () =>
    api<{ trackers: number; tracked: number; updated: number; unsupported: number }>('POST', '/wishlist/prices/refresh'),
  create: (body: WishlistInput & { name: string; category: WishlistCategory; color: string }) =>
    api<WishlistItem>('POST', '/wishlist', { body }),
  update: (id: string, body: WishlistInput) => api<WishlistItem>('PATCH', `/wishlist/${id}`, { body }),
  remove: (id: string) => api<void>('DELETE', `/wishlist/${id}`),
  prices: (id: string) => api<WishlistPrice[]>('GET', `/wishlist/${id}/prices`),
  recordPrice: (id: string, body: { price: number; currency?: string; note?: string | null }) =>
    api<WishlistItem>('POST', `/wishlist/${id}/prices`, { body }),
  removePrice: (id: string, priceId: string) => api<WishlistItem>('DELETE', `/wishlist/${id}/prices/${priceId}`),
  /** Comprado: pasa al armario (deja de estar en la wishlist). */
  moveToWardrobe: (id: string, body: { wardrobeId?: string; purchasePrice?: number; purchaseDate?: string; storeName?: string | null } = {}) =>
    api<WardrobeItem>('POST', `/wishlist/${id}/move`, { body }),
};

/** SNEAKER COLLECTION: tus zapatillas (y las que quieres), con ficha y estadísticas. */
export const sneakersApi = {
  /** Toda la colección (o la wishlist de sneakers), página a página. */
  async listAll(scope: SneakerScope = 'owned'): Promise<Sneaker[]> {
    const all: Sneaker[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await api<Paginated<Sneaker>>('GET', '/sneakers', { query: { scope, page, pageSize: 100 } });
      all.push(...res.data);
      if (page >= res.meta.totalPages) break;
    }
    return all;
  },
  get: (id: string) => api<Sneaker>('GET', `/sneakers/${id}`),
  stats: () => api<SneakerStats>('GET', '/sneakers/stats'),
  /** Zapatillas del armario sin ficha de colección. */
  candidates: () => api<WardrobeItem[]>('GET', '/sneakers/candidates'),
  adopt: (itemId: string, body: SneakerInput) => api<Sneaker>('POST', `/sneakers/adopt/${itemId}`, { body }),
  create: (body: SneakerInput & { brand: SneakerInput['brand']; model: string }) => api<Sneaker>('POST', '/sneakers', { body }),
  update: (id: string, body: SneakerInput) => api<Sneaker>('PATCH', `/sneakers/${id}`, { body }),
  /** `keepItem`: solo quita la ficha (la prenda sigue en el armario). */
  remove: (id: string, keepItem = false) => api<void>('DELETE', `/sneakers/${id}`, { query: { keepItem: keepItem ? 'true' : undefined } }),
  wear: (id: string, delta: 1 | -1) => api<Sneaker>('POST', `/sneakers/${id}/wear`, { body: { delta } }),
};

/** OUTFIT CALENDAR: qué outfit te pones cada día (fechas «YYYY-MM-DD»). */
export const calendarApi = {
  list: (from: string, to: string) => api<CalendarEntry[]>('GET', '/calendar', { query: { from, to } }),
  insights: (today: string) => api<CalendarInsights>('GET', '/calendar/insights', { query: { today } }),
  suggestions: (date: string, limit = 6) =>
    api<CalendarSuggestion[]>('GET', '/calendar/suggestions', { query: { date, limit } }),
  create: (body: CalendarEntryInput & { date: string; outfitId: string }) =>
    api<CalendarEntry>('POST', '/calendar', { body }),
  update: (id: string, body: CalendarEntryInput) => api<CalendarEntry>('PATCH', `/calendar/${id}`, { body }),
  remove: (id: string) => api<void>('DELETE', `/calendar/${id}`),
};

/** OUTFIT RATING: nota automática (motor de reglas del backend). */
export const ratingsApi = {
  current: (outfitId: string) => api<OutfitRatingState>('GET', `/outfits/${outfitId}/rating`),
  recalc: (outfitId: string) => api<OutfitRatingState>('POST', `/outfits/${outfitId}/rating`),
  history: (outfitId: string, limit = 20) => api<RatingEntry[]>('GET', `/outfits/${outfitId}/ratings`, { query: { limit } }),
  preview: (body: Pick<OutfitInput, 'items' | 'style' | 'occasion' | 'season'>) =>
    api<RatingResult>('POST', '/outfits/ratings/preview', { body }),
  compare: (ids: string[]) => api<RatingComparison>('GET', '/outfits/ratings/compare', { query: { ids: ids.join(',') } }),
};

export const mannequinsApi = {
  list: () => api<Mannequin[]>('GET', '/mannequins'),
  create: (body: MannequinInput) => api<Mannequin>('POST', '/mannequins', { body }),
  update: (id: string, body: Partial<MannequinInput>) => api<Mannequin>('PATCH', `/mannequins/${id}`, { body }),
  remove: (id: string) => api<void>('DELETE', `/mannequins/${id}`),
};

/** Estilista (motor propio en el backend, sin IA externa). */
export const stylistApi = {
  generate: (body: StylistContext & { count?: number; seed?: number; lockedItemIds?: string[]; discover?: boolean }) =>
    api<StylistResult>('POST', '/stylist/outfits', { body }),
  alternatives: (body: StylistContext & { itemIds: string[]; replaceItemId: string }) =>
    api<StylistAlternatives>('POST', '/stylist/alternatives', { body }),
  insights: (wardrobeId?: string) =>
    api<StylistInsights>('GET', '/stylist/insights', { query: wardrobeId ? { wardrobeId } : {} }),
  feedback: (body: { signal: StylistSignal; itemIds: string[]; tipCode?: string; style?: string; occasion?: string }) =>
    api<void>('POST', '/stylist/feedback', { body }),
};

/** Personas: perfiles, seguir, solicitudes y bloqueos. `handle`: id o @usuario. */
export const peopleApi = {
  search: (q: string) => api<PersonResult[]>('GET', '/people/search', { query: { q } }),
  get: (handle: string) => api<PublicProfile>('GET', `/people/${encodeURIComponent(handle)}`),
  avatar: (id: string) => fetchBlob(`/people/${id}/avatar`),
  cover: (id: string) => fetchBlob(`/people/${id}/cover`),
  outfits: (handle: string, page = 1) =>
    api<Paginated<SharedOutfit>>('GET', `/people/${encodeURIComponent(handle)}/outfits`, { query: { page, pageSize: 24 } }),
  followers: (handle: string, page = 1) =>
    api<Paginated<PersonResult>>('GET', `/people/${encodeURIComponent(handle)}/followers`, { query: { page, pageSize: 50 } }),
  following: (handle: string, page = 1) =>
    api<Paginated<PersonResult>>('GET', `/people/${encodeURIComponent(handle)}/following`, { query: { page, pageSize: 50 } }),
  follow: (id: string) => api<{ status: 'pending' | 'accepted' }>('POST', `/people/${id}/follow`),
  unfollow: (id: string) => api<void>('DELETE', `/people/${id}/follow`),
  removeFollower: (id: string) => api<void>('DELETE', `/people/${id}/follower`),
  block: (id: string) => api<void>('POST', `/people/${id}/block`),
  unblock: (id: string) => api<void>('DELETE', `/people/${id}/block`),
  blocked: () => api<UserBrief[]>('GET', '/blocks'),
  requests: () => api<(UserBrief & { requestedAt: string })[]>('GET', '/follow-requests'),
  accept: (id: string) => api<void>('POST', `/follow-requests/${id}/accept`),
  decline: (id: string) => api<void>('DELETE', `/follow-requests/${id}`),
};

/** Chats 1 a 1 y de grupo (los avisos en directo llegan por el WebSocket). */
export const chatApi = {
  list: () => api<ConversationSummary[]>('GET', '/conversations'),
  unread: () => api<{ unread: number }>('GET', '/conversations/unread'),
  direct: (userId: string) => api<ConversationDetail>('POST', '/conversations/direct', { body: { userId } }),
  createGroup: (title: string, memberIds: string[]) =>
    api<ConversationDetail>('POST', '/conversations/groups', { body: { title, memberIds } }),
  get: (id: string) => api<ConversationDetail>('GET', `/conversations/${id}`),
  rename: (id: string, title: string) => api<ConversationDetail>('PATCH', `/conversations/${id}`, { body: { title } }),
  messages: (id: string, before?: string) =>
    api<ChatMessage[]>('GET', `/conversations/${id}/messages`, { query: { before, limit: 40 } }),
  send: (id: string, body: { body?: string; outfitId?: string }) =>
    api<ChatMessage>('POST', `/conversations/${id}/messages`, { body }),
  deleteMessage: (id: string, messageId: string) => api<void>('DELETE', `/conversations/${id}/messages/${messageId}`),
  read: (id: string) => api<{ lastReadAt: string }>('POST', `/conversations/${id}/read`),
  addMembers: (id: string, userIds: string[]) =>
    api<ConversationDetail>('POST', `/conversations/${id}/members`, { body: { userIds } }),
  removeMember: (id: string, userId: string) => api<void>('DELETE', `/conversations/${id}/members/${userId}`),
  setRole: (id: string, userId: string, role: 'ADMIN' | 'MEMBER') =>
    api<ConversationDetail>('PATCH', `/conversations/${id}/members/${userId}`, { body: { role } }),
};

export const realtimeApi = {
  /** Ticket de un solo uso para abrir el WebSocket. */
  ticket: () => api<{ ticket: string; expiresIn: number }>('POST', '/realtime/ticket'),
};

/** Campanita: avisos guardados (los nuevos llegan también por el WebSocket). */
export const notificationsApi = {
  list: (before?: string) => api<AppNotification[]>('GET', '/notifications', { query: { before } }),
  unread: () => api<{ unread: number }>('GET', '/notifications/unread'),
  /** Sin ids marca todos como leídos. */
  read: (ids?: string[]) => api<{ unread: number }>('POST', '/notifications/read', { body: ids ? { ids } : {} }),
};

/** Tablón de ideas. */
export const ideasApi = {
  list: (q: { sort?: IdeaSort; status?: IdeaStatus; category?: IdeaCategory; search?: string; page?: number }) =>
    api<Paginated<Idea>>('GET', '/ideas', { query: q }),
  get: (id: string) => api<Idea>('GET', `/ideas/${id}`),
  create: (body: IdeaInput) => api<Idea>('POST', '/ideas', { body }),
  remove: (id: string) => api<void>('DELETE', `/ideas/${id}`),
  vote: (id: string, on: boolean) =>
    api<{ voteCount: number; votedByMe: boolean }>(on ? 'POST' : 'DELETE', `/ideas/${id}/vote`),
};

/** Denunciar un perfil, mensaje, outfit o idea. */
export const reportsApi = {
  create: (body: { targetType: ReportTarget; targetId: string; reason: ReportReason; details?: string }) =>
    api<{ id: string; status: ReportStatus }>('POST', '/reports', { body }),
};

/** Página «Novedades» (solo lo publicado). */
export const releasesApi = {
  list: (page = 1) => api<Paginated<Release>>('GET', '/releases', { query: { page } }),
};

/** Panel de administración (solo cuentas con rol ADMIN). */
export const adminApi = {
  stats: () => api<AdminStats>('GET', '/admin/stats'),
  users: (q: { search?: string; status?: 'all' | 'banned' | 'admins' | 'reported'; page?: number }) =>
    api<Paginated<AdminUser>>('GET', '/admin/users', { query: q }),
  user: (id: string) => api<AdminUserDetail>('GET', `/admin/users/${id}`),
  ban: (id: string, reason: string, days?: number) =>
    api<AdminUser>('POST', `/admin/users/${id}/ban`, { body: { reason, ...(days ? { days } : {}) } }),
  unban: (id: string) => api<AdminUser>('DELETE', `/admin/users/${id}/ban`),
  updateIdea: (id: string, body: IdeaAdminInput) => api<Idea>('PATCH', `/admin/ideas/${id}`, { body }),
  deleteIdea: (id: string) => api<void>('DELETE', `/admin/ideas/${id}`),
  reports: (q: { status?: ReportStatus; targetType?: ReportTarget; page?: number }) =>
    api<Paginated<AdminReport>>('GET', '/admin/reports', { query: q }),
  updateReport: (id: string, body: { status: ReportStatus; resolution?: string; notifyReporter?: boolean }) =>
    api<{ id: string; status: ReportStatus }>('PATCH', `/admin/reports/${id}`, { body }),
  hideOutfit: (id: string, hidden: boolean) =>
    api<{ id: string; hiddenByAdmin: boolean }>(hidden ? 'POST' : 'DELETE', `/admin/outfits/${id}/hide`),
  hideListing: (id: string, hidden: boolean) =>
    api<{ id: string; hiddenByAdmin: boolean }>(hidden ? 'POST' : 'DELETE', `/admin/listings/${id}/hide`),
  deleteMessage: (id: string) => api<void>('DELETE', `/admin/messages/${id}`),
  releases: (page = 1) => api<Paginated<Release>>('GET', '/admin/releases', { query: { page } }),
  createRelease: (body: ReleaseInput) => api<Release>('POST', '/admin/releases', { body }),
  updateRelease: (id: string, body: ReleaseInput) => api<Release>('PUT', `/admin/releases/${id}`, { body }),
  publishRelease: (id: string, notify = true) =>
    api<Release & { notified: number }>('POST', `/admin/releases/${id}/publish`, { body: { notify } }),
  unpublishRelease: (id: string) => api<Release>('POST', `/admin/releases/${id}/unpublish`),
  deleteRelease: (id: string) => api<void>('DELETE', `/admin/releases/${id}`),
  actions: (page = 1) => api<Paginated<AdminAction>>('GET', '/admin/actions', { query: { page } }),
};

/** Monitor (solo admins). */
export const monitorApi = {
  live: (range: MonitorRange) => api<MonitorLive>('GET', '/admin/monitor/live', { query: { range } }),
  database: () => api<MonitorDatabase>('GET', '/admin/monitor/database'),
  activity: (days: 7 | 30 | 90) => api<MonitorActivity>('GET', '/admin/monitor/activity', { query: { days } }),
  feed: () => api<MonitorFeedItem[]>('GET', '/admin/monitor/feed'),
};

/** STREETWEAR BATTLES: retos 1 vs 1 entre outfits, votados por la comunidad. */
export const battlesApi = {
  list: (tab: BattleTab, page = 1) => api<Paginated<Battle>>('GET', '/battles', { query: { tab, page, pageSize: 12 } }),
  summary: () => api<BattleSummary>('GET', '/battles/summary'),
  leaderboard: () => api<Leaderboard>('GET', '/battles/leaderboard'),
  get: (id: string) => api<Battle>('GET', `/battles/${id}`),
  /** Sin `opponentId`, el reto queda abierto a cualquiera. */
  create: (body: { outfitId: string; opponentId?: string; theme?: string | null }) => api<Battle>('POST', '/battles', { body }),
  accept: (id: string, outfitId: string) => api<Battle>('POST', `/battles/${id}/accept`, { body: { outfitId } }),
  decline: (id: string) => api<Battle>('POST', `/battles/${id}/decline`),
  cancel: (id: string) => api<void>('DELETE', `/battles/${id}`),
  vote: (id: string, side: BattleSide) => api<Battle>('POST', `/battles/${id}/vote`, { body: { side } }),
};

/** STREET MARKET: anuncios para vender o intercambiar; el trato se cierra por el chat. */
export const marketApi = {
  list: (q: MarketQuery) => api<Paginated<Listing>>('GET', '/market', { query: { pageSize: 24, ...q } }),
  summary: () => api<MarketSummary>('GET', '/market/summary'),
  get: (id: string) => api<Listing>('GET', `/market/${id}`),
  create: (body: ListingInput) => api<Listing>('POST', '/market', { body }),
  update: (id: string, body: ListingInput) => api<Listing>('PATCH', `/market/${id}`, { body }),
  remove: (id: string) => api<void>('DELETE', `/market/${id}`),
  favorite: (id: string, on: boolean) => api<{ isFavorite: boolean; favorites: number }>(on ? 'POST' : 'DELETE', `/market/${id}/favorite`),
  contact: (id: string, message?: string | null) => api<{ conversationId: string }>('POST', `/market/${id}/contact`, { body: { message } }),
  photo: (id: string, assetId: string) => fetchBlob(`/market/${id}/photos/${assetId}`),
};
