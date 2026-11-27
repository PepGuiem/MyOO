/**
 * Catálogo de tipos de prenda y de CORTES disponibles.
 *
 * Los cortes son una lista cerrada (el usuario elige, no escribe), recopilada
 * de guías de moda y de tiendas:
 *  - Pantalones/vaqueros: guía de tipos de vaqueros de C&A y guía de fits de COS
 *    (skinny, slim, straight, tapered, bootcut, flare, wide leg, mom, boyfriend,
 *    barrel, jeggings...).
 *  - Camisetas/camisas: guía de fits de COS y de Armani Exchange
 *    (slim, regular, relaxed, oversize, boxy, crop...).
 *  - Vestidos: guía de formas de vestido de C&A (cruzado, camisero, bodycon,
 *    evasé, línea A, tipo camiseta) + imperio, sirena, lencero, babydoll...
 *  - Abrigos y chaquetas: guía de tipos de abrigo de ¡HOLA! (trench, car coat,
 *    chesterfield, biker, bomber, chaqueta de campo, capa, anorak...).
 *
 * IMPORTANTE: los `value` son identificadores estables guardados en la base de
 * datos. Se pueden añadir opciones nuevas, pero no conviene renombrar ni borrar
 * las existentes (las prendas ya guardadas dejarían de validar al editarlas).
 */
import type { GarmentCategory } from '@prisma/client';
import type {
  AttributeField,
  AttributeSchema,
  EnumOption,
} from '../src/garment-types/attribute-schema';

const opts = (...pairs: [string, string][]): EnumOption[] =>
  pairs.map(([value, label]) => ({ value, label }));

const enumField = (label: string, ...pairs: [string, string][]): AttributeField => ({
  type: 'enum',
  label,
  options: opts(...pairs),
});

const material: AttributeField = { type: 'string', label: 'Material', maxLength: 60 };
const brand: AttributeField = { type: 'string', label: 'Marca', maxLength: 60 };
const waterproof: AttributeField = { type: 'boolean', label: 'Impermeable' };

// ---------------------------------------------------------------------------
// Cortes por familia de prenda
// ---------------------------------------------------------------------------

/** Camisetas y polos. */
const topFit = enumField(
  'Corte',
  ['slim', 'Slim (ajustado)'],
  ['regular', 'Regular'],
  ['relaxed', 'Relaxed (holgado)'],
  ['oversized', 'Oversize'],
  ['boxy', 'Boxy (recto y corto)'],
  ['cropped', 'Crop (corto)'],
  ['longline', 'Longline (largo)'],
  ['muscle', 'Muscle (sisa amplia)'],
);

/** Camisetas: los cortes de arriba más la baby tee. */
const tshirtFit = enumField(
  'Corte',
  ['slim', 'Slim (ajustado)'],
  ['regular', 'Regular'],
  ['relaxed', 'Relaxed (holgado)'],
  ['oversized', 'Oversize'],
  ['boxy', 'Boxy (recto y corto)'],
  ['cropped', 'Crop (corto)'],
  ['longline', 'Longline (largo)'],
  ['muscle', 'Muscle (sisa amplia)'],
  ['baby', 'Baby tee (corta y ceñida)'],
);

/** Camisas y sobrecamisas. */
const shirtFit = enumField(
  'Corte',
  ['slim', 'Slim (entallado)'],
  ['regular', 'Regular (clásico)'],
  ['relaxed', 'Relaxed (holgado)'],
  ['oversized', 'Oversize'],
  ['boxy', 'Boxy (recto y corto)'],
  ['cropped', 'Crop (corto)'],
);

/** Jerséis y sudaderas. */
const knitFit = enumField(
  'Corte',
  ['slim', 'Slim (ajustado)'],
  ['regular', 'Regular'],
  ['relaxed', 'Relaxed (holgado)'],
  ['oversized', 'Oversize'],
  ['cropped', 'Crop (corto)'],
  ['longline', 'Longline (largo)'],
);

/** Pantalones: forma de la pernera. */
const pantsFit = enumField(
  'Corte',
  ['skinny', 'Skinny (pitillo)'],
  ['jeggings', 'Jegging (elástico)'],
  ['slim', 'Slim'],
  ['straight', 'Straight (recto)'],
  ['regular', 'Regular'],
  ['tapered', 'Tapered (estrecho al tobillo)'],
  ['carrot', 'Carrot (zanahoria)'],
  ['relaxed', 'Relaxed (holgado)'],
  ['mom', 'Mom'],
  ['boyfriend', 'Boyfriend'],
  ['barrel', 'Barrel (curvo)'],
  ['bootcut', 'Bootcut (campana ligera)'],
  ['flare', 'Flare (campana)'],
  ['wide', 'Wide leg (pierna ancha)'],
  ['palazzo', 'Palazzo'],
  ['baggy', 'Baggy'],
  ['parachute', 'Paracaídas (nailon, tobillo fruncido)'],
  ['oversized', 'Oversize'],
  ['cargo', 'Cargo'],
  ['jogger', 'Jogger (con puño)'],
);

const pantsLength = enumField(
  'Largo',
  ['full', 'Completo'],
  ['ankle', 'Tobillero'],
  ['cropped', 'Pirata (capri)'],
);

const shortsFit = enumField(
  'Corte',
  ['slim', 'Slim'],
  ['regular', 'Regular'],
  ['relaxed', 'Relaxed (holgado)'],
  ['wide', 'Ancho'],
  ['oversized', 'Oversize'],
  ['cargo', 'Cargo'],
);

const skirtFit = enumField(
  'Corte',
  ['pencil', 'Lápiz / tubo'],
  ['straight', 'Recta'],
  ['a_line', 'Línea A'],
  ['flared', 'Evasé / de vuelo'],
  ['circle', 'Capa (circular)'],
  ['pleated', 'Plisada'],
  ['wrap', 'Cruzada'],
  ['tiered', 'De volantes (por capas)'],
  ['mermaid', 'Sirena'],
  ['balloon', 'Globo'],
  ['asymmetric', 'Asimétrica'],
  ['slip', 'Lencera (al bies)'],
);

const dressFit = enumField(
  'Corte',
  ['fit_and_flare', 'Evasé (fit & flare)'],
  ['a_line', 'Línea A'],
  ['bodycon', 'Bodycon (ajustado)'],
  ['sheath', 'Recto entallado (funda)'],
  ['shift', 'Recto suelto (shift)'],
  ['wrap', 'Cruzado'],
  ['shirt', 'Camisero'],
  ['tshirt', 'Tipo camiseta'],
  ['slip', 'Lencero (slip)'],
  ['empire', 'Imperio'],
  ['babydoll', 'Babydoll'],
  ['mermaid', 'Sirena'],
  ['tiered', 'De volantes'],
);

const outerFit = enumField(
  'Corte',
  ['slim', 'Slim (entallado)'],
  ['regular', 'Regular'],
  ['oversized', 'Oversize'],
  ['cropped', 'Crop (corto)'],
);

const jacketStyle = enumField(
  'Tipo',
  ['bomber', 'Bomber'],
  ['biker', 'Biker / perfecto'],
  ['leather', 'De piel (racer, cuello alto)'],
  ['denim', 'Cazadora vaquera'],
  ['blazer', 'Americana / blazer'],
  ['blazer_db', 'Americana cruzada'],
  ['suit', 'Chaqueta de traje'],
  ['harrington', 'Harrington'],
  ['field', 'Chaqueta de campo'],
  ['overshirt', 'Sobrecamisa'],
  ['puffer', 'Acolchada / plumífero corto'],
  ['windbreaker', 'Cortavientos'],
  ['varsity', 'Universitaria (varsity)'],
  ['anorak', 'Anorak (cerrado, media cremallera)'],
  ['hooded', 'Con capucha (abierta)'],
  ['track', 'Chándal (cremallera y vivos)'],
  ['coach', 'Coach (broches y cordón)'],
  ['fleece', 'Forro polar'],
  ['puffer_vest', 'Chaleco acolchado'],
);

const coatStyle = enumField(
  'Tipo',
  ['overcoat', 'Abrigo recto (chesterfield)'],
  ['trench', 'Gabardina (trench)'],
  ['peacoat', 'Chaquetón marinero (caban)'],
  ['parka', 'Parka'],
  ['puffer', 'Plumífero'],
  ['duffle', 'Trenca'],
  ['wrap', 'Abrigo cruzado (batín)'],
  ['car_coat', 'Car coat (corto)'],
  ['raincoat', 'Chubasquero'],
  ['cape', 'Capa'],
);

const coatLength = enumField(
  'Largo',
  ['hip', 'Cadera'],
  ['thigh', 'Medio muslo'],
  ['knee', 'Rodilla'],
  ['midi', 'Midi'],
  ['maxi', 'Maxi'],
);

/**
 * Qué modelo 3D usa la prenda en la web (Frontend/src/three/libraryCatalog.ts).
 * "Automático" elige la colección de punto si tiene esa prenda y, si no, la
 * clásica; "Generado por código" admite colores por pieza.
 */
const model3dBoth = enumField(
  'Modelo 3D',
  ['auto', 'Automático'],
  ['knit', 'Colección punto'],
  ['classic', 'Colección clásica'],
  ['procedural', 'Generado por código (colores por pieza)'],
);
const model3dClassic = enumField(
  'Modelo 3D',
  ['auto', 'Automático'],
  ['procedural', 'Generado por código (colores por pieza)'],
);
/** Jerséis y sudaderas: además, la colección street (sudadera oversize con capucha). */
const model3dSweater = enumField(
  'Modelo 3D',
  ['auto', 'Automático'],
  ['knit', 'Colección punto'],
  ['street', 'Colección street'],
  ['classic', 'Colección clásica'],
  ['procedural', 'Generado por código (colores por pieza)'],
);
/**
 * Pantalones, pantalones cortos, chaquetas y abrigos con modelo en la colección
 * street (cargo baggy, paracaídas, baloncesto, plumífero, chaleco acolchado,
 * varsity y cortavientos).
 */
const model3dStreet = enumField(
  'Modelo 3D',
  ['auto', 'Automático'],
  ['street', 'Colección street'],
  ['procedural', 'Generado por código (colores por pieza)'],
);
/** Gorras: la colección street (trucker, snapback, cinco paneles y pescador). */
const model3dCap = enumField(
  'Modelo 3D',
  ['auto', 'Automático'],
  ['street', 'Colección street'],
  ['procedural', 'Generado por código (colores por pieza)'],
);
/**
 * Zapatillas: la colección de calzado de Blender (por defecto), la street y la
 * casual (las anteriores) o el modelo por código.
 */
const model3dFootwear = enumField(
  'Modelo 3D',
  ['auto', 'Automático'],
  ['footwear', 'Colección calzado'],
  ['street', 'Colección street'],
  ['casual', 'Colección casual'],
  ['procedural', 'Generado por código (colores por pieza)'],
);
/** Camisas: la colección casual (cerradas, con botones) y la clásica (abierta). */
const model3dShirt = enumField(
  'Modelo 3D',
  ['auto', 'Automático'],
  ['casual', 'Colección casual'],
  ['classic', 'Colección clásica'],
  ['procedural', 'Generado por código (colores por pieza)'],
);

const sleeve = enumField(
  'Manga',
  ['sleeveless', 'Sin manga'],
  ['short', 'Corta'],
  ['three_quarter', 'Tres cuartos'],
  ['long', 'Larga'],
);
/** Camisetas: además, manga larga raglán (la costura va del cuello a la axila). */
const tshirtSleeve = enumField(
  'Manga',
  ['sleeveless', 'Sin manga'],
  ['short', 'Corta'],
  ['three_quarter', 'Tres cuartos'],
  ['long', 'Larga'],
  ['raglan', 'Larga raglán'],
);

export interface GarmentTypeSeed {
  code: string;
  name: string;
  category: GarmentCategory;
  modelKey: string;
  sortOrder: number;
  attributeSchema: AttributeSchema;
}

export const GARMENT_TYPE_SEEDS: GarmentTypeSeed[] = [
  {
    code: 'T_SHIRT',
    name: 'Camiseta',
    category: 'TOP',
    modelKey: 'tshirt',
    sortOrder: 10,
    attributeSchema: {
      fields: {
        fit: tshirtFit,
        sleeve: tshirtSleeve,
        neckline: enumField(
          'Cuello',
          ['crew', 'Redondo'],
          ['v_neck', 'Pico'],
          ['scoop', 'Redondo amplio'],
          ['boat', 'Barco'],
          ['henley', 'Henley (botones)'],
          ['polo', 'Polo'],
          ['mock', 'Perkins (alto)'],
        ),
        material,
        brand,
        model3d: model3dBoth,
      },
    },
  },
  {
    code: 'TOP',
    name: 'Top',
    category: 'TOP',
    modelKey: 'top',
    sortOrder: 15,
    attributeSchema: {
      fields: {
        style: enumField(
          'Tipo',
          ['tank', 'Camiseta de tirantes'],
          ['ribbed_tank', 'Tirantes de canalé'],
          ['bodysuit', 'Body'],
          ['corset', 'Corsé'],
          ['halter', 'Halter (cuello atado)'],
          ['bandeau', 'Bandeau (sin tirantes)'],
          ['waistcoat', 'Chaleco de vestir'],
          ['waistcoat_db', 'Chaleco de traje cruzado'],
        ),
        fit: enumField('Corte', ['slim', 'Ajustado'], ['regular', 'Regular'], ['relaxed', 'Holgado'], ['cropped', 'Crop (corto)']),
        material,
        brand,
      },
    },
  },
  {
    code: 'SHIRT',
    name: 'Camisa',
    category: 'TOP',
    modelKey: 'shirt',
    sortOrder: 20,
    attributeSchema: {
      fields: {
        fit: shirtFit,
        sleeve,
        collar: enumField(
          'Cuello',
          ['classic', 'Clásico'],
          ['button_down', 'Button-down'],
          ['spread', 'Italiano'],
          ['mandarin', 'Mao'],
          ['camp', 'Cubano (bowling)'],
        ),
        material,
        brand,
        model3d: model3dShirt,
      },
    },
  },
  {
    code: 'SWEATER',
    name: 'Jersey',
    category: 'TOP',
    modelKey: 'sweater',
    sortOrder: 30,
    attributeSchema: {
      fields: {
        fit: knitFit,
        knit: enumField('Punto', ['fine', 'Fino'], ['chunky', 'Grueso'], ['cable', 'Ochos (trenzas)']),
        neckline: enumField(
          'Cuello',
          ['crew', 'Redondo'],
          ['v_neck', 'Pico'],
          ['turtleneck', 'Alto (vuelto)'],
          ['mock', 'Perkins'],
          ['cardigan', 'Cárdigan (abierto)'],
          ['vest', 'Chaleco de punto (sin mangas, pico)'],
          ['hoodie', 'Con capucha (sudadera)'],
          ['hoodie_zip', 'Con capucha y cremallera'],
          ['half_zip', 'Media cremallera (cuello alto)'],
          ['quarter_zip', 'Cuarto de cremallera (cuello alto)'],
          ['athletic', 'Deportiva (raglán y pico bajo el cuello)'],
        ),
        material,
        brand,
        model3d: model3dSweater,
      },
    },
  },
  {
    code: 'PANTS',
    name: 'Pantalón',
    category: 'BOTTOM',
    modelKey: 'pants',
    sortOrder: 40,
    attributeSchema: {
      fields: {
        fit: pantsFit,
        rise: enumField('Tiro', ['low', 'Bajo'], ['mid', 'Medio'], ['high', 'Alto']),
        length: pantsLength,
        inseamCm: {
          type: 'number',
          label: 'Largo de pierna (cm)',
          min: 40,
          max: 120,
          integer: true,
        },
        material,
        brand,
        model3d: model3dStreet,
      },
    },
  },
  {
    code: 'SHORTS',
    name: 'Pantalón corto',
    category: 'BOTTOM',
    modelKey: 'shorts',
    sortOrder: 50,
    attributeSchema: {
      fields: {
        fit: shortsFit,
        length: enumField('Largo', ['short', 'Corto'], ['mid', 'Medio'], ['bermuda', 'Bermuda']),
        material,
        brand,
        model3d: model3dStreet,
      },
    },
  },
  {
    code: 'UNDERWEAR',
    name: 'Ropa interior',
    category: 'BOTTOM',
    modelKey: 'underwear',
    sortOrder: 55,
    attributeSchema: {
      fields: {
        style: enumField('Tipo', ['slip', 'Slip'], ['boxer_brief', 'Bóxer corto'], ['boxer_long', 'Bóxer largo']),
        material,
        brand,
        model3d: model3dClassic,
      },
    },
  },
  {
    code: 'SKIRT',
    name: 'Falda',
    category: 'BOTTOM',
    modelKey: 'skirt',
    sortOrder: 60,
    attributeSchema: {
      fields: {
        fit: skirtFit,
        length: enumField('Largo', ['mini', 'Mini'], ['midi', 'Midi'], ['maxi', 'Maxi']),
        material,
        brand,
      },
    },
  },
  {
    code: 'DRESS',
    name: 'Vestido',
    category: 'FULL_BODY',
    modelKey: 'dress',
    sortOrder: 70,
    attributeSchema: {
      fields: {
        fit: dressFit,
        sleeve,
        length: enumField('Largo', ['mini', 'Mini'], ['midi', 'Midi'], ['maxi', 'Maxi']),
        neckline: enumField(
          'Escote',
          ['scoop', 'Redondo'],
          ['v_neck', 'Pico'],
          ['square', 'Cuadrado'],
          ['crew', 'Cerrado'],
        ),
        material,
        brand,
      },
    },
  },
  {
    code: 'JACKET',
    name: 'Chaqueta',
    category: 'OUTERWEAR',
    modelKey: 'jacket',
    sortOrder: 80,
    attributeSchema: {
      fields: {
        style: jacketStyle,
        fit: outerFit,
        closure: enumField('Cierre', ['zip', 'Cremallera'], ['buttons', 'Botones'], ['open', 'Abierta']),
        waterproof,
        material,
        brand,
        model3d: model3dStreet,
      },
    },
  },
  {
    code: 'COAT',
    name: 'Abrigo',
    category: 'OUTERWEAR',
    modelKey: 'coat',
    sortOrder: 90,
    attributeSchema: {
      fields: {
        style: coatStyle,
        fit: outerFit,
        length: coatLength,
        waterproof,
        hooded: { type: 'boolean', label: 'Con capucha' },
        material,
        brand,
        model3d: model3dStreet,
      },
    },
  },
  {
    code: 'SNEAKERS',
    name: 'Zapatillas',
    category: 'FOOTWEAR',
    modelKey: 'sneakers',
    sortOrder: 100,
    attributeSchema: {
      fields: {
        style: enumField(
          'Tipo',
          ['casual', 'Casual'],
          ['court', 'Pista (minimal)'],
          ['running', 'Running'],
          ['high_top', 'Bota (caña alta)'],
          ['slip_on', 'Sin cordones (slip-on)'],
          ['chunky', 'Chunky (suela gruesa)'],
          ['skate', 'Skate'],
          ['knit', 'Runner de punto (knit)'],
          ['mid_top', 'Caña media (baloncesto)'],
        ),
        model3d: model3dFootwear,
        material,
        brand,
      },
    },
  },
  {
    code: 'BOOTS',
    name: 'Botas',
    category: 'FOOTWEAR',
    modelKey: 'boots',
    sortOrder: 110,
    attributeSchema: {
      fields: {
        style: enumField(
          'Tipo',
          ['chelsea', 'Chelsea'],
          ['combat', 'Militar'],
          ['cowboy', 'Camperas (cowboy)'],
          ['hiking', 'Montaña'],
          ['dress', 'De vestir'],
          ['riding', 'De montar'],
        ),
        shaft: enumField(
          'Caña',
          ['ankle', 'Tobillo'],
          ['mid', 'Media'],
          ['knee', 'Rodilla'],
          ['over_knee', 'Mosquetera (sobre la rodilla)'],
        ),
        heel: enumField('Tacón', ['flat', 'Plano'], ['block', 'Ancho'], ['high', 'Alto']),
        waterproof,
        material,
        brand,
      },
    },
  },
  {
    code: 'SCARF',
    name: 'Bufanda',
    category: 'ACCESSORY',
    modelKey: 'scarf',
    sortOrder: 125,
    attributeSchema: {
      fields: {
        knit: enumField('Punto', ['fine', 'Fino'], ['chunky', 'Grueso']),
        material,
        brand,
      },
    },
  },
  {
    code: 'CAP',
    name: 'Gorra',
    category: 'ACCESSORY',
    modelKey: 'cap',
    sortOrder: 120,
    attributeSchema: {
      fields: {
        style: enumField(
          'Tipo',
          ['baseball', 'Béisbol (visera curva)'],
          ['dad', 'Dad cap (desestructurada)'],
          ['trucker', 'Trucker (rejilla)'],
          ['snapback', 'Snapback (visera plana)'],
          ['five_panel', 'Cinco paneles'],
          ['bucket', 'Pescador (bucket)'],
        ),
        material,
        brand,
        model3d: model3dCap,
      },
    },
  },
  {
    code: 'BEANIE',
    name: 'Gorro',
    category: 'ACCESSORY',
    modelKey: 'beanie',
    sortOrder: 122,
    attributeSchema: {
      fields: {
        knit: enumField('Punto', ['fine', 'Fino'], ['chunky', 'Grueso']),
        material,
        brand,
      },
    },
  },
];
