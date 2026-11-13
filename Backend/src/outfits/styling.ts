/**
 * "Cómo se lleva" cada prenda dentro de un outfit: metida por dentro o por
 * fuera, mangas remangadas, abierta o cerrada, bajo con vuelta, gorra hacia
 * atrás...
 *
 * Es propio del outfit (la misma camisa puede ir por dentro en uno y por
 * fuera en otro), así que se guarda en `OutfitItem.styling`. Formato cerrado:
 * solo se admiten las claves de la prenda y los valores de cada lista.
 * Una clave que no se envía significa "como está diseñada la prenda".
 *
 * Igual que el catálogo, las claves y los valores son ESTABLES: se pueden
 * añadir, pero no renombrar ni borrar.
 */

export const STYLING_FIELDS = {
  /** Parte de arriba respecto al pantalón o la falda. */
  tuck: {
    label: 'Cómo se lleva',
    values: { out: 'Por fuera', in: 'Metida por dentro', half: 'Medio metida (solo delante)', side: 'Metida de un lado' },
  },
  sleeves: {
    label: 'Mangas',
    values: { down: 'Bajadas', rolled: 'Remangadas (enrolladas)', pushed: 'Subidas al codo' },
  },
  front: {
    label: 'Delantera',
    values: { closed: 'Cerrada', open: 'Abierta', top_open: 'Desabrochada arriba' },
  },
  hem: {
    label: 'Bajo',
    values: { normal: 'Normal', cuffed: 'Con vuelta', rolled: 'Remangado' },
  },
  boots: {
    label: 'Con botas',
    values: { over: 'Por fuera de las botas', in: 'Metido en las botas' },
  },
  visor: {
    label: 'Visera',
    values: { forward: 'Hacia delante', backward: 'Hacia atrás', side: 'De lado' },
  },
  /** Prendas con capucha: puesta en la cabeza o bajada sobre la espalda. */
  hood: {
    label: 'Capucha',
    values: { up: 'Puesta', down: 'Bajada' },
  },
} as const;

export type StylingKey = keyof typeof STYLING_FIELDS;
export type Styling = Partial<{ [K in StylingKey]: keyof (typeof STYLING_FIELDS)[K]['values'] }>;

/** Qué se puede ajustar en cada tipo de prenda (por `modelKey`). */
export const STYLING_BY_MODEL: Record<string, StylingKey[]> = {
  tshirt: ['tuck', 'sleeves'],
  top: ['tuck'],
  shirt: ['tuck', 'sleeves', 'front'],
  sweater: ['tuck', 'sleeves', 'hood'],
  dress: ['sleeves'],
  jacket: ['sleeves', 'front', 'hood'],
  coat: ['sleeves', 'front', 'hood'],
  pants: ['hem', 'boots'],
  shorts: ['hem'],
  cap: ['visor'],
};

export function stylingKeysFor(modelKey: string): StylingKey[] {
  return STYLING_BY_MODEL[modelKey] ?? [];
}

export type StylingResult = { ok: true; value: Styling } | { ok: false; errors: string[] };

/** Valida el estilo de una prenda del outfit con formato cerrado. */
export function validateStyling(input: unknown, modelKey: string): StylingResult {
  if (input === undefined || input === null) return { ok: true, value: {} };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, errors: ['styling must be an object'] };
  const allowed = new Set<string>(stylingKeysFor(modelKey));
  const errors: string[] = [];
  const value: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!allowed.has(key)) {
      errors.push(`styling.${key} is not available for ${modelKey}`);
      continue;
    }
    const values = STYLING_FIELDS[key as StylingKey].values as Record<string, string>;
    if (typeof raw !== 'string' || !Object.prototype.hasOwnProperty.call(values, raw)) {
      errors.push(`styling.${key} must be one of: ${Object.keys(values).join(', ')}`);
      continue;
    }
    value[key] = raw;
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: value as Styling };
}
