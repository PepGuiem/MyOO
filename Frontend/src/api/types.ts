import type { Preferences } from '../lib/preferences';
// Tipos de las respuestas de la API (reflejan los `select` del backend).

export type GarmentCategory =
  | 'TOP'
  | 'BOTTOM'
  | 'FULL_BODY'
  | 'OUTERWEAR'
  | 'FOOTWEAR'
  | 'ACCESSORY';

export type Season = 'SPRING' | 'SUMMER' | 'AUTUMN' | 'WINTER' | 'ALL_SEASON';

export type LimitedResource = 'WARDROBES' | 'WARDROBE_ITEMS' | 'OUTFITS' | 'MANNEQUINS';

export type AuthProviderKey = 'GOOGLE' | 'APPLE' | 'INSTAGRAM';
/** En las URLs de la API van en minúsculas. */
export type ProviderSlug = 'google' | 'apple' | 'instagram';

export interface ConnectedAccount {
  provider: AuthProviderKey;
  email: string | null;
  username: string | null;
  connectedAt: string;
}

/** El usuario y su perfil (GET /users/me). */
/** Idioma guardado en la cuenta. */
export type AccountLocale = 'ES' | 'EN';

export interface User {
  id: string;
  email: string;
  /** Google o Apple han confirmado que el email es suyo. */
  emailVerified: boolean;
  /** false si la cuenta se creó con Google/Apple y aún no tiene contraseña. */
  hasPassword: boolean;
  displayName: string | null;
  username: string | null;
  bio: string | null;
  pronouns: string | null;
  location: string | null;
  website: string | null;
  instagramHandle: string | null;
  styleTags: string[];
  favoriteColors: string[];
  sizes: { top: string | null; bottom: string | null; shoes: string | null };
  accentColor: string | null;
  avatarAssetId: string | null;
  coverAssetId: string | null;
  /** Privacidad: cuenta privada y quién puede escribirte. */
  isPrivate: boolean;
  messagePolicy: MessagePolicy;
  /** Idioma de la web (se cambia en Cuenta). */
  locale: AccountLocale;
  /** ADMIN ve el panel de administración (se da con `npm run admin:grant`). */
  role: UserRole;
  createdAt: string;
  accounts: ConnectedAccount[];
  /** Ajustes de «Personalizar» (null = los de por defecto). */
  preferences?: Preferences | null;
}

export type UserRole = 'USER' | 'ADMIN';

export type MessagePolicy = 'EVERYONE' | 'FOLLOWING' | 'NOBODY';

/** Lo que se puede cambiar del perfil (null o '' borra el campo). */
export interface ProfileInput {
  locale?: AccountLocale;
  displayName?: string;
  username?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  location?: string | null;
  website?: string | null;
  instagramHandle?: string | null;
  styleTags?: string[];
  favoriteColors?: string[];
  sizeTop?: string | null;
  sizeBottom?: string | null;
  sizeShoes?: string | null;
  accentColor?: string | null;
  avatarAssetId?: string | null;
  coverAssetId?: string | null;
  isPrivate?: boolean;
  messagePolicy?: MessagePolicy;
}

export interface OAuthProviders {
  google: boolean;
  apple: boolean;
  instagram: boolean;
}

export interface InstagramMedia {
  id: string;
  mediaType: string;
  imageUrl: string | null;
  permalink: string | null;
  caption: string | null;
  timestamp: string | null;
}

export type InstagramOverview =
  | { connected: false }
  | {
      connected: true;
      status: 'ok' | 'expired' | 'unavailable';
      username: string | null;
      profile: {
        id: string;
        username: string;
        name: string | null;
        accountType: string | null;
        profilePictureUrl: string | null;
        followersCount: number | null;
        mediaCount: number | null;
      } | null;
      media: InstagramMedia[];
    };

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: User;
}

/** Respuesta del canje tras volver de Google/Apple. */
export interface OAuthLoginResponse extends AuthResponse {
  created: boolean;
  /** Se quitó la contraseña de una cuenta cuyo email no estaba verificado. */
  passwordRemoved: boolean;
}

export type OAuthUserExchange =
  | { intent: 'link'; provider: ProviderSlug }
  | { intent: 'reauth'; provider: ProviderSlug; reauthToken: string };

export interface EnumOption {
  value: string;
  label: string;
}

export type AttributeField =
  | { type: 'enum'; label: string; options: EnumOption[] }
  | { type: 'string'; label: string; maxLength: number }
  | { type: 'boolean'; label: string }
  | { type: 'number'; label: string; min?: number; max?: number; integer?: boolean };

export type AttributeValue = string | number | boolean;
export type Attributes = Record<string, AttributeValue>;

// --- Personalización (refleja src/customization del backend) ---

export type ColorSlot = 'buttons' | 'stitching' | 'zipper' | 'hardware' | 'trim' | 'lining' | 'secondary' | 'sole' | 'laces' | 'pattern' | 'pattern2';
export type MetalFinish = 'silver' | 'gold' | 'gunmetal' | 'brass' | 'copper' | 'black';
export type ButtonStyle = 'four_hole' | 'two_hole' | 'shank' | 'snap' | 'toggle' | 'covered';
export type StitchStyle = 'single' | 'double' | 'none';
export type FabricPattern = 'solid' | 'stripes' | 'breton' | 'pinstripe' | 'gingham' | 'check' | 'tartan' | 'retro';
export type PatternSize = 'small' | 'medium' | 'large';
export type DetailKind = 'patch' | 'embroidery' | 'print' | 'label' | 'button' | 'rivet' | 'stud' | 'pin' | 'pocket' | 'zipper' | 'drawing';
export type DetailShape = 'rect' | 'rounded' | 'circle' | 'oval' | 'shield' | 'cutout';
export type DetailFont = 'sans' | 'serif' | 'script' | 'mono' | 'college';
export type Vec3 = [number, number, number];

export interface CustomDetail {
  id: string;
  kind: DetailKind;
  /** Punto de la prenda (coordenadas del modelo, silueta estándar, metros). */
  position: Vec3;
  normal: Vec3;
  rotation: number;
  /** Tamaño en metros (lado mayor). */
  size: number;
  color: string;
  secondaryColor?: string;
  text?: string;
  font?: DetailFont;
  shape?: DetailShape;
  assetId?: string;
}

/** Tipos de estampado configurable (ver lib/patterns.ts). */
export type PatternKind =
  | 'stripes'
  | 'checks'
  | 'grid'
  | 'checkerboard'
  | 'tartan'
  | 'houndstooth'
  | 'herringbone'
  | 'chevron'
  | 'waves'
  | 'dots'
  | 'argyle'
  | 'camo'
  | 'leopard'
  | 'tiedye';
/** Qué tela lleva el estampado: la principal, los paneles secundarios o ambas (y ribetes). */
export type PatternTarget = 'main' | 'secondary' | 'all';

/**
 * Estampado configurable de la tela. Sustituye a `options.pattern` /
 * `options.patternSize` (que se siguen leyendo en prendas antiguas).
 */
export interface PatternSpec {
  kind: PatternKind;
  /** 1–4 colores, sobre el color de la prenda (que hace de fondo). */
  colors: string[];
  /** Lo que mide una repetición, en metros (0,005–0,4). */
  size: number;
  /** Grosor de rayas, bandas o lunares (0,02–0,98). */
  thickness: number;
  /** Cantidad: líneas por grupo, bandas, lunares por fila, manchas... (1–6). */
  count: number;
  /** Dirección, en grados (−180..180). */
  angle: number;
  /** Intensidad (0,05–1). */
  opacity: number;
  /** Bordes difuminados (0–1). */
  softness: number;
  /** Desplazamiento dentro de la repetición (0–1). */
  offsetX: number;
  offsetY: number;
  target: PatternTarget;
}

export interface Customization {
  colors?: Partial<Record<ColorSlot, string>>;
  parts?: Record<string, boolean>;
  options?: { metal?: MetalFinish; buttonStyle?: ButtonStyle; stitchStyle?: StitchStyle; pattern?: FabricPattern; patternSize?: PatternSize };
  pattern?: PatternSpec;
  details?: CustomDetail[];
}

export interface PartOption {
  key: string;
  label: string;
  default: boolean | null;
}

export interface CustomizationOptions {
  colors: ColorSlot[];
  parts: PartOption[];
  options: ('metal' | 'buttonStyle' | 'stitchStyle' | 'pattern' | 'patternSize')[];
}

export interface Asset {
  id: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  name: string;
  createdAt: string;
}

export interface GarmentTypeSummary {
  id: string;
  code: string;
  name: string;
  category: GarmentCategory;
  modelKey: string;
}

export interface GarmentType extends GarmentTypeSummary {
  attributeSchema: { fields?: Record<string, AttributeField> };
  sortOrder: number;
  customizationOptions: CustomizationOptions;
  /** Cómo se puede llevar en un outfit (falta si el backend es antiguo). */
  stylingOptions?: StylingOption[];
}

/** Cómo se lleva una prenda dentro de un outfit (ver Backend/src/outfits/styling.ts). */
export interface Styling {
  tuck?: 'out' | 'in' | 'half' | 'side';
  sleeves?: 'down' | 'rolled' | 'pushed';
  front?: 'closed' | 'open' | 'top_open';
  hem?: 'normal' | 'cuffed' | 'rolled';
  boots?: 'over' | 'in';
  visor?: 'forward' | 'backward' | 'side';
  hood?: 'up' | 'down';
}
export type StylingKey = keyof Styling;

export interface StylingOption {
  key: StylingKey;
  label: string;
  values: { value: string; label: string }[];
}

export interface Wardrobe {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
}

export interface WardrobeItem {
  id: string;
  name: string;
  color: string;
  size: string | null;
  season: Season;
  notes: string | null;
  imageUrl: string | null;
  /** Modelo 3D real (.glb/.gltf). Si es null, se dibuja el modelo procedural. */
  modelUrl: string | null;
  attributes: Attributes;
  customization: Customization;
  /** Estilos de la prenda (claves de STYLE_TAGS); vacío: el estilista los deduce. */
  styles: string[];
  /** Dónde se compró (todo opcional; la marca va en attributes.brand). */
  productName: string | null;
  storeName: string | null;
  purchasePlatform: string | null;
  productUrl: string | null;
  productRef: string | null;
  /** Decimal: llega como texto ("119.99"). */
  purchasePrice: string | null;
  currency: string | null;
  /** Fecha ISO (solo cuenta el día). */
  purchaseDate: string | null;
  createdAt: string;
  updatedAt: string;
  wardrobe: { id: string; name: string };
  garmentType: GarmentTypeSummary;
  /** No null: está en la WISHLIST (todavía no la tienes). Falta si el backend es antiguo. */
  wishlistStatus?: WishlistStatus | null;
  /** Tu foto (asset subido). */
  photoAssetId?: string | null;
  /** Ficha de SNEAKER COLLECTION (null si no es una zapatilla fichada). */
  sneaker?: SneakerCard | null;
  /** Favorita en el armario. Falta si el backend es antiguo. */
  isFavorite?: boolean;
}

/** Grupos de color para filtrar el armario. */
export type ColorGroup = 'black' | 'white' | 'grey' | 'beige' | 'brown' | 'blue' | 'green' | 'red' | 'pink' | 'orange' | 'yellow' | 'purple';
export type ItemSort = 'newest' | 'oldest' | 'name' | 'favorites';

/** Resumen del armario: datos reales para la barra de información y los filtros. */
export interface WardrobeFacets {
  total: number;
  favorites: number;
  categories: number;
  byCategory: Partial<Record<GarmentCategory, number>>;
  garmentTypes: { id: string; code: string; name: string; category: GarmentCategory; count: number }[];
  brands: { value: string; count: number }[];
  colors: { value: ColorGroup; count: number }[];
  seasons: { value: Season; count: number }[];
  lastAdded: { id: string; name: string; createdAt: string } | null;
}

export interface OutfitEntry {
  position: number;
  styling?: Styling;
  wardrobeItem: {
    id: string;
    name: string;
    color: string;
    size: string | null;
    season: Season;
    imageUrl: string | null;
    modelUrl: string | null;
    attributes: Attributes;
    customization: Customization;
    wardrobeId: string;
    garmentType: GarmentTypeSummary;
    /** No null: es de la wishlist (todavía no la tienes). */
    wishlistStatus?: WishlistStatus | null;
  };
}

export interface Outfit {
  id: string;
  name: string;
  description: string | null;
  occasion: string | null;
  season: Season | null;
  /** Se ve en tu perfil. */
  isShared?: boolean;
  /** Un admin lo ha ocultado (moderación): ya no se ve en tu perfil. */
  hiddenByAdmin?: boolean;
  sharedAt?: string | null;
  /** Estilo (streetwear, techwear…); null sin estilo. */
  style?: OutfitStyle | null;
  isFavorite?: boolean;
  /** Última nota de OUTFIT RATING (0-100) y su nivel. */
  ratingScore?: number | null;
  ratingTier?: RatingTier | null;
  ratedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  items: OutfitEntry[];
}

// ---------------------------------------------------------------- STYLE ANALYTICS
export interface AnalyticsInsight {
  code: string;
  tone: 'warn' | 'tip' | 'praise' | 'info';
  title: string;
  text: string;
}

export interface StyleAnalytics {
  today: string;
  tz: string;
  totals: {
    items: number;
    outfits: number;
    outfitsThisMonth: number;
    outfitsLastMonth: number;
    itemsThisMonth: number;
    worn30: number;
    favorites: number;
    avgRating: number | null;
    usedItemsShare: number;
  };
  highlights: {
    topStyle: { style: OutfitStyle; share: number; inferred: boolean } | null;
    topColor: { name: string; hex: string; share: number } | null;
    topBrand: { name: string; count: number } | null;
    brandCoverage: number;
    mostCombined: { itemId: string; name: string; color: string; category: GarmentCategory; count: number; share: number } | null;
  };
  styles: { style: OutfitStyle; count: number; declared: number; inferred: number; share: number }[];
  colors: {
    ranking: { name: string; hex: string; uses: number; items: number; share: number }[];
    least: { name: string; hex: string; uses: number; items: number; share: number }[];
    pairs: { a: { name: string; hex: string }; b: { name: string; hex: string }; count: number; share: number }[];
    families: { neutral: number; earth: number; color: number };
  };
  brands: { name: string; count: number }[];
  categories: { category: GarmentCategory; items: number; used: number; usedShare: number }[];
  unused: { count: number; sample: { id: string; name: string; color: string; category: GarmentCategory }[] };
  evolution: {
    weekly: { key: string; label: string; outfits: number; items: number; worn: number }[];
    monthly: { key: string; label: string; outfits: number; items: number; worn: number; styles: Record<OutfitStyle, number> }[];
  };
  insights: AnalyticsInsight[];
}

// ---------------------------------------------------------------- OUTFIT CALENDAR
export type CalendarEventKind = 'BIRTHDAY' | 'PARTY' | 'WEDDING' | 'DATE' | 'INTERVIEW' | 'TRIP' | 'CONCERT' | 'OTHER';

export interface CalendarRepeat {
  gapDays: number | null;
  uses30: number;
  level: 'warn' | 'high';
  text: string;
}

/** Un outfit puesto (o planificado) en un día. `date` es «YYYY-MM-DD». */
export interface CalendarEntry {
  id: string;
  date: string;
  note: string | null;
  eventName: string | null;
  eventKind: CalendarEventKind | null;
  worn: boolean;
  wornAt: string | null;
  createdAt: string;
  outfit: Outfit;
  repeat: CalendarRepeat | null;
}

export interface CalendarEntryInput {
  date?: string;
  outfitId?: string;
  note?: string | null;
  eventName?: string | null;
  eventKind?: CalendarEventKind | null;
  worn?: boolean;
}

export interface CalendarInsights {
  stats: {
    wornTotal: number;
    worn30: number;
    wearRate30: number | null;
    streak: number;
    upcoming30: number;
    neverWorn: number;
    totalOutfits: number;
    byWeekday: number[];
    byStyle: { style: OutfitStyle | null; count: number }[];
    topWorn: { outfitId: string; count: number; name: string; style: OutfitStyle | null }[];
  };
  repeats: { outfitId: string; name: string; text: string; level: 'warn' | 'high'; dates: string[] }[];
  upcoming: CalendarEntry[];
  events: CalendarEntry[];
}

export interface CalendarSuggestion {
  outfit: Outfit;
  reasons: string[];
  lastWorn: string | null;
}

// ---------------------------------------------------------------- OUTFIT RATING
export type RatingTier = 'BEGINNER' | 'CASUAL' | 'GOOD_STYLE' | 'FASHION_KILLER' | 'STREETWEAR_LEGEND';
export type RatingCategory = 'colors' | 'style' | 'balance' | 'details';
export type RatingTrigger = 'CREATE' | 'UPDATE' | 'MANUAL' | 'BACKFILL';

export interface RatingCheck {
  code: string;
  points: number;
  text: string;
  itemIds?: string[];
}

export type RatingTipAction =
  | { type: 'add'; itemId: string }
  | { type: 'swap'; fromItemId: string; toItemId: string }
  | { type: 'remove'; itemId: string }
  | { type: 'style'; style: OutfitStyle };

export interface RatingTip {
  code: string;
  text: string;
  gain?: number;
  action?: RatingTipAction;
}

/** Resultado del motor (reglas hoy; el formato está pensado para otros motores). */
export interface RatingResult {
  version: number;
  engine: string;
  total: number;
  tier: RatingTier;
  categories: Record<RatingCategory, { score: number; max: number; checks: RatingCheck[] }>;
  comments: string[];
  tips: RatingTip[];
  badges: { code: string; label: string }[];
  palette: { color: string; name: string }[];
  detectedStyle: OutfitStyle | null;
}

/** Una fila del historial de notas. */
export interface RatingEntry {
  id: string;
  total: number;
  colors: number;
  style: number;
  balance: number;
  details: number;
  tier: RatingTier;
  engine: string;
  trigger: RatingTrigger;
  createdAt: string;
}

export interface OutfitRatingState {
  rating: RatingEntry & { report: RatingResult };
  result: RatingResult;
  /** true si la recalculaste y cambió algo. */
  changed: boolean;
  /** true si ha cambiado algo desde la última nota (p. ej. el color de una prenda). */
  stale: boolean;
}

export interface RatingComparison {
  outfits: { id: string; name: string; style: OutfitStyle | null; rating: RatingEntry; stale: boolean; comments: string[] }[];
  winners: Record<RatingCategory | 'total', string[]>;
}

export type OutfitStyle =
  | 'STREETWEAR'
  | 'TECHWEAR'
  | 'OLD_MONEY'
  | 'CASUAL'
  | 'SKATE'
  | 'GRUNGE'
  | 'Y2K'
  | 'MINIMAL'
  | 'TRAP'
  | 'LUXURY_STREETWEAR';

/** Cifras para los filtros de /outfits. */
export interface OutfitSummary {
  total: number;
  favorites: number;
  byStyle: Record<OutfitStyle, number>;
  unstyled: number;
}

export interface OutfitListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  style?: OutfitStyle;
  favorite?: boolean;
  sort?: 'new' | 'old' | 'name' | 'score';
  /** Solo los outfits que llevan esta prenda (p. ej. unas zapatillas). */
  itemId?: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface PlanLimit {
  resource: LimitedResource;
  isUnlimited: boolean;
  maxCount: number;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  isDefault: boolean;
  isActive: boolean;
  limits: PlanLimit[];
}

export interface UsageEntry {
  resource: LimitedResource;
  used: number;
  isUnlimited: boolean;
  max: number | null;
}

export interface MyPlan {
  plan: Plan;
  subscriptionId: string | null;
  usage: UsageEntry[];
}

export interface Subscription {
  id: string;
  status: 'ACTIVE' | 'CANCELED' | 'EXPIRED';
  startedAt: string;
  endsAt: string | null;
  canceledAt: string | null;
  plan: { id: string; code: string; name: string };
}

/** Lo mínimo que necesita el modelo 3D para dibujar una prenda. */
export interface GarmentLike {
  color: string;
  attributes: Attributes;
  customization?: Customization;
  /** Solo en outfits: cómo se lleva (por dentro, remangada...). */
  styling?: Styling;
  garmentType: Pick<GarmentTypeSummary, 'modelKey' | 'category'>;
}

// --- Cuerpos de petición ---

export interface PurchaseInput {
  styles?: string[];
  productName?: string | null;
  storeName?: string | null;
  purchasePlatform?: string | null;
  productUrl?: string | null;
  productRef?: string | null;
  purchasePrice?: number | null;
  currency?: string | null;
  /** AAAA-MM-DD */
  purchaseDate?: string | null;
}

export interface WardrobeItemInput extends PurchaseInput {
  wardrobeId: string;
  garmentTypeId: string;
  name: string;
  color: string;
  size?: string | null;
  season?: Season;
  notes?: string | null;
  imageUrl?: string | null;
  modelUrl?: string | null;
  attributes?: Attributes;
  customization?: Customization;
}

export interface OutfitInput {
  name: string;
  description?: string | null;
  occasion?: string | null;
  season?: Season | null;
  isShared?: boolean;
  style?: OutfitStyle | null;
  isFavorite?: boolean;
  items: { wardrobeItemId: string; position?: number; styling?: Styling }[];
}

/** Medidas reales de un maniquí, en centímetros. */
export interface MannequinMeasures {
  heightCm: number;
  shoulderCm: number;
  chestCm: number;
  waistCm: number;
  hipCm: number;
  armCm: number;
}

/** Maniquí personalizado de la cuenta (cuántos se pueden tener depende del plan). */
export interface Mannequin {
  id: string;
  name: string;
  sex: 'male' | 'female';
  measures: MannequinMeasures;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MannequinInput {
  name: string;
  sex: 'male' | 'female';
  measures: MannequinMeasures;
  isDefault?: boolean;
}

// --- Estilista ---

export type StylistSlot = 'top' | 'mid' | 'bottom' | 'full' | 'outer' | 'shoes' | 'head' | 'neck';

export type TipAction =
  | { type: 'add'; itemId: string }
  | { type: 'swap'; fromItemId: string; toItemId: string }
  | { type: 'styling'; itemId: string; styling: Styling };

export interface StylistTip {
  id: string;
  code: string;
  kind: 'praise' | 'add' | 'swap' | 'styling' | 'missing';
  text: string;
  action?: TipAction;
}

export interface StylistOutfit {
  key: string;
  items: { itemId: string; slot: StylistSlot }[];
  score: number;
  reasons: string[];
  tips: StylistTip[];
  palette: { color: string; name: string }[];
}

/** Prenda tal como la devuelve el estilista (lo justo para dibujarla). */
export interface StylistItem {
  id: string;
  name: string;
  color: string;
  size: string | null;
  season: Season;
  imageUrl: string | null;
  modelUrl: string | null;
  attributes: Attributes;
  customization: Customization;
  styles: string[];
  garmentType: GarmentTypeSummary;
}

export interface StylistContext {
  style?: string;
  occasion?: string;
  weather?: string;
  season?: Season;
  wardrobeId?: string;
  excludeItemIds?: string[];
}

export interface StylistResult {
  outfits: StylistOutfit[];
  items: Record<string, StylistItem>;
}

export interface StylistAlternatives {
  alternatives: { itemId: string; score: number; reason: string }[];
  items: Record<string, StylistItem>;
}

/** Prenda que resolvería un aviso del armario y lo que ganarías con ella. */
export interface StylistSuggestion {
  slot: 'top' | 'bottom' | 'shoes' | 'outer' | 'accessory';
  wishlistCategory: 'SNEAKERS' | 'TSHIRTS' | 'PANTS' | 'JACKETS' | 'ACCESSORIES';
  color: string;
  /** Combinaciones posibles antes y después (null: no se puede contar). */
  gain: { before: number; after: number } | null;
}

export interface StylistInsights {
  insights: { code: string; priority: 1 | 2 | 3; text: string; suggestion?: StylistSuggestion }[];
  stats: {
    total: number;
    byCategory: Record<string, number>;
    colorFamilies: { neutral: number; earth: number; color: number };
    topColors: { name: string; count: number }[];
    styles: { style: string; label: string; count: number }[];
    unusedItemIds: string[];
    /** Combinaciones posibles con lo que tienes. Falta si el backend es antiguo. */
    combinations?: number;
  };
}

export type StylistSignal = 'LIKE' | 'DISLIKE' | 'SAVE' | 'WEAR' | 'ACCEPT_TIP' | 'REJECT_TIP' | 'SWAP';

// -----------------------------------------------------------------------------
// Red social: personas, seguidores y chats
// -----------------------------------------------------------------------------

export type FollowState = 'none' | 'pending' | 'accepted';

/** Lo mínimo de otra persona (listas, chats, búsqueda). */
export interface UserBrief {
  id: string;
  username: string | null;
  displayName: string | null;
  /** Clave de la foto (cambia al cambiarla); null sin foto. */
  avatar: string | null;
  isPrivate: boolean;
}

export interface PersonResult extends UserBrief {
  /** Tú → esta persona. */
  following: FollowState;
}

export interface PublicProfile extends UserBrief {
  bio: string | null;
  pronouns: string | null;
  accentColor: string | null;
  location: string | null;
  website: string | null;
  instagramHandle: string | null;
  styleTags: string[];
  favoriteColors: string[];
  cover: string | null;
  counts: { followers: number; following: number; outfits: number };
  relationship: { isSelf: boolean; following: FollowState; followedBy: FollowState; blockedByMe: boolean };
  canView: boolean;
  canMessage: boolean;
}

/** Un outfit visto por otra persona (o enviado por chat): solo lo necesario para dibujarlo. */
export interface SharedOutfit {
  id: string;
  name: string;
  description: string | null;
  occasion: string | null;
  season: Season | null;
  sharedAt?: string | null;
  items: {
    position: number;
    styling?: Styling;
    wardrobeItem: {
      id: string;
      name: string;
      color: string;
      attributes: Attributes;
      customization: Customization;
      garmentType: GarmentTypeSummary;
    };
  }[];
}

export type ConversationRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface ConversationMember extends UserBrief {
  role: ConversationRole;
  lastReadAt: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  kind: 'TEXT' | 'OUTFIT' | 'SYSTEM';
  body: string | null;
  outfit: SharedOutfit | null;
  deleted: boolean;
  createdAt: string;
  sender: UserBrief | null;
}

export interface ConversationSummary {
  id: string;
  isGroup: boolean;
  title: string | null;
  lastMessageAt: string;
  members: ConversationMember[];
  lastMessage: ChatMessage | null;
  unread: number;
}

export interface ConversationDetail {
  id: string;
  isGroup: boolean;
  title: string | null;
  createdAt: string;
  lastMessageAt: string;
  members: ConversationMember[];
  /** Puedes escribir (en 1 a 1 depende de la privacidad y los bloqueos). */
  canSend: boolean;
}

/** Eventos que llegan por el WebSocket. */
export type RealtimeEvent =
  | { type: 'ready' }
  | { type: 'pong' }
  | { type: 'message'; message: ChatMessage }
  | { type: 'message_deleted'; conversationId: string; messageId: string }
  | { type: 'read'; conversationId: string; userId: string; at: string }
  | { type: 'typing'; conversationId: string; userId: string }
  | { type: 'conversation'; conversationId: string }
  | { type: 'follow_request' | 'new_follower' | 'follow_accepted'; user: UserBrief | null }
  | { type: 'notification'; notificationType: NotificationType; title: string; link: string | null };

// -----------------------------------------------------------------------------
// Avisos, ideas, denuncias, novedades y administración
// -----------------------------------------------------------------------------

export type NotificationType =
  | 'RELEASE'
  | 'IDEA_STATUS'
  | 'IDEA_REPLY'
  | 'FOLLOW_REQUEST'
  | 'NEW_FOLLOWER'
  | 'FOLLOW_ACCEPTED'
  | 'REPORT_UPDATE'
  | 'PRICE_DROP'
  | 'BATTLE_CHALLENGE'
  | 'BATTLE_ACCEPTED'
  | 'BATTLE_RESULT';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  /** Ruta interna ("/novedades", "/u/ana"...). */
  link: string | null;
  actorId: string | null;
  readAt: string | null;
  createdAt: string;
}

export type IdeaCategory = 'FEATURE' | 'IMPROVEMENT' | 'BUG' | 'OTHER';
export type IdeaStatus = 'NEW' | 'UNDER_REVIEW' | 'PLANNED' | 'IN_PROGRESS' | 'DONE' | 'DECLINED';
export type IdeaSort = 'top' | 'new' | 'mine';

export interface Idea {
  id: string;
  title: string;
  body: string;
  category: IdeaCategory;
  status: IdeaStatus;
  adminReply: string | null;
  repliedAt: string | null;
  pinned: boolean;
  hidden: boolean;
  duplicateOfId: string | null;
  voteCount: number;
  createdAt: string;
  updatedAt: string;
  author: UserBrief | null;
  mine: boolean;
  votedByMe: boolean;
}

export interface IdeaInput {
  title: string;
  body: string;
  category?: IdeaCategory;
}

export interface IdeaAdminInput {
  status?: IdeaStatus;
  adminReply?: string | null;
  pinned?: boolean;
  hidden?: boolean;
  duplicateOfId?: string | null;
}

export type ReportTarget = 'USER' | 'MESSAGE' | 'OUTFIT' | 'IDEA' | 'LISTING';
export type ReportReason = 'SPAM' | 'HARASSMENT' | 'INAPPROPRIATE' | 'IMPERSONATION' | 'OTHER';
export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export type ReleaseTag = 'NEW' | 'IMPROVED' | 'FIXED';

export interface Release {
  id: string;
  title: string;
  version: string | null;
  body: string;
  tags: ReleaseTag[];
  publishedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReleaseInput {
  title: string;
  version?: string | null;
  body: string;
  tags?: ReleaseTag[];
}

export interface AdminStats {
  users: number;
  newUsers: number;
  banned: number;
  openReports: number;
  newIdeas: number;
  ideas: number;
  releases: { published: number; drafts: number };
}

export interface AdminUser extends UserBrief {
  email: string;
  role: UserRole;
  createdAt: string;
  bannedAt: string | null;
  bannedUntil: string | null;
  banReason: string | null;
  banned: boolean;
  openReports: number;
}

export interface AdminAction {
  id: string;
  action: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  admin: UserBrief | null;
  targetUser?: UserBrief | null;
}

export interface AdminUserDetail extends AdminUser {
  counts: { outfits: number; wardrobes: number; followers: number; following: number; ideas: number; reportsMade: number };
  reports: {
    id: string;
    targetType: ReportTarget;
    reason: ReportReason;
    details: string | null;
    status: ReportStatus;
    snapshot: Record<string, unknown> | null;
    createdAt: string;
  }[];
  actions: AdminAction[];
}

export interface AdminReport {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  targetUserId: string | null;
  reason: ReportReason;
  details: string | null;
  snapshot: Record<string, unknown> | null;
  status: ReportStatus;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  reporter: UserBrief | null;
  targetUser: AdminUser | null;
  /** Lo denunciado sigue visible, ya se ocultó o ya no existe. */
  targetState: 'visible' | 'hidden' | 'deleted';
}

// -----------------------------------------------------------------------------
// Monitor (solo admins)
// -----------------------------------------------------------------------------

export type MonitorLevel = 'ok' | 'warning' | 'critical';
export type MonitorRange = '1h' | '6h' | '24h';

export interface MonitorCheck {
  key: string;
  label: string;
  level: MonitorLevel;
  detail: string;
}

export interface TrafficSummary {
  requests: number;
  perMinute: number;
  s2xx: number;
  s3xx: number;
  s4xx: number;
  s5xx: number;
  errorRate: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface MonitorLive {
  now: string;
  range: MonitorRange;
  status: { level: MonitorLevel; checks: MonitorCheck[] };
  process: {
    uptimeSec: number;
    startedAt: string;
    node: string;
    platform: string;
    env: string;
    version: string | null;
    rssMb: number;
    heapUsedMb: number;
    heapLimitMb: number;
    cpuPct: number;
    cpuCores: number;
    lagP99Ms: number;
  };
  database: { ok: boolean; ms: number | null };
  realtime: { users: number; connections: number; pendingTickets: number; eventsSent: number; eventsReceived: number };
  summary: { last5: TrafficSummary; last60: TrafficSummary };
  traffic: { step: number; points: { t: string; requests: number; s4xx: number; s5xx: number; p50: number | null; p95: number | null }[] };
  system: {
    step: number;
    hasData: boolean;
    points: { t: string; rssMb: number; heapUsedMb: number; cpuPct: number; lagP99Ms: number; wsConnections: number }[];
  };
  routes: { method: string; route: string; requests: number; s4xx: number; s5xx: number; p50: number | null; p95: number | null }[];
  errors: { at: string; method: string; route: string; status: number; error: string | null; ms: number }[];
}

export interface MonitorDatabase {
  ok: boolean;
  ms: number | null;
  version: string | null;
  sizeBytes: number | null;
  connections: number | null;
  tables: { name: string; rows: number; bytes: number }[];
}

export interface MonitorActivity {
  days: number;
  tz: string;
  active: { dau: number; wau: number; mau: number; online: number };
  totals: {
    users: number;
    banned: number;
    wardrobes: number;
    items: number;
    outfits: number;
    sharedOutfits: number;
    conversations: number;
    messages: number;
    follows: number;
    ideas: number;
    openReports: number;
    assets: number;
    assetBytes: number;
  };
  daily: Record<string, { label: string; total: number; points: { day: string; value: number }[] }>;
}

export interface MonitorFeedItem {
  id: string;
  kind: 'signup' | 'report' | 'idea' | 'release' | 'admin';
  at: string;
  title: string;
  user: UserBrief | null;
  meta?: string;
}

// -----------------------------------------------------------------------------
// WISHLIST: prendas que quieres comprar (ver Backend/src/wishlist)
// -----------------------------------------------------------------------------

export type WishlistStatus = 'WANT' | 'SAVING' | 'PENDING' | 'PURCHASED';
export type WishlistCategory = 'SNEAKERS' | 'HOODIES' | 'TSHIRTS' | 'PANTS' | 'JACKETS' | 'ACCESSORIES' | 'OTHER';
export type WishlistSort = 'new' | 'price_asc' | 'price_desc' | 'name';

export interface WishlistPrice {
  id: string;
  /** Decimal: llega como texto ("119.99"). */
  price: string;
  currency: string;
  /** MANUAL: lo apuntaste tú. TRACKER: un servicio de seguimiento (cuando lo haya). */
  source: 'MANUAL' | 'TRACKER';
  note: string | null;
  recordedAt: string;
}

export interface PriceTrend {
  direction: 'up' | 'down' | 'same';
  /** Último frente al anterior (en la moneda del artículo). */
  diff: number;
  pct: number;
  lowest: number;
  highest: number;
  /** El último es el más bajo apuntado (y hay más de uno). */
  isLowest: boolean;
  points: number;
}

export interface WishlistItem extends Omit<WardrobeItem, 'wishlistStatus'> {
  wishlistStatus: WishlistStatus;
  wishlistCategory: WishlistCategory | null;
  currentPrice: string | null;
  targetPrice: string | null;
  trackPrice: boolean;
  photoAssetId: string | null;
  /** Los últimos precios apuntados, del más antiguo al más nuevo. */
  prices: WishlistPrice[];
  trend: PriceTrend | null;
}

export interface WishlistSummary {
  currency: string;
  counts: {
    total: number;
    pending: number;
    purchased: number;
    purchasedInList: number;
    movedToWardrobe: number;
    unpriced: number;
    byStatus: Record<WishlistStatus, number>;
    byCategory: Record<WishlistCategory, number>;
  };
  money: {
    totalValue: number;
    spent: number;
    budget: number | null;
    saved: number;
    remaining: number | null;
    shortfall: number;
    progress: number | null;
    coverage: number | null;
    otherCurrencies: { currency: string; total: number; count: number }[];
  };
  /** Servicios de seguimiento de precios configurados (0: los precios los apuntas tú). */
  trackers: number;
}

export interface WishlistInput {
  name?: string;
  category?: WishlistCategory;
  garmentTypeId?: string;
  color?: string;
  brand?: string | null;
  size?: string | null;
  productUrl?: string | null;
  storeName?: string | null;
  notes?: string | null;
  photoAssetId?: string | null;
  imageUrl?: string | null;
  status?: WishlistStatus;
  targetPrice?: number | null;
  trackPrice?: boolean;
  wardrobeId?: string;
  /** Solo al crear: primer precio del historial. */
  price?: number;
  currency?: string;
}

// -----------------------------------------------------------------------------
// SNEAKER COLLECTION (ver Backend/src/sneakers)
// -----------------------------------------------------------------------------

export type SneakerBrand = 'NIKE' | 'JORDAN' | 'ADIDAS' | 'NEW_BALANCE' | 'ASICS' | 'PUMA' | 'SALOMON' | 'CONVERSE' | 'VANS' | 'OTHER';
export type SneakerCondition = 'DEADSTOCK' | 'LIKE_NEW' | 'GOOD' | 'WORN' | 'BEAT';
export type SneakerScope = 'owned' | 'wish';

export interface SneakerCard {
  brand: SneakerBrand;
  /** Nombre de la marca cuando brand = OTHER. */
  brandName: string | null;
  model: string;
  colorway: string | null;
  condition: SneakerCondition;
  /** Usos apuntados a mano. */
  wearCount: number;
}

export interface Sneaker extends Omit<WardrobeItem, 'sneaker'> {
  sneaker: SneakerCard & { brandLabel: string };
  photoAssetId: string | null;
  /** Nombre del color (para filtrar y para las estadísticas). */
  colorName: string;
  /** Usos: a mano + días del calendario marcados como usados. */
  uses: { manual: number; calendar: number; total: number };
  /** Outfits guardados que las llevan. */
  outfitCount: number;
  /** Prendas distintas con las que se han combinado. */
  partners: number;
  /** Solo en la wishlist. */
  currentPrice: string | null;
  targetPrice: string | null;
}

export interface SneakerInput {
  brand?: SneakerBrand;
  brandName?: string | null;
  model?: string;
  colorway?: string | null;
  condition?: SneakerCondition;
  wearCount?: number;
  size?: string | null;
  color?: string;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  currency?: string;
  storeName?: string | null;
  notes?: string | null;
  photoAssetId?: string | null;
  imageUrl?: string | null;
  garmentTypeId?: string;
  wardrobeId?: string;
  allowDuplicate?: boolean;
  // Solo al crear
  scope?: SneakerScope;
  price?: number;
  targetPrice?: number | null;
  productUrl?: string | null;
  wishStatus?: WishlistStatus;
}

/** Respuesta 409 al intentar guardar un par que ya tienes. */
export interface SneakerDuplicate {
  id: string;
  name: string;
  size: string | null;
  scope: SneakerScope;
}

export interface SneakerRankRow {
  id: string;
  name: string;
  label: string;
  model: string;
  colorway: string | null;
  color: string;
  uses: number;
  manual: number;
  calendar: number;
  outfits: number;
  partners: number;
}

export interface SneakerStats {
  total: number;
  wishlist: { count: number; value: { currency: string; total: number }[] };
  /** `tie`: cuántas comparten el primer puesto (1 = sin empate). */
  topBrand: { brand: SneakerBrand; label: string; count: number; share: number; tie: number } | null;
  brands: { brand: SneakerBrand; label: string; count: number; share: number }[];
  byBrand: { brand: SneakerBrand; label: string; count: number; share: number }[];
  topColor: { name: string; hex: string; count: number; share: number; tie: number } | null;
  colors: { name: string; hex: string; count: number; share: number }[];
  spent: { currency: string; total: number; count: number }[];
  unpriced: number;
  topModel: { brand: SneakerBrand; label: string; model: string; uses: number; pairs: number } | null;
  mostUsed: SneakerRankRow | null;
  leastUsed: SneakerRankRow | null;
  totalUses: number;
  byCondition: { condition: SneakerCondition; count: number }[];
  combos: SneakerRankRow[];
  neverCombined: number;
}

// --- STREETWEAR BATTLES ---

export type BattleStatus = 'PENDING' | 'ACTIVE' | 'FINISHED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
export type BattleSide = 'A' | 'B';
export type BattleTab = 'live' | 'open' | 'challenges' | 'mine' | 'finished';

export interface Battle {
  id: string;
  status: BattleStatus;
  theme: string | null;
  isOpen: boolean;
  challenger: UserBrief;
  opponent: UserBrief | null;
  /** Copias de los outfits: A = quien reta, B = quien responde. */
  outfitA: SharedOutfit;
  outfitB: SharedOutfit | null;
  /** Solo si ya votaste, si participas o si terminó. */
  votes: { a: number; b: number; shareA: number } | null;
  totalVotes: number;
  winner: BattleSide | null;
  mySide: BattleSide | null;
  myVote: BattleSide | null;
  canVote: boolean;
  voteBlock: 'own_battle' | 'not_active' | 'already_voted' | null;
  canAccept: boolean;
  canDecline: boolean;
  canCancel: boolean;
  expiresAt: string;
  startedAt: string | null;
  endsAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface BattleRecord {
  wins: number;
  losses: number;
  ties: number;
  played: number;
  votes: number;
  winRate: number;
}

export interface BattleSummary {
  challenges: number;
  live: number;
  myLive: number;
  record: BattleRecord & { userId: string };
  streak: number;
}

export interface LeaderEntry extends BattleRecord {
  userId: string;
  rank: number;
  user: UserBrief;
}

export interface Leaderboard {
  top: LeaderEntry[];
  me: BattleRecord & { userId: string; rank: number | null };
}

// --- STREET MARKET ---

export type ListingKind = 'SELL' | 'SWAP';
export type ListingStatus = 'ACTIVE' | 'RESERVED' | 'SOLD';
export type ListingCondition = 'NEW_WITH_TAGS' | 'LIKE_NEW' | 'GOOD' | 'FAIR';
export type MarketSort = 'new' | 'price_asc' | 'price_desc';

export interface ListingGarment {
  name: string;
  color: string;
  attributes: Attributes;
  customization: Customization;
  garmentType: GarmentTypeSummary;
}

export interface Listing {
  id: string;
  kind: ListingKind;
  title: string;
  description: string | null;
  category: WishlistCategory;
  brand: string | null;
  size: string | null;
  condition: ListingCondition;
  price: string | null;
  currency: string;
  city: string | null;
  swapFor: string | null;
  itemId: string | null;
  garment: ListingGarment | null;
  status: ListingStatus;
  photos: string[];
  seller: UserBrief;
  isMine: boolean;
  isFavorite: boolean;
  favorites: number;
  canContact: boolean;
  hiddenByAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListingInput {
  kind?: ListingKind;
  title?: string;
  description?: string | null;
  category?: WishlistCategory;
  brand?: string | null;
  size?: string | null;
  condition?: ListingCondition;
  price?: number | null;
  currency?: string;
  city?: string | null;
  swapFor?: string | null;
  photoAssetIds?: string[];
  itemId?: string;
  status?: ListingStatus;
}

export interface MarketQuery {
  scope?: 'all' | 'mine' | 'favorites';
  category?: WishlistCategory;
  kind?: ListingKind;
  condition?: ListingCondition;
  status?: ListingStatus;
  size?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sort?: MarketSort;
  page?: number;
  pageSize?: number;
}

export interface MarketSummary {
  active: number;
  reserved: number;
  sold: number;
  favorites: number;
  limit: number;
}
