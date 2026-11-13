/**
 * Esquema de atributos variables por tipo de prenda.
 *
 * Cada GarmentType guarda en la columna JSON `attributeSchema` un objeto con
 * esta forma. Cuando el usuario crea o edita una prenda, el backend valida
 * `attributes` contra el esquema de su tipo con `validateAttributes()`.
 *
 * Es un formato propio y deliberadamente pequeño (en lugar de JSON Schema
 * completo) para que sea fácil de leer y de pintar como formulario en el
 * frontend.
 */

export interface EnumOption {
  value: string;
  label: string;
}

export type AttributeField =
  | { type: 'enum'; label: string; options: EnumOption[] }
  | { type: 'string'; label: string; maxLength: number }
  | { type: 'boolean'; label: string }
  | {
      type: 'number';
      label: string;
      min?: number;
      max?: number;
      integer?: boolean;
    };

export interface AttributeSchema {
  fields: Record<string, AttributeField>;
}

export type AttributeValue = string | number | boolean;
export type Attributes = Record<string, AttributeValue>;

/** Límite global para que nadie guarde un JSON enorme. */
export const MAX_ATTRIBUTE_KEYS = 20;

export interface AttributeValidationResult {
  ok: boolean;
  errors: string[];
  /** Copia limpia de los atributos (solo claves conocidas). */
  value: Attributes;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Comprueba en tiempo de ejecución que un valor JSON leído de la base de
 * datos tiene la forma de AttributeSchema. Si no la tiene, devolvemos un
 * esquema vacío (ningún atributo permitido), que es la opción segura.
 */
export function parseAttributeSchema(raw: unknown): AttributeSchema {
  if (!isPlainObject(raw) || !isPlainObject(raw.fields)) {
    return { fields: {} };
  }
  return raw as unknown as AttributeSchema;
}

/**
 * Valida `input` contra `schema`.
 * - Rechaza claves desconocidas (no se puede guardar cualquier cosa).
 * - Comprueba tipo, opciones permitidas, longitudes y rangos.
 * - Todos los atributos son opcionales.
 */
export function validateAttributes(
  schema: AttributeSchema,
  input: unknown,
): AttributeValidationResult {
  const errors: string[] = [];
  const value: Attributes = {};

  if (input === undefined || input === null) {
    return { ok: true, errors, value };
  }
  if (!isPlainObject(input)) {
    return {
      ok: false,
      errors: ['attributes must be an object'],
      value,
    };
  }

  const keys = Object.keys(input);
  if (keys.length > MAX_ATTRIBUTE_KEYS) {
    errors.push(`attributes cannot have more than ${MAX_ATTRIBUTE_KEYS} keys`);
  }

  for (const key of keys) {
    const field = schema.fields[key];
    const raw = input[key];

    if (!field) {
      errors.push(`attributes.${key} is not allowed for this garment type`);
      continue;
    }
    // null o undefined = "sin valor": simplemente no se guarda.
    if (raw === null || raw === undefined) continue;

    switch (field.type) {
      case 'enum': {
        const allowed = field.options.map((o) => o.value);
        if (typeof raw !== 'string' || !allowed.includes(raw)) {
          errors.push(
            `attributes.${key} must be one of: ${allowed.join(', ')}`,
          );
        } else {
          value[key] = raw;
        }
        break;
      }
      case 'string': {
        if (typeof raw !== 'string') {
          errors.push(`attributes.${key} must be a string`);
        } else if (raw.trim().length > field.maxLength) {
          errors.push(
            `attributes.${key} must be at most ${field.maxLength} characters`,
          );
        } else if (raw.trim().length > 0) {
          value[key] = raw.trim();
        }
        break;
      }
      case 'boolean': {
        if (typeof raw !== 'boolean') {
          errors.push(`attributes.${key} must be a boolean`);
        } else {
          value[key] = raw;
        }
        break;
      }
      case 'number': {
        if (typeof raw !== 'number' || !Number.isFinite(raw)) {
          errors.push(`attributes.${key} must be a number`);
        } else if (field.integer && !Number.isInteger(raw)) {
          errors.push(`attributes.${key} must be an integer`);
        } else if (field.min !== undefined && raw < field.min) {
          errors.push(`attributes.${key} must be >= ${field.min}`);
        } else if (field.max !== undefined && raw > field.max) {
          errors.push(`attributes.${key} must be <= ${field.max}`);
        } else {
          value[key] = raw;
        }
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors, value };
}
