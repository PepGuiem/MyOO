/**
 * Qué modelo 3D de la biblioteca corresponde a cada prenda según su tipo y su
 * corte. Hay dos colecciones de modelos, las dos disponibles:
 *
 * - «clásica» (prendas_3d_glb, en public/models/prendas): camisetas, sudadera
 *   con media cremallera, anorak, chaquetas, camisa, pantalones, ropa
 *   interior y gorra. Modeladas con los brazos a 44°.
 * - «punto» (prendas_punto_glb, en public/models/prendas/punto): sudadera de
 *   cuello redondo, camisetas de manga larga (con bolsillo y raglán),
 *   sudadera con capucha, jersey de cuello alto, camiseta, polo, oversize,
 *   cuello en V y tirantes. Modeladas con los brazos a 32°.
 * - «casual» (prendas_casual_glb, en public/models/prendas/casual): camisas
 *   de manga corta y larga cerradas, sobrecamisa, parka con capucha de pelo,
 *   chaqueta de chándal, bufanda y vaquero recto. Brazos a 32°. Traen
 *   botones, cremalleras, vivos y remaches como piezas aparte, que se
 *   colorean por separado (`colors`).
 * - «street» (prendas_street_glb, en public/models/prendas/street): sudadera
 *   oversize con capucha bajada, plumífero corto, chaleco acolchado, cargo
 *   baggy, vaqueros (baggy, clásico, skinny, slim, recto, wide leg, campana,
 *   bootcut, mom y boyfriend), pantalón corto de
 *   baloncesto, zapatillas de caña alta, gorro de punto, chaqueta varsity,
 *   cortavientos, pantalón paracaídas, gorras trucker, snapback, de cinco
 *   paneles y de pescador, y zapatillas de skate, chunky,
 *   running y slip-on. Brazos a 32°, con piezas aparte (cordones, cremallera,
 *   franjas, rejilla...).
 *
 * Por defecto, los cortes propios de la street (baggy, paracaídas, baloncesto,
 * plumífero, varsity, cortavientos, caña alta, skate, chunky, running,
 * slip-on, gorras trucker, snapback, cinco paneles y pescador, sudadera
 * oversize...) usan esa colección; el resto, la de punto
 * cuando tiene la prenda; si no, la casual y, si tampoco, la clásica.
 * El atributo «Modelo 3D» (model3d) de la prenda permite elegir colección o
 * pedir el modelo generado por código (que admite colores por pieza).
 *
 * - «camisetas» (prendas_street_glb/camisetas, en public/models/prendas/camisetas):
 *   11 camisetas pasadas por Blender (clásica, oversize, slim, boxy, crop,
 *   longline, baby tee, raglán con mangas aparte, pico, henley con botones y
 *   manga larga). Brazos a 32°. Sustituyen a todas las camisetas anteriores
 *   (de colección o por código), salvo sin manga, muscle y polo.
 *
 * - «sudaderas» (prendas_street_glb/sudaderas, en public/models/prendas/sudaderas):
 *   8 sudaderas de felpa pasadas por Blender (capucha, capucha oversize y crop,
 *   capucha con cremallera, cuello redondo, media y cuarto de cremallera y
 *   deportiva). Sustituyen a las anteriores; los jerséis de punto, no.
 *
 * - «camisas» (prendas_street_glb/camisas, en public/models/prendas/camisas):
 *   8 camisas de Blender (formal, oxford, oversize, lino, franela, vaquera,
 *   cubana y manga corta). Sustituyen a las anteriores salvo las sin manga.
 *
 * - «calzado» (prendas_calzado_glb/coleccion/glb, en public/models/prendas/calzado):
 *   8 zapatillas de Blender (SNK01-SNK08: pista de piel, caña alta de lona,
 *   running de malla, skate de ante, chunky, slip-on de denim, runner de punto
 *   y baloncesto de caña media), en par sobre los tobillos del cuerpo de
 *   referencia de 1,78 m como el resto de calzado. Cada pieza trae su papel
 *   (`secondary`, `trim`, `lace`, `sole`, `hardware`) y se tiñe aparte. Por
 *   defecto, las zapatillas usan esta colección (ver `footwearModel`).
 *
 * Pantalones largos: SOLO los 10 vaqueros hechos en Blender (street 19-28).
 * Todo pantalón usa la malla del corte más parecido con su color y su tejido
 * (chino, lana, felpa...), sin modelo generado por código y sin los antiguos
 * jogger, cargo, slim, vaquero recto, cargo baggy y paracaídas. Ver `pantsModel`.
 *
 * Sin dependencias de three.js, para poder usarlo en cualquier página.
 */
import type { Attributes } from '../api/types';
import { fabricFor } from './fabric';

/**
 * Zona del cuerpo que cubre el modelo: parte de arriba, de abajo, cabeza o el
 * maniquí entero ('body': tronco, brazos y piernas, sin holguras de prenda).
 */
export type LibraryRegion = 'upper' | 'lower' | 'head' | 'body';

export interface LibraryEntry {
  /** Ruta del archivo dentro de public/models/prendas (la versión ligera, en su lod/). */
  file: string;
  region: LibraryRegion;
  /** Holgura según el corte (1 = como se modeló). */
  fit: number;
  /** Ángulo de los brazos (grados desde la vertical) con que se modeló. */
  armDeg: number;
  /**
   * Colores de la personalización que tiene el modelo (piezas aparte: botones,
   * cremallera...). Sin valor, el modelo es de una sola pieza.
   */
  colors?: ('buttons' | 'zipper' | 'trim' | 'hardware' | 'stitching' | 'lining' | 'secondary' | 'sole' | 'laces')[];
  /** Piezas de la personalización que el modelo permite quitar (p. ej. los flecos). */
  parts?: string[];
  /** Papeles de malla que no se pintan (p. ej. los remaches de un pantalón que no es vaquero). */
  hidden?: string[];
  /**
   * Altura del bajo (m, en el cuerpo de referencia de 1,78 m) cuando el corte
   * es más corto que el modelo: boxy y cazadoras a la cintura, crop por
   * encima. Sin valor, el largo del modelo.
   */
  hemY?: number;
  /** Colocación sobre la cabeza del maniquí (gorras), ver `HeadFit` en libraryFit. */
  headFit?: HeadFit;
}

/**
 * Ajuste de una pieza de cabeza respecto a la cabeza de referencia: subirla
 * (m), escalar su anchura y su fondo, y moverla hacia atrás (m, negativo).
 */
export interface HeadFit {
  lift: number;
  sx: number;
  sz: number;
  dz: number;
}

/**
 * La gorra se modeló sobre una cabeza de referencia más baja y pequeña que la
 * del maniquí esculpido: sin esto quedaba a la altura de los ojos y la cabeza
 * asomaba por la copa. Así la visera queda sobre las cejas.
 */
const CAP_FIT: HeadFit = { lift: 0.04, sx: 1.07, sz: 1.1, dz: -0.005 };

/**
 * Alturas del bajo en el cuerpo de referencia (cintura natural a 1,10 m,
 * cadera a 0,92 m; la pretina de los pantalones de la biblioteca acaba a
 * ~1,02-1,03 m). Los modelos de arriba miden de 0,72 a 0,80 m (largo normal).
 */
export const HEM_HEIGHT = {
  /** Boxy: a la altura de la cintura, cubriendo justo la pretina. */
  waist: 1.0,
  /** Cazadoras (bomber, crop de chaqueta): la tira del bajo sobre la cadera alta. */
  jacket: 0.975,
  /** Chaqueta crop: a la cintura. */
  jacketCrop: 1.02,
  /** Sudadera o jersey crop: el elástico justo por encima de la cintura. */
  knitCrop: 1.08,
  /** Camiseta o camisa crop: por encima de la cintura (deja ver la pretina). */
  crop: 1.12,
};

/** Largo según el corte de una parte de arriba (camiseta, camisa, jersey). */
function topHem(fit: string | undefined, knit = false): number | undefined {
  if (fit === 'boxy') return HEM_HEIGHT.waist;
  if (fit === 'cropped') return knit ? HEM_HEIGHT.knitCrop : HEM_HEIGHT.crop;
  return undefined;
}

/** Holgura de cada corte respecto al modelo. */
const FIT_SCALE: Record<string, number> = {
  slim: 0.985,
  skinny: 0.97,
  jeggings: 0.97,
  regular: 1,
  relaxed: 1.045,
  boxy: 1.06,
  oversized: 1.09,
};

const str = (a: Attributes, k: string): string | undefined => (typeof a[k] === 'string' ? (a[k] as string) : undefined);

/**
 * Malla (vaquero hecho en Blender, colección street) para cada corte de
 * pantalón, también los que no son vaquero: el más parecido de los 10.
 */
const JEANS_BY_FIT: Record<string, string> = {
  regular: '20_vaquero_clasico.glb',
  skinny: '21_vaquero_skinny.glb',
  jeggings: '21_vaquero_skinny.glb',
  slim: '22_vaquero_slim.glb',
  tapered: '22_vaquero_slim.glb',
  carrot: '22_vaquero_slim.glb',
  jogger: '22_vaquero_slim.glb',
  straight: '23_vaquero_recto.glb',
  wide: '24_vaquero_wide_leg.glb',
  palazzo: '24_vaquero_wide_leg.glb',
  flare: '25_vaquero_flare.glb',
  bootcut: '26_vaquero_bootcut.glb',
  mom: '27_vaquero_mom.glb',
  barrel: '27_vaquero_mom.glb',
  boyfriend: '28_vaquero_boyfriend.glb',
  relaxed: '28_vaquero_boyfriend.glb',
  baggy: '19_vaquero_baggy.glb',
  oversized: '19_vaquero_baggy.glb',
  cargo: '19_vaquero_baggy.glb',
  parachute: '19_vaquero_baggy.glb',
};

/** Holgura extra de los cortes que comparten malla con otro más ajustado. */
const PANTS_EASE: Record<string, number> = {
  oversized: 1.03,
  palazzo: 1.04,
  jogger: 1.02,
  carrot: 1.02,
  parachute: 1.02,
};

/**
 * Pantalón largo: siempre un vaquero de Blender (aunque se haya pedido otra
 * colección o el modelo por código). Los remaches (malla `hardware`) salen
 * en los vaqueros; en el resto de tejidos, solo si se activan a mano.
 */
function pantsModel(attributes: Attributes, parts?: Record<string, boolean>): LibraryEntry {
  const fit = str(attributes, 'fit') ?? 'regular';
  const file = JEANS_BY_FIT[fit] ?? JEANS_BY_FIT.regular;
  const rivets = parts?.rivets;
  const showRivets = isDenim(attributes) ? rivets !== false : rivets === true;
  return {
    file: `street/${file}`,
    region: 'lower',
    fit: PANTS_EASE[fit] ?? 1,
    armDeg: 32,
    colors: ['hardware', 'trim'],
    parts: ['rivets'],
    hidden: showRivets ? undefined : ['hardware'],
  };
}

/** ¿Es un vaquero? El mismo tejido que usa el 3D (lo escrito en material o, si no, el del corte). */
const isDenim = (a: Attributes): boolean => fabricFor('pants', a) === 'denim';

type Collection = 'classic' | 'knit' | 'casual' | 'street' | 'footwear';

// La colección de calzado solo tiene zapatillas: en «auto» va primero; si se
// pide otra colección, queda como último recurso (p. ej. un estilo que la
// street no tiene).
const ORDER: Record<string, Collection[]> = {
  auto: ['footwear', 'street', 'knit', 'casual', 'classic'],
  footwear: ['footwear', 'street', 'knit', 'casual', 'classic'],
  knit: ['knit', 'casual', 'classic', 'street', 'footwear'],
  casual: ['casual', 'knit', 'classic', 'street', 'footwear'],
  classic: ['classic', 'casual', 'knit', 'street', 'footwear'],
  street: ['street', 'knit', 'casual', 'classic', 'footwear'],
};

/**
 * Modelo de la biblioteca para una prenda, o null si no hay uno que encaje
 * (o si se pidió el modelo generado por código). `parts` son las piezas de la
 * personalización: una camiseta de manga larga con bolsillo usa su modelo.
 */
/** ¿Es un modelo de Blender (vaqueros y camisetas)? Si no carga, no hay modelo por código de reserva. */
export function isBlenderModel(entry: LibraryEntry): boolean {
  return /^(camisetas|sudaderas|camisas|jerseis|chaquetas|abrigos|tops|formal)\//.test(entry.file) || /^street\/(19|2[0-8])_vaquero/.test(entry.file);
}

export function libraryModel(modelKey: string, attributes: Attributes, parts?: Record<string, boolean>): LibraryEntry | null {
  if (modelKey === 'pants') return pantsModel(attributes, parts);
  const pref = str(attributes, 'model3d') ?? 'auto';
  // Camisetas: solo las de Blender (también si se pidió otra colección o el
  // modelo por código). Sin manga, muscle y polo siguen con las otras
  // colecciones hasta que se hagan en Blender.
  if (modelKey === 'tshirt') {
    const tee = teeModel(attributes);
    if (tee) return tee;
  }
  // Sudaderas (felpa) y jerséis de punto: solo los de Blender.
  if (modelKey === 'sweater') {
    const sw = sweatModel(attributes) ?? jerseyModel(attributes);
    if (sw) return sw;
  }
  if (modelKey === 'shirt') {
    const sh = shirtModel(attributes);
    if (sh) return sh;
  }
  // Chaquetas (y americanas): solo las de Blender.
  if (modelKey === 'jacket') {
    const j = jacketModel(attributes);
    if (j) return j;
  }
  // Abrigos: solo los de Blender.
  if (modelKey === 'coat') return coatModel(attributes);
  // Tops (tirantes, body, corsé, halter, bandeau, chaleco): solo los de Blender.
  if (modelKey === 'top') return topModel(attributes);
  if (pref === 'procedural') return null;
  for (const c of ORDER[pref] ?? ORDER.auto) {
    const e =
      c === 'footwear'
        ? footwearModel(modelKey, attributes)
        : c === 'knit'
          ? knitModel(modelKey, attributes, parts, pref === 'knit')
          : c === 'casual'
            ? casualModel(modelKey, attributes)
            : c === 'street'
              ? streetModel(modelKey, attributes, pref === 'street')
              : classicModel(modelKey, attributes);
    if (e) return e;
  }
  return null;
}

/**
 * Camisetas de Blender: la del corte, la manga y el cuello más parecidos
 * (perkins, barco y redondo amplio usan la de cuello redondo). Sin manga,
 * muscle y polo no hay todavía: siguen con las otras colecciones.
 */
function teeModel(attributes: Attributes): LibraryEntry | null {
  const fit = str(attributes, 'fit') ?? 'regular';
  const sleeve = str(attributes, 'sleeve') ?? 'short';
  const neck = str(attributes, 'neckline') ?? 'crew';
  const tee = (file: string, colors?: LibraryEntry['colors'], f = 1): LibraryEntry => ({
    file: `camisetas/${file}`,
    region: 'upper',
    fit: f,
    armDeg: 32,
    colors,
  });
  // Polo, muscle y sin manga: colección «tops».
  const top = (file: string, colors?: LibraryEntry['colors'], f = 1): LibraryEntry => ({ ...tee(file, colors, f), file: `tops/${file}` });
  if (neck === 'polo') return top('04_polo.glb', ['buttons'], fit === 'slim' ? 0.985 : fit === 'relaxed' || fit === 'oversized' ? FIT_SCALE.relaxed : 1);
  if (fit === 'muscle') return top('03_camiseta_muscle.glb');
  if (sleeve === 'sleeveless') return top(fit === 'slim' ? '02_tirantes_canale.glb' : '01_camiseta_tirantes.glb', undefined, fit === 'relaxed' || fit === 'oversized' ? FIT_SCALE.relaxed : 1);
  if (sleeve === 'raglan' || sleeve === 'three_quarter') return tee('08_camiseta_raglan.glb', ['secondary']);
  if (sleeve === 'long') return tee('11_camiseta_manga_larga.glb', undefined, fit === 'relaxed' || fit === 'oversized' ? FIT_SCALE.relaxed : 1);
  if (neck === 'v_neck') return tee('09_camiseta_pico.glb', undefined, fit === 'slim' ? 0.985 : fit === 'relaxed' ? FIT_SCALE.relaxed : 1);
  if (neck === 'henley') return tee('10_camiseta_henley.glb', ['buttons'], fit === 'slim' ? 0.985 : 1);
  const byFit: Record<string, string> = {
    regular: '01_camiseta_clasica.glb',
    relaxed: '01_camiseta_clasica.glb',
    oversized: '02_camiseta_oversize.glb',
    slim: '03_camiseta_slim.glb',
    boxy: '04_camiseta_boxy.glb',
    cropped: '05_camiseta_crop.glb',
    longline: '06_camiseta_longline.glb',
    baby: '07_baby_tee.glb',
  };
  return tee(byFit[fit] ?? byFit.regular, undefined, fit === 'relaxed' ? FIT_SCALE.relaxed : 1);
}

/** Cuellos que solo tienen las sudaderas de felpa. */
const SWEAT_NECKS = ['hoodie', 'hoodie_zip', 'half_zip', 'quarter_zip', 'athletic'];

/**
 * ¿Es una sudadera (felpa) y no un jersey de punto? Por el cuello o, si es
 * redondo, porque el material es algodón o similar y no se eligió punto.
 */
export function isSweatshirt(attributes: Attributes): boolean {
  const neck = str(attributes, 'neckline') ?? 'crew';
  if (SWEAT_NECKS.includes(neck)) return true;
  if (neck !== 'crew' || str(attributes, 'knit')) return false;
  return /algod|cotton|felpa|fleece|poli/.test((str(attributes, 'material') ?? '').toLowerCase());
}

/** Sudaderas de Blender (colección «sudaderas»). */
function sweatModel(attributes: Attributes): LibraryEntry | null {
  if (!isSweatshirt(attributes)) return null;
  const fit = str(attributes, 'fit') ?? 'regular';
  const neck = str(attributes, 'neckline') ?? 'crew';
  const f = fit === 'slim' ? 0.97 : fit === 'relaxed' ? FIT_SCALE.relaxed : 1;
  const sw = (file: string, colors?: LibraryEntry['colors'], k = f): LibraryEntry => ({
    file: `sudaderas/${file}`,
    region: 'upper',
    fit: k,
    armDeg: 32,
    colors,
  });
  if (neck === 'hoodie') {
    if (fit === 'oversized') return sw('02_sudadera_capucha_oversize.glb', ['trim', 'hardware'], 1);
    if (fit === 'cropped') return sw('03_sudadera_capucha_crop.glb', ['trim', 'hardware'], 1);
    return sw('01_sudadera_capucha.glb', ['trim', 'hardware']);
  }
  if (neck === 'hoodie_zip') return sw('04_sudadera_cremallera.glb', ['trim', 'hardware', 'zipper']);
  if (neck === 'half_zip') return sw('06_sudadera_media_cremallera.glb', ['zipper']);
  if (neck === 'quarter_zip') return sw('07_sudadera_cuarto_cremallera.glb', ['zipper']);
  if (neck === 'athletic') return sw('08_sudadera_deportiva.glb');
  return sw('05_sudadera_cuello_redondo.glb', undefined, fit === 'oversized' ? 1.06 : f);
}

/**
 * Chaquetas de Blender (colección «chaquetas»): una por tipo; los tipos sin
 * modelo propio usan el más parecido (Harrington → bomber, campo y
 * sobrecamisa → utility, anorak y con capucha → cortavientos). Americana,
 * americana cruzada y chaqueta de traje, de la colección «formal».
 */
const JACKETS: Record<string, [string, LibraryEntry['colors']]> = {
  bomber: ['01_chaqueta_bomber.glb', ['zipper']],
  harrington: ['01_chaqueta_bomber.glb', ['zipper']],
  varsity: ['02_chaqueta_varsity.glb', ['secondary', 'trim', 'hardware']],
  denim: ['03_chaqueta_vaquera.glb', ['hardware']],
  leather: ['04_chaqueta_piel.glb', ['zipper', 'hardware']],
  biker: ['05_chaqueta_biker.glb', ['zipper', 'hardware']],
  puffer: ['06_plumifero.glb', ['zipper']],
  windbreaker: ['07_cortavientos.glb', ['secondary', 'zipper', 'trim', 'hardware']],
  anorak: ['07_cortavientos.glb', ['secondary', 'zipper', 'trim', 'hardware']],
  hooded: ['07_cortavientos.glb', ['secondary', 'zipper', 'trim', 'hardware']],
  track: ['08_chaqueta_chandal.glb', ['trim', 'zipper']],
  coach: ['09_chaqueta_coach.glb', ['hardware', 'trim']],
  fleece: ['10_forro_polar.glb', ['trim', 'zipper']],
  field: ['11_chaqueta_utility.glb', ['hardware', 'trim']],
  overshirt: ['11_chaqueta_utility.glb', ['hardware', 'trim']],
  puffer_vest: ['12_chaleco_acolchado.glb', ['zipper']],
  // formales (colección «formal»)
  blazer: ['formal/01_americana.glb', ['buttons']],
  blazer_db: ['formal/02_americana_cruzada.glb', ['buttons']],
  suit: ['formal/03_chaqueta_traje.glb', ['buttons']],
};

/** Altura del bajo de cada largo de abrigo (m sobre el suelo del cuerpo de referencia). */
const COAT_HEM: Record<string, number> = { hip: 0.8, thigh: 0.62, knee: 0.5, midi: 0.4 };

/**
 * Abrigos de Blender (colección «abrigos»): el modelo del tipo; si se pide más
 * corto que el modelo, se acorta el tronco (hemY); el abrigo recto o cruzado
 * maxi usa el abrigo largo y el plumífero por la cadera, el de las chaquetas.
 */
/** Tops de Blender (colección «tops»); el chaleco de vestir también es el de la americana. */
const TOPS: Record<string, [string, LibraryEntry['colors']]> = {
  tank: ['01_camiseta_tirantes.glb', undefined],
  ribbed_tank: ['02_tirantes_canale.glb', undefined],
  bodysuit: ['05_body.glb', ['hardware']],
  corset: ['06_corse.glb', ['trim', 'hardware']],
  halter: ['07_top_halter.glb', ['trim']],
  bandeau: ['08_top_bandeau.glb', undefined],
  waistcoat: ['09_chaleco_vestir.glb', ['buttons', 'secondary']],
  waistcoat_db: ['formal/04_chaleco_traje.glb', ['buttons', 'secondary']],
};

function topModel(attributes: Attributes): LibraryEntry | null {
  const style = str(attributes, 'style') ?? 'tank';
  const fit = str(attributes, 'fit') ?? 'regular';
  const hit = TOPS[style] ?? TOPS.tank;
  return {
    file: hit[0].includes('/') ? hit[0] : `tops/${hit[0]}`,
    region: 'upper',
    fit: fit === 'slim' ? 0.985 : fit === 'relaxed' ? FIT_SCALE.relaxed : 1,
    armDeg: 32,
    hemY: fit === 'cropped' && !['corset', 'bandeau', 'halter', 'bodysuit'].includes(style) ? HEM_HEIGHT.crop : undefined,
    colors: hit[1],
  };
}

function coatModel(attributes: Attributes): LibraryEntry | null {
  const style = str(attributes, 'style') ?? 'overcoat';
  const fit = str(attributes, 'fit') ?? 'regular';
  const length = str(attributes, 'length');
  const f = fit === 'slim' ? 0.975 : fit === 'relaxed' ? FIT_SCALE.relaxed : fit === 'oversized' ? 1.06 : 1;
  const coat = (file: string, modelHem: number, colors: LibraryEntry['colors'], dir = 'abrigos'): LibraryEntry => {
    const want = length ? COAT_HEM[length] : undefined;
    return {
      file: `${dir}/${file}`,
      region: 'upper',
      fit: f,
      armDeg: 32,
      hemY: want !== undefined && want > modelHem + 0.03 ? want : undefined,
      colors,
    };
  };
  switch (style) {
    case 'trench':
      return coat('01_gabardina.glb', 0.42, ['buttons', 'hardware']);
    case 'peacoat':
      return coat('05_chaqueton.glb', 0.7, ['buttons']);
    case 'parka':
    case 'raincoat':
      return coat('04_parka.glb', 0.6, ['trim', 'zipper', 'hardware']);
    case 'duffle':
      return coat('06_trenca.glb', 0.56, ['buttons', 'trim']);
    case 'puffer':
      if (length === 'hip') return coat('06_plumifero.glb', 0.86, ['zipper'], 'chaquetas');
      return coat('07_plumifero_largo.glb', 0.42, ['zipper']);
    case 'wrap':
    case 'cape':
      return coat('03_abrigo_largo.glb', 0.33, undefined);
    default:
      // Abrigo recto y car coat: el de lana; en midi o maxi, el largo.
      if (length === 'midi' || length === 'maxi') return coat('03_abrigo_largo.glb', 0.33, undefined);
      return coat('02_abrigo_lana.glb', 0.5, ['buttons']);
  }
}

/** Chaquetas de Blender que vienen con cremallera (las demás, con broches o botones). */
const JACKET_ZIP = new Set([
  '01_chaqueta_bomber.glb',
  '04_chaqueta_piel.glb',
  '05_chaqueta_biker.glb',
  '06_plumifero.glb',
  '07_cortavientos.glb',
  '08_chaqueta_chandal.glb',
  '10_forro_polar.glb',
  '12_chaleco_acolchado.glb',
]);

/**
 * Variante de la chaqueta según el «Cierre»: cada chaqueta de Blender tiene
 * también una versión abierta (_abierta) y otra con el cierre contrario
 * (_cremallera en las de broches, _botones en las de cremallera). Las
 * americanas (colección formal) solo se abrochan con botones.
 */
export function jacketClosureFile(file: string, closure: string | undefined): { file: string; extra?: 'zipper' | 'hardware' } {
  if (!closure || file.includes('/')) return { file };
  const zip = JACKET_ZIP.has(file);
  if (closure === 'open') return { file: file.replace(/\.glb$/, '_abierta.glb') };
  if (closure === 'zip' && !zip) return { file: file.replace(/\.glb$/, '_cremallera.glb'), extra: 'zipper' };
  if (closure === 'buttons' && zip) return { file: file.replace(/\.glb$/, '_botones.glb'), extra: 'hardware' };
  return { file };
}

function jacketModel(attributes: Attributes): LibraryEntry | null {
  const style = str(attributes, 'style') ?? 'bomber';
  const fit = str(attributes, 'fit') ?? 'regular';
  const hit = JACKETS[style];
  if (!hit) return null;
  const f = fit === 'slim' ? 0.975 : fit === 'relaxed' ? FIT_SCALE.relaxed : fit === 'oversized' ? 1.06 : 1;
  const variant = jacketClosureFile(hit[0], str(attributes, 'closure'));
  const colors = variant.extra && !(hit[1] ?? []).includes(variant.extra) ? [...(hit[1] ?? []), variant.extra] : hit[1];
  return {
    file: variant.file.includes('/') ? variant.file : `chaquetas/${variant.file}`,
    region: 'upper',
    fit: f,
    armDeg: 32,
    hemY: fit === 'cropped' ? HEM_HEIGHT.jacketCrop : undefined,
    colors,
  };
}

/**
 * Jerséis de punto de Blender (colección «jerseis»): por cuello, punto y corte.
 * Perkins usa el de cuello alto; el punto grueso o el corte oversize, el de
 * punto grueso; los ochos, el de trenzas.
 */
function jerseyModel(attributes: Attributes): LibraryEntry | null {
  const fit = str(attributes, 'fit') ?? 'regular';
  const neck = str(attributes, 'neckline') ?? 'crew';
  const knit = str(attributes, 'knit') ?? 'fine';
  const f = fit === 'slim' ? 0.975 : fit === 'relaxed' ? FIT_SCALE.relaxed : fit === 'oversized' ? 1.05 : 1;
  const jr = (file: string, colors?: LibraryEntry['colors'], k = f): LibraryEntry => ({
    file: `jerseis/${file}`,
    region: 'upper',
    fit: k,
    armDeg: 32,
    hemY: topHem(fit, true),
    colors,
  });
  if (neck === 'cardigan') return jr('04_cardigan.glb', ['buttons']);
  if (neck === 'vest') return jr('07_chaleco_punto.glb');
  if (neck === 'turtleneck' || neck === 'mock') return jr('03_jersey_cuello_alto.glb');
  if (neck === 'v_neck') return jr('02_jersey_pico.glb');
  if (knit === 'cable') return jr('05_jersey_ochos.glb');
  if (knit === 'chunky' || fit === 'oversized') return jr('06_jersey_oversize.glb', undefined, fit === 'oversized' ? 1 : 0.97);
  return jr('01_jersey_cuello_redondo.glb');
}

/**
 * Camisas de Blender (colección «camisas»): por cuello, manga, corte y tela.
 * Sin manga, la camisa sin mangas de la colección «tops».
 */
function shirtModel(attributes: Attributes): LibraryEntry | null {
  const fit = str(attributes, 'fit') ?? 'regular';
  const sleeve = str(attributes, 'sleeve') ?? 'long';
  const collarAttr = str(attributes, 'collar') ?? 'classic';
  const material = (str(attributes, 'material') ?? '').toLowerCase();
  const f = fit === 'slim' ? 0.985 : fit === 'relaxed' ? FIT_SCALE.relaxed : fit === 'boxy' ? FIT_SCALE.boxy : 1;
  if (sleeve === 'sleeveless') return { file: 'tops/10_camisa_sin_mangas.glb', region: 'upper', fit: f, armDeg: 32, hemY: topHem(fit), colors: ['buttons'] };
  const sh = (file: string, colors: LibraryEntry['colors'] = ['buttons'], k = f): LibraryEntry => ({
    file: `camisas/${file}`,
    region: 'upper',
    fit: k,
    armDeg: 32,
    hemY: topHem(fit),
    colors,
  });
  if (collarAttr === 'camp') return sh('07_camisa_cubana.glb');
  if (sleeve === 'short' || sleeve === 'three_quarter') return sh('08_camisa_manga_corta.glb');
  if (fit === 'oversized') return sh('03_camisa_oversize.glb', ['buttons'], 1);
  if (/vaquer|denim|tejan|chambray/.test(material)) return sh('06_camisa_vaquera.glb', ['hardware']);
  if (/franela|flannel|cuadros/.test(material)) return sh('05_camisa_franela.glb');
  if (/lino|linen/.test(material)) return sh('04_camisa_lino.glb');
  if (collarAttr === 'button_down' || /oxford/.test(material)) return sh('02_camisa_oxford.glb');
  return sh('01_camisa_formal.glb');
}

function scaleOf(attributes: Attributes): number {
  return FIT_SCALE[str(attributes, 'fit') ?? 'regular'] ?? 1;
}

/** Colección «punto» (brazos a 32°). */
function knitModel(modelKey: string, attributes: Attributes, parts: Record<string, boolean> | undefined, chosen: boolean): LibraryEntry | null {
  const fit = str(attributes, 'fit');
  const sleeve = str(attributes, 'sleeve');
  const neckline = str(attributes, 'neckline');
  const scale = scaleOf(attributes);
  const up = (file: string, f = scale, hemY = topHem(fit, modelKey === 'sweater')): LibraryEntry => ({ file: `punto/${file}`, region: 'upper', fit: f, armDeg: 32, hemY });
  switch (modelKey) {
    case 'tshirt': {
      if (fit === 'longline') return null;
      const long = sleeve === 'long' || sleeve === 'three_quarter' || sleeve === 'raglan';
      if (neckline === 'polo') return long || sleeve === 'sleeveless' ? null : up('07_polo.glb');
      if (neckline === 'v_neck') return long || sleeve === 'sleeveless' ? null : up('09_camiseta_cuello_v.glb');
      if (neckline && !['crew', 'scoop'].includes(neckline)) return null;
      if (sleeve === 'sleeveless' || fit === 'muscle') return up('10_camiseta_tirantes.glb', 1);
      if (sleeve === 'raglan') return up('04_camiseta_manga_larga_raglan.glb');
      // La de punto de manga larga lleva bolsillo: se usa si se pide esa
      // colección o si la camiseta tiene bolsillo; si no, la clásica (lisa).
      if (long) return parts?.chestPocket || chosen ? up('02_camiseta_manga_larga_bolsillo.glb') : null;
      if (fit === 'oversized') return up('08_camiseta_oversize.glb', 1);
      // Crop: recta y algo más holgada que la normal.
      return up('06_camiseta.glb', fit === 'cropped' ? FIT_SCALE.relaxed : scale);
    }
    case 'sweater': {
      const f = fit === 'cropped' || fit === 'longline' ? 1 : scale;
      if (neckline === 'hoodie') return up('03_sudadera_capucha.glb', f);
      if (neckline === 'turtleneck' || neckline === 'mock') return up('05_jersey_cuello_alto.glb', f);
      if (!neckline || neckline === 'crew') return up('01_sudadera_cuello_redondo.glb', f);
      return null;
    }
    default:
      return null;
  }
}

/** Pieza de la personalización que se puede quitar → papel de su malla en el modelo. */
export const LIBRARY_PART_ROLE: Record<string, string> = {
  rivets: 'hardware',
  fringe: 'trim',
  laces: 'lace',
  pullTab: 'trim',
  elasticSides: 'secondary',
  label: 'trim',
};

/** Colección «casual» (brazos a 32°), con piezas aparte. */
function casualModel(modelKey: string, attributes: Attributes): LibraryEntry | null {
  const fit = str(attributes, 'fit');
  const sleeve = str(attributes, 'sleeve');
  const style = str(attributes, 'style');
  const collarAttr = str(attributes, 'collar');
  const scale = scaleOf(attributes);
  const entry = (file: string, region: LibraryRegion, colors: LibraryEntry['colors'], f = scale, hemY?: number): LibraryEntry => ({
    file: `casual/${file}`,
    region,
    fit: f,
    armDeg: 32,
    hemY,
    colors,
  });
  switch (modelKey) {
    case 'shirt': {
      // Cuello Mao y cubano tienen otra forma: van por código.
      if (collarAttr === 'mandarin' || collarAttr === 'camp') return null;
      const f = fit === 'cropped' ? FIT_SCALE.relaxed : scale;
      if (sleeve === 'short') return entry('01_camisa_manga_corta.glb', 'upper', ['buttons'], f, topHem(fit));
      if (!sleeve || sleeve === 'long') return entry('02_camisa_manga_larga.glb', 'upper', ['buttons'], f, topHem(fit));
      return null;
    }
    case 'jacket': {
      const crop = fit === 'cropped' ? HEM_HEIGHT.jacketCrop : undefined;
      if (style === 'overshirt' || style === 'field') return entry('03_sobrecamisa.glb', 'upper', ['buttons'], scale, crop);
      if (style === 'track') return entry('05_chaqueta_chandal.glb', 'upper', ['trim', 'zipper'], scale, crop);
      return null;
    }
    case 'coat': {
      if (style !== 'parka') return null;
      const length = str(attributes, 'length');
      // Parka por la cadera o a medio muslo (el modelo); más larga, por código.
      if (length && !['hip', 'thigh'].includes(length)) return null;
      return entry('04_parka.glb', 'upper', ['trim', 'zipper', 'hardware'], scale, length === 'hip' ? 0.74 : undefined);
    }
    case 'scarf':
      return { ...entry('06_bufanda.glb', 'upper', ['trim'], 1), parts: ['fringe'] };
    // Gorra de seis paneles modelada sobre la cabeza esculpida: va directa a la
    // cabeza del maniquí (región 'head', sin ajustes). Snapback, trucker, cinco
    // paneles y pescador están en la colección street.
    case 'cap':
      if (style && !['baseball', 'dad'].includes(style)) return null;
      return { ...entry('11_gorra.glb', 'head', ['hardware'], 1) };
    // Calzado: el modelo va en los pies (región 'lower': sigue el eje de cada pierna).
    case 'sneakers':
      // Caña alta, running, chunky, skate y slip-on tienen modelo en la colección street.
      if (style && !['casual', 'court', 'skate'].includes(style)) return null;
      return { ...entry('08_zapatillas.glb', 'lower', ['sole', 'laces'], 1), parts: ['laces'] };
    case 'boots': {
      const shaft = str(attributes, 'shaft');
      if (shaft && shaft !== 'ankle') return null;
      if (style === 'chelsea' || style === 'dress') {
        return { ...entry('10_botas_chelsea.glb', 'lower', ['sole', 'secondary', 'trim'], 1), parts: ['pullTab'] };
      }
      if (!style || style === 'combat' || style === 'hiking') {
        return { ...entry('09_botas_cordones.glb', 'lower', ['sole', 'laces', 'hardware'], 1), parts: ['laces'] };
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Colección «street» (brazos a 32°), con piezas aparte. Sin elegirla, solo se
 * usa para los cortes que son suyos; elegida («Modelo 3D: Colección street»),
 * también para el resto de cortes de esa prenda.
 */
function streetModel(modelKey: string, attributes: Attributes, chosen: boolean): LibraryEntry | null {
  const fit = str(attributes, 'fit');
  const style = str(attributes, 'style');
  const scale = scaleOf(attributes);
  const entry = (file: string, region: LibraryRegion, colors: LibraryEntry['colors'], f = 1, hemY?: number): LibraryEntry => ({
    file: `street/${file}`,
    region,
    fit: f,
    armDeg: 32,
    hemY,
    colors,
  });
  switch (modelKey) {
    case 'sweater': {
      // Sudadera con capucha bajada, ancha y de hombro caído: es la oversize; más
      // ajustada si se elige la colección con otro corte.
      if (str(attributes, 'neckline') !== 'hoodie') return null;
      if (!chosen && fit !== 'oversized') return null;
      const f = fit === 'oversized' || fit === 'longline' ? 1 : fit === 'relaxed' ? 0.975 : 0.955;
      return entry('01_sudadera_oversize.glb', 'upper', ['trim', 'hardware'], f, fit === 'cropped' ? HEM_HEIGHT.knitCrop : undefined);
    }
    case 'jacket': {
      // El plumífero ya es corto (por la cadera alta); en crop, a la cintura.
      const crop = fit === 'cropped' ? HEM_HEIGHT.jacketCrop : undefined;
      if (style === 'puffer') return entry('02_plumifero_corto.glb', 'upper', ['zipper'], scale, crop);
      if (style === 'puffer_vest') return entry('03_chaleco_acolchado.glb', 'upper', ['zipper'], scale, crop);
      // Varsity: cuerpo de lana y mangas de piel (color secundario), rayas en el canalé.
      if (style === 'varsity') return entry('08_chaqueta_varsity.glb', 'upper', ['secondary', 'trim', 'hardware'], scale, crop);
      // Cortavientos de nailon con canesú de otro color.
      if (style === 'windbreaker') return entry('09_cortavientos.glb', 'upper', ['secondary', 'zipper'], scale, crop);
      return null;
    }
    case 'coat': {
      // Plumífero por la cadera; los largos van por código.
      const length = str(attributes, 'length');
      if (style !== 'puffer' || (length && length !== 'hip')) return null;
      return entry('02_plumifero_corto.glb', 'upper', ['zipper'], scale);
    }
    case 'shorts':
      if (fit === 'basketball' || chosen) return entry('05_shorts_baloncesto.glb', 'lower', ['trim']);
      return null;
    case 'sneakers': {
      const laced = (file: string): LibraryEntry => ({ ...entry(file, 'lower', ['sole', 'laces', 'secondary']), parts: ['laces'] });
      if (style === 'high_top') return laced('06_zapatillas_altas.glb');
      if (style === 'skate') return laced('15_zapatillas_skate.glb');
      if (style === 'chunky') return laced('16_zapatillas_chunky.glb');
      if (style === 'running') return laced('17_zapatillas_running.glb');
      // Slip-on: sin cordones, con elásticos a los lados (color secundario).
      if (style === 'slip_on') return entry('18_zapatillas_slip_on.glb', 'lower', ['sole', 'secondary']);
      return null;
    }
    // Gorras modeladas sobre la cabeza esculpida (como la casual): región 'head' sin ajustes.
    case 'cap':
      if (style === 'trucker') return entry('11_gorra_trucker.glb', 'head', ['secondary', 'hardware']);
      if (style === 'snapback') return entry('12_gorra_snapback.glb', 'head', ['hardware']);
      if (style === 'five_panel') return entry('13_gorra_cinco_paneles.glb', 'head', ['hardware']);
      if (style === 'bucket') return entry('14_gorro_pescador.glb', 'head', []);
      return null;
    // Gorro de punto modelado sobre la cabeza esculpida (como la gorra casual).
    case 'beanie':
      return { ...entry('07_gorro.glb', 'head', ['trim']), parts: ['label'] };
    default:
      return null;
  }
}

/**
 * Zapatillas de la colección «calzado» por tipo (atributo `style`): archivo,
 * piezas que se colorean aparte y si llevan cordones (que se pueden quitar).
 * Sin tipo, o «casual», la de pista (SNK01).
 */
export const FOOTWEAR_MODELS: Record<string, { file: string; colors: NonNullable<LibraryEntry['colors']>; laces: boolean }> = {
  court: { file: 'SNK01_CourtLow.glb', colors: ['secondary', 'trim', 'laces', 'sole'], laces: true },
  high_top: { file: 'SNK02_CanvasHigh.glb', colors: ['trim', 'laces', 'sole', 'hardware'], laces: true },
  running: { file: 'SNK03_RunningMesh.glb', colors: ['secondary', 'trim', 'laces', 'sole'], laces: true },
  skate: { file: 'SNK04_SkateSuede.glb', colors: ['secondary', 'trim', 'laces', 'sole', 'hardware'], laces: true },
  chunky: { file: 'SNK05_ChunkyRetro.glb', colors: ['secondary', 'trim', 'laces', 'sole'], laces: true },
  slip_on: { file: 'SNK06_SlipOnDenim.glb', colors: ['secondary', 'trim', 'sole'], laces: false },
  knit: { file: 'SNK07_KnitRunner.glb', colors: ['secondary', 'trim', 'laces', 'sole'], laces: true },
  mid_top: { file: 'SNK08_BasketMid.glb', colors: ['secondary', 'trim', 'laces', 'sole'], laces: true },
};

/** Escala en planta de las zapatillas de la colección «calzado» sobre el maniquí. */
export const FOOTWEAR_FIT = 1.09;

/** Colección «calzado» (zapatillas de Blender): modelo del tipo pedido. */
function footwearModel(modelKey: string, attributes: Attributes): LibraryEntry | null {
  if (modelKey !== 'sneakers') return null;
  const style = str(attributes, 'style') ?? 'court';
  const hit = FOOTWEAR_MODELS[style === 'casual' ? 'court' : style];
  if (!hit) return null;
  return {
    file: `calzado/${hit.file}`,
    // En los pies, siguiendo el eje de cada pierna (como el resto del calzado).
    region: 'lower',
    // Las zapatillas se modelaron a su tamaño real (unos 30,8 cm de largo) y el
    // pie del maniquí mide 28,6 cm: la puntera del pie asomaba por la de la
    // zapatilla. Un 9 % más (en planta, alrededor del tobillo) lo cubre con la
    // misma holgura que el resto del calzado de la biblioteca.
    fit: FOOTWEAR_FIT,
    armDeg: 32,
    colors: hit.colors,
    ...(hit.laces ? { parts: ['laces'] } : {}),
  };
}

/** Colección clásica (brazos a 44°). */
function classicModel(modelKey: string, attributes: Attributes): LibraryEntry | null {
  const fit = str(attributes, 'fit');
  const sleeve = str(attributes, 'sleeve');
  const style = str(attributes, 'style');
  const neckline = str(attributes, 'neckline');
  const scale = scaleOf(attributes);
  const up = (file: string, f = scale, hemY = topHem(fit, modelKey === 'sweater')): LibraryEntry => ({ file, region: 'upper', fit: f, armDeg: 44, hemY });
  const low = (file: string, f = scale): LibraryEntry => ({ file, region: 'lower', fit: f, armDeg: 44 });

  switch (modelKey) {
    case 'tshirt': {
      // Los modelos tienen cuello redondo: polo, henley, pico... van por código.
      if (neckline && !['crew', 'scoop'].includes(neckline)) return null;
      const cropScale = fit === 'cropped' ? FIT_SCALE.relaxed : scale;
      if (sleeve === 'sleeveless' || fit === 'muscle') return up('04_camiseta_sin_mangas.glb', 1);
      if (sleeve === 'long' || sleeve === 'three_quarter' || sleeve === 'raglan') return up('02_camiseta_manga_larga.glb', cropScale);
      if (fit === 'longline') return up('03_camiseta_larga.glb', 1);
      return up('01_camiseta.glb', cropScale);
    }
    case 'shirt':
      if (sleeve && sleeve !== 'long') return null;
      return up('09_camisa.glb', fit === 'cropped' ? FIT_SCALE.relaxed : scale);
    case 'sweater':
      return neckline === 'hoodie' || neckline === 'hoodie_zip'
        ? up('05_sudadera_capucha.glb', fit === 'cropped' || fit === 'longline' ? 1 : scale)
        : null;
    case 'jacket': {
      // La bomber es una cazadora: acaba en la cintura (tira elástica sobre la
      // cadera alta). En crop, todas a la cintura.
      const crop = fit === 'cropped' ? HEM_HEIGHT.jacketCrop : undefined;
      if (style === 'bomber') return up('08_bomber.glb', scale, crop ?? HEM_HEIGHT.jacket);
      if (style === 'anorak') return up('06_anorak.glb', scale, crop);
      if (style === 'hooded') return up('07_chaqueta_capucha.glb', scale, crop);
      return null;
    }
    case 'shorts':
      if (fit === 'cargo') return low('17_bermuda_cargo.glb', 1);
      if (fit === 'bike') return low('10_mallas_cortas.glb', 1);
      return null;
    case 'underwear':
      if (style === 'slip') return low('11_slip.glb', 1);
      if (style === 'boxer_long') return low('13_boxer_largo.glb', 1);
      return low('12_boxer_corto.glb', 1);
    case 'cap':
      if (style && !['baseball', 'dad'].includes(style)) return null;
      return { file: '18_gorra.glb', region: 'head', fit: 1, armDeg: 44, headFit: CAP_FIT };
    default:
      return null;
  }
}

/**
 * Separación de la delantera (m) de los modelos que vienen abiertos: se
 * pueden llevar cerrados, abiertos o desabrochados arriba.
 */
export const FRONT_GAP: Record<string, number> = {
  // (rutas dentro de public/models/prendas)
  '09_camisa.glb': 0.035,
  '08_bomber.glb': 0.05,
  '07_chaqueta_capucha.glb': 0.075,
  'casual/03_sobrecamisa.glb': 0.07,
  'casual/04_parka.glb': 0.11,
};

/**
 * Modelos con la capucha puesta (sobre la cabeza): se puede bajar a la
 * espalda. Las capuchas que vienen bajadas (parka, las generadas por código)
 * no se pueden subir.
 */
export const HOOD_UP = new Set(['punto/03_sudadera_capucha.glb', '05_sudadera_capucha.glb', '07_chaqueta_capucha.glb']);

/**
 * ¿Se puede aplicar esta opción de estilo a la prenda? Abrir o cerrar la
 * delantera solo funciona en los modelos con la delantera separada, y bajar
 * la capucha, en los que la traen puesta.
 */
export function stylingSupported(modelKey: string, attributes: Attributes, key: string, parts?: Record<string, boolean>): boolean {
  if (key !== 'front' && key !== 'hood') return true;
  const entry = libraryModel(modelKey, attributes, parts);
  if (!entry) return false;
  // Las chaquetas de Blender tienen versión abierta (ver jacketClosureFile).
  if (key === 'front') return entry.file in FRONT_GAP || entry.file.startsWith('chaquetas/');
  return HOOD_UP.has(entry.file);
}

/**
 * Chaqueta de Blender en un outfit: «Delantera abierta» usa su versión
 * abierta y «Cerrada», la de su cierre (aunque la prenda se guardara abierta).
 */
export function jacketForStyling<T extends { garmentType: { modelKey: string }; attributes?: Attributes | null; styling?: { front?: string } | null }>(g: T): T {
  const front = g.styling?.front;
  if (g.garmentType.modelKey !== 'jacket' || !front) return g;
  const attrs = { ...(g.attributes ?? {}) };
  const plain = { ...attrs };
  delete plain.closure;
  const base = libraryModel('jacket', plain);
  if (!base || !base.file.startsWith('chaquetas/')) return g;
  if (front === 'open' || front === 'top_open') attrs.closure = 'open';
  else if (attrs.closure === 'open') delete attrs.closure;
  return { ...g, attributes: attrs };
}
