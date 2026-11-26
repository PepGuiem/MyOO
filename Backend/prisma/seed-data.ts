/**
 * Datos de referencia y datos de demostración.
 *
 * Todo usa `upsert` con claves estables (code o ids fijos), así que el seed es
 * IDEMPOTENTE: ejecutarlo varias veces deja la base de datos en el mismo estado.
 *
 * - seedReferenceData(): planes, límites y tipos de prenda (los necesita la app
 *   y también los tests e2e).
 * - seedDemoData(): un usuario de demostración con armarios, prendas y outfits.
 */
import {
  LimitedResource,
  OutfitStyle,
  Prisma,
  PrismaClient,
  Season,
  SubscriptionStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';
import { GARMENT_TYPE_SEEDS } from './garment-catalog';

// ---------------------------------------------------------------------------
// Planes
// ---------------------------------------------------------------------------

interface PlanSeed {
  code: string;
  name: string;
  description: string;
  priceCents: number;
  /** Precio anual (0 = sin pago anual). Por defecto, 10 mensualidades. */
  annualPriceCents: number;
  isDefault: boolean;
  limits: Record<LimitedResource, { isUnlimited: boolean; maxCount: number }>;
}

export const PLAN_SEEDS: PlanSeed[] = [
  {
    code: 'FREE',
    name: 'Free',
    description: 'Para empezar: tu armario básico y tus primeros outfits.',
    priceCents: 0,
    annualPriceCents: 0,
    isDefault: true,
    limits: {
      WARDROBES: { isUnlimited: false, maxCount: 2 },
      WARDROBE_ITEMS: { isUnlimited: false, maxCount: 40 },
      OUTFITS: { isUnlimited: false, maxCount: 10 },
      MANNEQUINS: { isUnlimited: false, maxCount: 1 },
    },
  },
  {
    code: 'BASIC',
    name: 'Básico',
    description: 'Todo tu armario del día a día, con sitio de sobra.',
    priceCents: 199,
    annualPriceCents: 1990,
    isDefault: false,
    limits: {
      WARDROBES: { isUnlimited: false, maxCount: 3 },
      WARDROBE_ITEMS: { isUnlimited: false, maxCount: 120 },
      OUTFITS: { isUnlimited: false, maxCount: 40 },
      MANNEQUINS: { isUnlimited: false, maxCount: 2 },
    },
  },
  {
    code: 'PLUS',
    name: 'Plus',
    description:
      'Varias temporadas, maletas de viaje, muchos looks y maniquíes para toda la familia.',
    priceCents: 349,
    annualPriceCents: 3490,
    isDefault: false,
    limits: {
      WARDROBES: { isUnlimited: false, maxCount: 8 },
      WARDROBE_ITEMS: { isUnlimited: false, maxCount: 400 },
      OUTFITS: { isUnlimited: false, maxCount: 150 },
      MANNEQUINS: { isUnlimited: false, maxCount: 5 },
    },
  },
  {
    code: 'PREMIUM',
    name: 'Premium',
    description:
      'Sin límites: armarios, prendas, outfits y maniquíes ilimitados.',
    priceCents: 499,
    annualPriceCents: 4990,
    isDefault: false,
    limits: {
      WARDROBES: { isUnlimited: true, maxCount: 0 },
      WARDROBE_ITEMS: { isUnlimited: true, maxCount: 0 },
      OUTFITS: { isUnlimited: true, maxCount: 0 },
      MANNEQUINS: { isUnlimited: true, maxCount: 0 },
    },
  },
];

// ---------------------------------------------------------------------------
// Tipos de prenda y cortes: ver garment-catalog.ts
// ---------------------------------------------------------------------------

export { GARMENT_TYPE_SEEDS };

/** Planes, límites y tipos de prenda. Seguro de ejecutar muchas veces. */
export async function seedReferenceData(prisma: PrismaClient): Promise<void> {
  for (const p of PLAN_SEEDS) {
    // Si un admin editó el plan desde la web (customizedAt), el seed respeta
    // su nombre, descripción y precios; solo se asegura del plan por defecto.
    const existing = await prisma.plan.findUnique({
      where: { code: p.code },
      select: { customizedAt: true },
    });
    const content = {
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      annualPriceCents: p.annualPriceCents,
    };
    const plan = await prisma.plan.upsert({
      where: { code: p.code },
      create: { code: p.code, ...content, isDefault: p.isDefault },
      update: existing?.customizedAt
        ? { isDefault: p.isDefault }
        : { ...content, isDefault: p.isDefault },
    });

    for (const resource of Object.values(LimitedResource)) {
      const limit = p.limits[resource];
      await prisma.planLimit.upsert({
        where: { planId_resource: { planId: plan.id, resource } },
        create: { planId: plan.id, resource, ...limit },
        update: limit,
      });
    }
  }

  for (const g of GARMENT_TYPE_SEEDS) {
    const data = {
      name: g.name,
      category: g.category,
      modelKey: g.modelKey,
      sortOrder: g.sortOrder,
      attributeSchema: g.attributeSchema as unknown as Prisma.InputJsonValue,
    };
    await prisma.garmentType.upsert({
      where: { code: g.code },
      create: { code: g.code, ...data },
      update: data,
    });
  }
}

// ---------------------------------------------------------------------------
// Datos de demostración
// ---------------------------------------------------------------------------

/** Credenciales FICTICIAS solo para desarrollo local. */
export const DEMO_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'demo@myout.dev',
  password: 'Demo1234!',
  displayName: 'Demo',
};

const DEMO_SUBSCRIPTION_ID = '00000000-0000-4000-8000-000000000101';
const W_MAIN = '00000000-0000-4000-8000-000000000201';
const W_TRAVEL = '00000000-0000-4000-8000-000000000202';

export interface DemoItem {
  id: string;
  wardrobeId: string;
  type: string;
  name: string;
  color: string;
  size?: string;
  season: Season;
  attributes?: Record<string, string | number | boolean>;
  /** Personalización de ejemplo (validada igual que la de la API). */
  customization?: Record<string, unknown>;
}

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const DEMO_ITEMS: DemoItem[] = [
  {
    id: id(301),
    wardrobeId: W_MAIN,
    type: 'T_SHIRT',
    name: 'Camiseta básica blanca',
    color: '#E8E8E8',
    size: 'M',
    season: 'ALL_SEASON',
    attributes: {
      fit: 'regular',
      sleeve: 'short',
      neckline: 'crew',
      material: 'Algodón',
    },
  },
  {
    id: id(302),
    wardrobeId: W_MAIN,
    type: 'T_SHIRT',
    name: 'Camiseta negra',
    color: '#1C1C1E',
    size: 'M',
    season: 'ALL_SEASON',
    attributes: { fit: 'boxy', sleeve: 'short', neckline: 'crew' },
  },
  {
    id: id(303),
    wardrobeId: W_MAIN,
    type: 'SHIRT',
    name: 'Camisa Oxford azul',
    color: '#8FA6C1',
    size: 'M',
    season: 'SPRING',
    attributes: {
      sleeve: 'long',
      fit: 'regular',
      collar: 'button_down',
      material: 'Oxford',
    },
    customization: {
      colors: { buttons: '#F2EFE6', stitching: '#E8E8E8' },
      parts: { chestPocket: true },
      options: { buttonStyle: 'four_hole' },
      details: [
        {
          id: 'monograma',
          kind: 'embroidery',
          position: [-0.075, 1.3, 0.125],
          normal: [0, 0, 1],
          rotation: 0,
          size: 0.035,
          color: '#2B3445',
          text: 'MO',
          font: 'script',
        },
      ],
    },
  },
  {
    id: id(304),
    wardrobeId: W_MAIN,
    type: 'SWEATER',
    name: 'Jersey gris marengo',
    color: '#4A4A50',
    size: 'L',
    season: 'WINTER',
    attributes: { knit: 'chunky', neckline: 'crew', material: 'Lana' },
  },
  {
    id: id(305),
    wardrobeId: W_MAIN,
    type: 'PANTS',
    name: 'Vaquero oscuro',
    color: '#2B3445',
    size: '32',
    season: 'ALL_SEASON',
    attributes: {
      fit: 'straight',
      rise: 'mid',
      inseamCm: 81,
      material: 'Vaquero',
    },
    customization: {
      colors: { stitching: '#D9A441', hardware: '#B87333' },
      options: { metal: 'copper', stitchStyle: 'double' },
      parts: { coinPocket: true, rivets: true },
    },
  },
  {
    id: id(306),
    wardrobeId: W_MAIN,
    type: 'PANTS',
    name: 'Chino beige',
    color: '#C8B79A',
    size: '32',
    season: 'SPRING',
    attributes: { fit: 'tapered', length: 'ankle', material: 'Algodón' },
  },
  {
    id: id(307),
    wardrobeId: W_MAIN,
    type: 'SKIRT',
    name: 'Falda midi plisada',
    color: '#6B6B73',
    size: 'S',
    season: 'AUTUMN',
    attributes: { fit: 'pleated', length: 'midi' },
  },
  {
    id: id(308),
    wardrobeId: W_MAIN,
    type: 'DRESS',
    name: 'Vestido negro',
    color: '#151517',
    size: 'S',
    season: 'SUMMER',
    attributes: { fit: 'fit_and_flare', sleeve: 'sleeveless', length: 'midi' },
  },
  {
    id: id(309),
    wardrobeId: W_MAIN,
    type: 'JACKET',
    name: 'Chaqueta vaquera',
    color: '#5C7290',
    size: 'M',
    season: 'SPRING',
    attributes: {
      style: 'denim',
      closure: 'buttons',
      waterproof: false,
      material: 'Vaquero',
    },
    customization: {
      colors: { buttons: '#8C8C8C', stitching: '#D9A441' },
      options: { metal: 'gunmetal', buttonStyle: 'shank' },
      details: [
        {
          id: 'parche',
          kind: 'patch',
          position: [0.09, 1.31, 0.14],
          normal: [0, 0, 1],
          rotation: -0.1,
          size: 0.07,
          color: '#1C1C1E',
          secondaryColor: '#E8E8E8',
          text: 'MYOO',
          font: 'college',
          shape: 'shield',
        },
      ],
    },
  },
  {
    id: id(310),
    wardrobeId: W_MAIN,
    type: 'COAT',
    name: 'Abrigo largo carbón',
    color: '#2E2E33',
    size: 'M',
    season: 'WINTER',
    attributes: {
      style: 'overcoat',
      length: 'knee',
      waterproof: true,
      hooded: false,
      material: 'Lana',
    },
  },
  {
    id: id(311),
    wardrobeId: W_MAIN,
    type: 'SNEAKERS',
    name: 'Zapatillas blancas',
    color: '#F2F2F2',
    size: '42',
    season: 'ALL_SEASON',
    attributes: { style: 'court' },
  },
  {
    id: id(312),
    wardrobeId: W_MAIN,
    type: 'BOOTS',
    name: 'Botas Chelsea',
    color: '#3B2F2A',
    size: '42',
    season: 'AUTUMN',
    attributes: {
      style: 'chelsea',
      shaft: 'ankle',
      heel: 'block',
      waterproof: true,
      material: 'Piel',
    },
  },
  {
    id: id(313),
    wardrobeId: W_TRAVEL,
    type: 'SHORTS',
    name: 'Short de lino',
    color: '#A9A39A',
    size: 'M',
    season: 'SUMMER',
    attributes: { fit: 'relaxed', material: 'Lino' },
  },
  {
    id: id(314),
    wardrobeId: W_TRAVEL,
    type: 'T_SHIRT',
    name: 'Camiseta gris jaspeado',
    color: '#8E8E93',
    size: 'M',
    season: 'SUMMER',
    attributes: { sleeve: 'short', neckline: 'v_neck' },
  },
  {
    id: id(315),
    wardrobeId: W_TRAVEL,
    type: 'CAP',
    name: 'Gorra negra',
    color: '#202022',
    season: 'SUMMER',
  },
  {
    id: id(316),
    wardrobeId: W_TRAVEL,
    type: 'SNEAKERS',
    name: 'Zapatillas running',
    color: '#5A5A60',
    size: '42',
    season: 'ALL_SEASON',
    attributes: { style: 'running' },
  },
  // Prendas que usan los modelos 3D de la biblioteca (prendas_3d_glb)
  {
    id: id(317),
    wardrobeId: W_MAIN,
    type: 'SWEATER',
    name: 'Sudadera con capucha',
    color: '#3A3A3F',
    size: 'L',
    season: 'AUTUMN',
    attributes: { fit: 'regular', neckline: 'hoodie', material: 'Algodón' },
  },
  {
    id: id(318),
    wardrobeId: W_MAIN,
    type: 'PANTS',
    name: 'Jogger gris',
    color: '#8E8E93',
    size: 'M',
    season: 'ALL_SEASON',
    attributes: { fit: 'jogger', length: 'full' },
  },
  {
    id: id(319),
    wardrobeId: W_MAIN,
    type: 'JACKET',
    name: 'Bomber verde oliva',
    color: '#4B5320',
    size: 'M',
    season: 'SPRING',
    attributes: { style: 'bomber', closure: 'zip', waterproof: false },
  },
  // Colección casual (prendas_casual_glb): camisas, sobrecamisa, parka, chándal, bufanda y vaqueros
  {
    id: id(320),
    wardrobeId: W_MAIN,
    type: 'SHIRT',
    name: 'Camisa de cuadros',
    color: '#E9E4DA',
    size: 'M',
    season: 'SUMMER',
    attributes: {
      fit: 'regular',
      sleeve: 'short',
      collar: 'classic',
      material: 'Algodón',
    },
    customization: {
      colors: { buttons: '#3B2F2A', pattern: '#7A5A45', pattern2: '#B9A48A' },
      options: { pattern: 'check', patternSize: 'medium' },
    },
  },
  {
    id: id(321),
    wardrobeId: W_MAIN,
    type: 'T_SHIRT',
    name: 'Camiseta de rayas melocotón',
    color: '#F3E6D3',
    size: 'M',
    season: 'SUMMER',
    attributes: {
      fit: 'regular',
      sleeve: 'short',
      neckline: 'crew',
      material: 'Algodón',
    },
    customization: {
      colors: { pattern: '#E8A57A' },
      options: { pattern: 'stripes', patternSize: 'medium' },
    },
  },
  {
    id: id(322),
    wardrobeId: W_MAIN,
    type: 'JACKET',
    name: 'Sobrecamisa verde oliva',
    color: '#5B5E4A',
    size: 'M',
    season: 'AUTUMN',
    attributes: {
      style: 'overshirt',
      closure: 'buttons',
      waterproof: false,
      material: 'Algodón',
    },
    customization: { colors: { buttons: '#2E2E33' } },
  },
  {
    id: id(323),
    wardrobeId: W_MAIN,
    type: 'SCARF',
    name: 'Bufanda de cuadros',
    color: '#6B4A35',
    season: 'WINTER',
    attributes: { knit: 'chunky', material: 'Lana' },
    customization: {
      colors: { trim: '#6B4A35', pattern: '#C98A3A', pattern2: '#2E2420' },
      options: { pattern: 'tartan', patternSize: 'medium' },
    },
  },
  {
    id: id(324),
    wardrobeId: W_MAIN,
    type: 'COAT',
    name: 'Parka negra',
    color: '#1E1E21',
    size: 'M',
    season: 'WINTER',
    attributes: {
      style: 'parka',
      length: 'thigh',
      waterproof: true,
      hooded: true,
    },
    customization: {
      colors: { trim: '#C8B496', zipper: '#A7A6A2', hardware: '#5B5E63' },
    },
  },
  {
    id: id(325),
    wardrobeId: W_MAIN,
    type: 'JACKET',
    name: 'Chaqueta de chándal',
    color: '#1C1C1E',
    size: 'M',
    season: 'SPRING',
    attributes: { style: 'track', closure: 'zip', waterproof: false },
    customization: { colors: { trim: '#3E6B4C', zipper: '#3E6B4C' } },
  },
  {
    id: id(326),
    wardrobeId: W_MAIN,
    type: 'SHIRT',
    name: 'Camisa azul marino',
    color: '#1F2A44',
    size: 'M',
    season: 'ALL_SEASON',
    attributes: {
      fit: 'regular',
      sleeve: 'long',
      collar: 'classic',
      material: 'Popelín',
    },
    customization: { colors: { buttons: '#151517' } },
  },
  {
    id: id(327),
    wardrobeId: W_MAIN,
    type: 'SWEATER',
    name: 'Sudadera retro',
    color: '#22305A',
    size: 'M',
    season: 'AUTUMN',
    attributes: { fit: 'regular', neckline: 'crew', material: 'Algodón' },
    customization: {
      colors: { pattern: '#D9578C', pattern2: '#3FB8A8' },
      options: { pattern: 'retro', patternSize: 'large' },
    },
  },
  {
    id: id(328),
    wardrobeId: W_MAIN,
    type: 'SWEATER',
    name: 'Sudadera azul',
    color: '#2F6FD1',
    size: 'M',
    season: 'AUTUMN',
    attributes: { fit: 'regular', neckline: 'crew', material: 'Algodón' },
  },
  {
    id: id(329),
    wardrobeId: W_MAIN,
    type: 'T_SHIRT',
    name: 'Camiseta de rayas azul',
    color: '#F4F6F8',
    size: 'M',
    season: 'SUMMER',
    attributes: {
      fit: 'relaxed',
      sleeve: 'short',
      neckline: 'crew',
      material: 'Algodón',
    },
    customization: {
      colors: { pattern: '#8DB6DC' },
      options: { pattern: 'stripes', patternSize: 'small' },
    },
  },
  {
    id: id(330),
    wardrobeId: W_MAIN,
    type: 'SWEATER',
    name: 'Jersey gris claro',
    color: '#A3A5AA',
    size: 'M',
    season: 'WINTER',
    attributes: {
      fit: 'regular',
      knit: 'fine',
      neckline: 'crew',
      material: 'Lana',
    },
  },
  {
    id: id(331),
    wardrobeId: W_MAIN,
    type: 'PANTS',
    name: 'Vaquero claro',
    color: '#7E9CC0',
    size: '32',
    season: 'SUMMER',
    attributes: { fit: 'straight', rise: 'mid', material: 'Vaquero' },
  },
  {
    id: id(332),
    wardrobeId: W_MAIN,
    type: 'PANTS',
    name: 'Vaquero gris',
    color: '#6E7177',
    size: '32',
    season: 'AUTUMN',
    attributes: { fit: 'straight', rise: 'mid', material: 'Vaquero' },
  },
  {
    id: id(333),
    wardrobeId: W_MAIN,
    type: 'PANTS',
    name: 'Vaquero negro',
    color: '#232326',
    size: '32',
    season: 'ALL_SEASON',
    attributes: { fit: 'straight', rise: 'mid', material: 'Vaquero' },
    customization: { colors: { stitching: '#4A4A50' } },
  },
  {
    id: id(335),
    wardrobeId: W_MAIN,
    type: 'T_SHIRT',
    name: 'Camiseta gris antracita',
    color: '#2A2A2E',
    size: 'M',
    season: 'ALL_SEASON',
    attributes: {
      fit: 'regular',
      sleeve: 'short',
      neckline: 'crew',
      material: 'Algodón',
    },
  },
  {
    id: id(334),
    wardrobeId: W_MAIN,
    type: 'BOOTS',
    name: 'Botas de cordones marrones',
    color: '#7A5233',
    size: '42',
    season: 'WINTER',
    attributes: {
      style: 'combat',
      shaft: 'ankle',
      heel: 'flat',
      material: 'Piel',
    },
  },
  // Colección street (prendas_street_glb). El plan gratuito admite 40 prendas: el
  // chaleco, el pantalón de baloncesto y el gorro se pueden crear desde la web.
  {
    id: id(336),
    wardrobeId: W_MAIN,
    type: 'SWEATER',
    name: 'Sudadera oversize gris',
    color: '#8E8E93',
    size: 'L',
    season: 'AUTUMN',
    attributes: { fit: 'oversized', neckline: 'hoodie', material: 'Algodón' },
    customization: { colors: { trim: '#E8E8E8' }, options: { metal: 'black' } },
  },
  {
    id: id(337),
    wardrobeId: W_MAIN,
    type: 'JACKET',
    name: 'Plumífero negro',
    color: '#1C1C1E',
    size: 'M',
    season: 'WINTER',
    attributes: {
      style: 'puffer',
      fit: 'regular',
      closure: 'zip',
      waterproof: true,
    },
    customization: {
      colors: { zipper: '#2A2A2E' },
      options: { metal: 'black' },
    },
  },
  {
    id: id(338),
    wardrobeId: W_MAIN,
    type: 'PANTS',
    name: 'Cargo baggy',
    color: '#4A4A42',
    size: '32',
    season: 'ALL_SEASON',
    attributes: {
      fit: 'baggy',
      rise: 'mid',
      length: 'full',
      material: 'Algodón',
    },
  },
  {
    id: id(339),
    wardrobeId: W_MAIN,
    type: 'SNEAKERS',
    name: 'Zapatillas altas',
    color: '#F2F2F2',
    size: '42',
    season: 'ALL_SEASON',
    attributes: { style: 'high_top' },
    customization: { colors: { secondary: '#1C1C1E', sole: '#F2F2F2' } },
  },
];

interface DemoOutfit {
  id: string;
  name: string;
  description?: string;
  occasion?: string;
  season?: Season;
  items: string[];
  /** Cómo se lleva cada prenda (por id). Ver src/outfits/styling.ts. */
  styling?: Record<string, Record<string, string>>;
  /** Estilo (etiqueta de la página de outfits). */
  style?: OutfitStyle;
  /** Favorito al crearlo (si ya existe no se toca: es cosa del usuario). */
  favorite?: boolean;
}

export const DEMO_OUTFITS: DemoOutfit[] = [
  {
    id: id(401),
    style: 'MINIMAL',
    name: 'Diario minimal',
    occasion: 'Diario',
    season: 'ALL_SEASON',
    items: [id(301), id(305), id(311)],
    styling: { [id(301)]: { tuck: 'half' }, [id(305)]: { hem: 'cuffed' } },
  },
  {
    id: id(402),
    style: 'OLD_MONEY',
    name: 'Oficina',
    occasion: 'Trabajo',
    season: 'SPRING',
    items: [id(303), id(306), id(312)],
    styling: {
      [id(303)]: { tuck: 'in', sleeves: 'rolled', front: 'top_open' },
    },
  },
  {
    id: id(403),
    style: 'STREETWEAR',
    favorite: true,
    name: 'Invierno urbano',
    occasion: 'Diario',
    season: 'WINTER',
    items: [id(304), id(305), id(310), id(312)],
  },
  {
    id: id(405),
    style: 'CASUAL',
    name: 'Fin de semana',
    occasion: 'Diario',
    season: 'AUTUMN',
    items: [id(317), id(318), id(311), id(315)],
    styling: {
      [id(317)]: { sleeves: 'pushed', hood: 'down' },
      [id(315)]: { visor: 'backward' },
    },
  },
  {
    id: id(404),
    style: 'CASUAL',
    name: 'Verano de viaje',
    description: 'Ligero y cómodo',
    occasion: 'Viaje',
    season: 'SUMMER',
    items: [id(314), id(313), id(316), id(315)],
  },
  // Looks de la colección casual (el plan gratuito admite 10 outfits: el resto de
  // prendas de la colección quedan en el armario para combinarlas).
  {
    id: id(406),
    style: 'CASUAL',
    name: 'Cuadros de verano',
    occasion: 'Diario',
    season: 'SUMMER',
    items: [id(320), id(331), id(311)],
  },
  {
    id: id(407),
    style: 'MINIMAL',
    name: 'Rayas y vaquero',
    occasion: 'Diario',
    season: 'SPRING',
    items: [id(321), id(305), id(311)],
  },
  {
    id: id(408),
    style: 'GRUNGE',
    favorite: true,
    name: 'Capas de otoño',
    occasion: 'Diario',
    season: 'AUTUMN',
    items: [id(335), id(322), id(323), id(332), id(334)],
    styling: { [id(322)]: { front: 'open' } },
  },
  {
    id: id(409),
    style: 'STREETWEAR',
    name: 'Parka de invierno',
    occasion: 'Diario',
    season: 'WINTER',
    items: [id(335), id(324), id(305), id(334)],
    styling: { [id(324)]: { front: 'open' } },
  },
  {
    id: id(410),
    style: 'TRAP',
    favorite: true,
    name: 'Chándal urbano',
    occasion: 'Diario',
    season: 'SPRING',
    items: [id(325), id(333), id(311)],
  },
];

export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  const freePlan = await prisma.plan.findUniqueOrThrow({
    where: { code: 'FREE' },
  });
  const types = await prisma.garmentType.findMany();
  const typeIdByCode = new Map(types.map((t) => [t.code, t.id]));

  const existing = await prisma.user.findUnique({
    where: { id: DEMO_USER.id },
  });
  if (!existing) {
    await prisma.user.create({
      data: {
        id: DEMO_USER.id,
        email: DEMO_USER.email,
        displayName: DEMO_USER.displayName,
        passwordHash: await argon2.hash(DEMO_USER.password, {
          type: argon2.argon2id,
        }),
      },
    });
  }

  await prisma.subscription.upsert({
    where: { id: DEMO_SUBSCRIPTION_ID },
    create: {
      id: DEMO_SUBSCRIPTION_ID,
      userId: DEMO_USER.id,
      planId: freePlan.id,
      status: SubscriptionStatus.ACTIVE,
    },
    update: {},
  });

  // Maniquí con medidas reales (el plan gratuito permite uno).
  const demoMannequin = {
    name: 'Mis medidas',
    sex: 'male',
    measures: {
      heightCm: 180,
      shoulderCm: 45,
      chestCm: 98,
      waistCm: 82,
      hipCm: 96,
      armCm: 31,
    },
  };
  await prisma.mannequin.upsert({
    where: { userId_name: { userId: DEMO_USER.id, name: demoMannequin.name } },
    create: { userId: DEMO_USER.id, ...demoMannequin },
    update: { sex: demoMannequin.sex, measures: demoMannequin.measures },
  });

  const wardrobes = [
    {
      id: W_MAIN,
      name: 'Armario principal',
      description: 'Lo de todos los días',
    },
    {
      id: W_TRAVEL,
      name: 'Maleta de viaje',
      description: 'Prendas para escapadas',
    },
  ];
  for (const w of wardrobes) {
    await prisma.wardrobe.upsert({
      where: { id: w.id },
      create: { ...w, userId: DEMO_USER.id },
      update: { name: w.name, description: w.description },
    });
  }

  for (const item of DEMO_ITEMS) {
    const garmentTypeId = typeIdByCode.get(item.type);
    if (!garmentTypeId) throw new Error(`Unknown garment type ${item.type}`);
    const data = {
      wardrobeId: item.wardrobeId,
      garmentTypeId,
      name: item.name,
      color: item.color,
      size: item.size ?? null,
      season: item.season,
      attributes: (item.attributes ?? {}) as Prisma.InputJsonValue,
      customization: (item.customization ?? {}) as Prisma.InputJsonValue,
    };
    await prisma.wardrobeItem.upsert({
      where: { id: item.id },
      create: { id: item.id, userId: DEMO_USER.id, ...data },
      update: data,
    });
  }

  for (const o of DEMO_OUTFITS) {
    // Transacción: el outfit y sus prendas se guardan juntos o no se guardan.
    await prisma.$transaction([
      prisma.outfit.upsert({
        where: { id: o.id },
        create: {
          id: o.id,
          userId: DEMO_USER.id,
          name: o.name,
          description: o.description ?? null,
          occasion: o.occasion ?? null,
          season: o.season ?? null,
          style: o.style ?? null,
          isFavorite: o.favorite ?? false,
        },
        update: {
          style: o.style ?? null,
          name: o.name,
          description: o.description ?? null,
          occasion: o.occasion ?? null,
          season: o.season ?? null,
        },
      }),
      prisma.outfitItem.deleteMany({ where: { outfitId: o.id } }),
      prisma.outfitItem.createMany({
        data: o.items.map((wardrobeItemId, position) => ({
          userId: DEMO_USER.id,
          outfitId: o.id,
          wardrobeItemId,
          position,
          styling: o.styling?.[wardrobeItemId] ?? {},
        })),
      }),
    ]);
  }
}
