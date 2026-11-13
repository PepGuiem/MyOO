/**
 * Validación del JSON `WardrobeItem.customization`.
 *
 * Es un formato propio y cerrado: cualquier clave desconocida se rechaza,
 * los colores deben ser #RRGGBB, los números finitos y dentro de rango, y
 * los textos cortos y sin caracteres de control. Así el JSON nunca puede
 * crecer sin control ni colar datos inesperados.
 */
import {
  BUTTON_STYLES,
  COLOR_SLOTS,
  DETAIL_FONTS,
  DETAIL_KINDS,
  DETAIL_SHAPES,
  DETAILS_WITH_GRAPHIC,
  IMAGE_ONLY_DETAILS,
  LIMITS,
  METAL_FINISHES,
  optionsFor,
  PATTERN_KINDS,
  PATTERN_MAX_COLORS,
  PATTERN_RANGES,
  PATTERN_SIZES,
  PATTERN_TARGETS,
  PATTERNS,
  STITCH_STYLES,
  type OptionKey,
  type ColorSlot,
  type DetailKind,
} from './customization-options';

export type Vec3 = [number, number, number];

export interface CustomizationDetail {
  id: string;
  kind: DetailKind;
  /** Punto de la prenda (coordenadas del modelo para la silueta estándar, en metros). */
  position: Vec3;
  /** Dirección hacia fuera de la tela en ese punto (normalizada). */
  normal: Vec3;
  /** Giro sobre la tela, en radianes (−π..π). */
  rotation: number;
  /** Tamaño (lado mayor) en metros. */
  size: number;
  color: string;
  secondaryColor?: string;
  text?: string;
  font?: (typeof DETAIL_FONTS)[number];
  shape?: (typeof DETAIL_SHAPES)[number];
  /** Imagen subida por el usuario (ver /assets). */
  assetId?: string;
}

/** Estampado configurable de la tela (todos los campos ya normalizados). */
export interface CustomizationPattern {
  kind: (typeof PATTERN_KINDS)[number];
  colors: string[];
  size: number;
  thickness: number;
  count: number;
  angle: number;
  opacity: number;
  softness: number;
  offsetX: number;
  offsetY: number;
  target: (typeof PATTERN_TARGETS)[number];
}

export interface Customization {
  colors?: Partial<Record<ColorSlot, string>>;
  parts?: Record<string, boolean>;
  options?: {
    metal?: (typeof METAL_FINISHES)[number];
    buttonStyle?: (typeof BUTTON_STYLES)[number];
    stitchStyle?: (typeof STITCH_STYLES)[number];
    pattern?: (typeof PATTERNS)[number];
    patternSize?: (typeof PATTERN_SIZES)[number];
  };
  pattern?: CustomizationPattern;
  details?: CustomizationDetail[];
}

export type CustomizationResult =
  | { ok: true; value: Customization; assetIds: string[] }
  | { ok: false; errors: string[] };

const HEX = /^#[0-9A-Fa-f]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DETAIL_ID = /^[A-Za-z0-9_-]{1,40}$/;
// Caracteres de control (incluidos saltos de línea) y de dirección de texto.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/;

const DETAIL_KEYS = new Set([
  'id', 'kind', 'position', 'normal', 'rotation', 'size', 'color',
  'secondaryColor', 'text', 'font', 'shape', 'assetId',
]);
const SHAPED: readonly DetailKind[] = ['patch', 'label', 'pocket', 'print', 'embroidery'];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const round = (n: number) => Math.round(n * 1e5) / 1e5;

function vec3(v: unknown, path: string, errors: string[], max: number = LIMITS.maxCoord): Vec3 | null {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    errors.push(`${path} must be an array of 3 finite numbers`);
    return null;
  }
  const out = v as number[];
  if (out.some((n) => Math.abs(n) > max)) {
    errors.push(`${path} values must be between -${max} and ${max}`);
    return null;
  }
  return [round(out[0]), round(out[1]), round(out[2])];
}

function hex(v: unknown, path: string, errors: string[]): string | null {
  if (typeof v !== 'string' || !HEX.test(v)) {
    errors.push(`${path} must be a hex color like #1A2B3C`);
    return null;
  }
  return v.toUpperCase();
}

function oneOf<T extends string>(v: unknown, list: readonly T[], path: string, errors: string[]): T | null {
  if (typeof v !== 'string' || !(list as readonly string[]).includes(v)) {
    errors.push(`${path} must be one of: ${list.join(', ')}`);
    return null;
  }
  return v as T;
}

function validateDetail(raw: unknown, i: number, errors: string[]): CustomizationDetail | null {
  const path = `details[${i}]`;
  if (!isPlainObject(raw)) {
    errors.push(`${path} must be an object`);
    return null;
  }
  for (const key of Object.keys(raw)) {
    if (!DETAIL_KEYS.has(key)) errors.push(`${path}.${key} is not allowed`);
  }
  const before = errors.length;

  const id = typeof raw.id === 'string' && DETAIL_ID.test(raw.id) ? raw.id : null;
  if (!id) errors.push(`${path}.id must be 1-40 characters (letters, digits, - or _)`);
  const kind = oneOf(raw.kind, DETAIL_KINDS, `${path}.kind`, errors);
  const position = vec3(raw.position, `${path}.position`, errors);
  const normalRaw = vec3(raw.normal, `${path}.normal`, errors, 2);
  let normal: Vec3 | null = null;
  if (normalRaw) {
    const len = Math.hypot(...normalRaw);
    if (len < 0.5 || len > 1.5) errors.push(`${path}.normal must be a unit vector`);
    else normal = [round(normalRaw[0] / len), round(normalRaw[1] / len), round(normalRaw[2] / len)];
  }
  let rotation = 0;
  if (raw.rotation !== undefined) {
    if (typeof raw.rotation !== 'number' || !Number.isFinite(raw.rotation)) {
      errors.push(`${path}.rotation must be a finite number`);
    } else {
      // Normalizamos a −π..π.
      rotation = round(Math.atan2(Math.sin(raw.rotation), Math.cos(raw.rotation)));
    }
  }
  const size = raw.size;
  const imageOnly = kind !== null && IMAGE_ONLY_DETAILS.includes(kind);
  const maxSize = imageOnly ? LIMITS.maxDrawingSize : LIMITS.maxSize;
  if (typeof size !== 'number' || !Number.isFinite(size) || size < LIMITS.minSize || size > maxSize) {
    errors.push(`${path}.size must be between ${LIMITS.minSize} and ${maxSize} (meters)`);
  }
  const color = hex(raw.color, `${path}.color`, errors);
  const secondaryColor =
    raw.secondaryColor === undefined ? undefined : hex(raw.secondaryColor, `${path}.secondaryColor`, errors);

  const graphic = kind !== null && DETAILS_WITH_GRAPHIC.includes(kind);
  let text: string | undefined;
  if (raw.text !== undefined) {
    if (!graphic) errors.push(`${path}.text is only allowed for: ${DETAILS_WITH_GRAPHIC.join(', ')}`);
    else if (typeof raw.text !== 'string') errors.push(`${path}.text must be a string`);
    else {
      const t = raw.text.trim();
      if (t.length < 1 || t.length > LIMITS.maxText) errors.push(`${path}.text must be 1-${LIMITS.maxText} characters`);
      else if (CONTROL.test(t)) errors.push(`${path}.text contains control characters`);
      else text = t;
    }
  }
  const font = raw.font === undefined ? undefined : oneOf(raw.font, DETAIL_FONTS, `${path}.font`, errors);
  if (font && raw.text === undefined) errors.push(`${path}.font requires text`);
  let shape: CustomizationDetail['shape'];
  if (raw.shape !== undefined) {
    if (kind && !SHAPED.includes(kind)) errors.push(`${path}.shape is not allowed for ${kind}`);
    shape = oneOf(raw.shape, DETAIL_SHAPES, `${path}.shape`, errors) ?? undefined;
  }
  let assetId: string | undefined;
  if (raw.assetId !== undefined) {
    if (!graphic) errors.push(`${path}.assetId is only allowed for: ${DETAILS_WITH_GRAPHIC.join(', ')}`);
    else if (typeof raw.assetId !== 'string' || !UUID.test(raw.assetId)) errors.push(`${path}.assetId must be a UUID`);
    else assetId = raw.assetId.toLowerCase();
  }
  if (text !== undefined && assetId !== undefined) errors.push(`${path} can have text or assetId, not both`);
  if (imageOnly) {
    if (raw.text !== undefined) errors.push(`${path}.text is not allowed for ${kind}`);
    if (raw.assetId === undefined) errors.push(`${path}.assetId is required for ${kind}`);
  }

  if (errors.length > before || !id || !kind || !position || !normal || !color) return null;
  const detail: CustomizationDetail = {
    id,
    kind,
    position,
    normal,
    rotation,
    size: round(size as number),
    color,
  };
  if (secondaryColor) detail.secondaryColor = secondaryColor;
  if (text !== undefined) detail.text = text;
  if (font) detail.font = font;
  if (shape) detail.shape = shape;
  if (assetId) detail.assetId = assetId;
  return detail;
}

const PATTERN_KEYS = new Set(['kind', 'colors', 'target', ...Object.keys(PATTERN_RANGES)]);

/** Valida el estampado configurable; los ajustes que falten toman su valor por defecto. */
function validatePattern(raw: unknown, errors: string[]): CustomizationPattern | null {
  if (!isPlainObject(raw)) {
    errors.push('pattern must be an object');
    return null;
  }
  for (const key of Object.keys(raw)) {
    if (!PATTERN_KEYS.has(key)) errors.push(`pattern.${key} is not allowed`);
  }
  const before = errors.length;
  const kind = oneOf(raw.kind, PATTERN_KINDS, 'pattern.kind', errors);
  const colors: string[] = [];
  if (!Array.isArray(raw.colors) || raw.colors.length < 1 || raw.colors.length > PATTERN_MAX_COLORS) {
    errors.push(`pattern.colors must be an array of 1-${PATTERN_MAX_COLORS} colors`);
  } else {
    raw.colors.forEach((c, i) => {
      const h = hex(c, `pattern.colors[${i}]`, errors);
      if (h) colors.push(h);
    });
  }
  const target = raw.target === undefined ? 'main' : oneOf(raw.target, PATTERN_TARGETS, 'pattern.target', errors);
  const nums = {} as Record<keyof typeof PATTERN_RANGES, number>;
  for (const [key, range] of Object.entries(PATTERN_RANGES) as [keyof typeof PATTERN_RANGES, { min: number; max: number; default: number }][]) {
    const v = raw[key];
    if (v === undefined) {
      nums[key] = range.default;
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < range.min || v > range.max) {
      errors.push(`pattern.${key} must be a number between ${range.min} and ${range.max}`);
      continue;
    }
    if (key === 'count' && !Number.isInteger(v)) {
      errors.push('pattern.count must be an integer');
      continue;
    }
    nums[key] = round(v);
  }
  if (errors.length > before || !kind || !target) return null;
  return { kind, colors, ...nums, target };
}

/**
 * Valida la personalización de una prenda del tipo `modelKey`.
 * Devuelve el valor normalizado y la lista de imágenes que usa.
 */
export function validateCustomization(input: unknown, modelKey: string): CustomizationResult {
  const errors: string[] = [];
  if (input === undefined || input === null) return { ok: true, value: {}, assetIds: [] };
  if (!isPlainObject(input)) return { ok: false, errors: ['customization must be an object'] };

  const allowed = optionsFor(modelKey);
  const value: Customization = {};

  for (const key of Object.keys(input)) {
    if (!['colors', 'parts', 'options', 'pattern', 'details'].includes(key)) errors.push(`customization.${key} is not allowed`);
  }

  if (input.colors !== undefined) {
    if (!isPlainObject(input.colors)) errors.push('colors must be an object');
    else {
      const colors: Partial<Record<ColorSlot, string>> = {};
      for (const [slot, raw] of Object.entries(input.colors)) {
        if (!(COLOR_SLOTS as readonly string[]).includes(slot) || !allowed.colors.includes(slot as ColorSlot)) {
          errors.push(`colors.${slot} is not available for this garment type`);
          continue;
        }
        const c = hex(raw, `colors.${slot}`, errors);
        if (c) colors[slot as ColorSlot] = c;
      }
      if (Object.keys(colors).length) value.colors = colors;
    }
  }

  if (input.parts !== undefined) {
    if (!isPlainObject(input.parts)) errors.push('parts must be an object');
    else {
      const parts: Record<string, boolean> = {};
      const keys = new Set(allowed.parts.map((part) => part.key));
      for (const [key, raw] of Object.entries(input.parts)) {
        if (!keys.has(key)) errors.push(`parts.${key} is not available for this garment type`);
        else if (typeof raw !== 'boolean') errors.push(`parts.${key} must be a boolean`);
        else parts[key] = raw;
      }
      if (Object.keys(parts).length) value.parts = parts;
    }
  }

  if (input.options !== undefined) {
    if (!isPlainObject(input.options)) errors.push('options must be an object');
    else {
      const options: NonNullable<Customization['options']> = {};
      for (const [key, raw] of Object.entries(input.options)) {
        if (!allowed.options.includes(key as OptionKey)) {
          errors.push(`options.${key} is not available for this garment type`);
          continue;
        }
        if (key === 'metal') options.metal = oneOf(raw, METAL_FINISHES, 'options.metal', errors) ?? undefined;
        if (key === 'buttonStyle') options.buttonStyle = oneOf(raw, BUTTON_STYLES, 'options.buttonStyle', errors) ?? undefined;
        if (key === 'stitchStyle') options.stitchStyle = oneOf(raw, STITCH_STYLES, 'options.stitchStyle', errors) ?? undefined;
        if (key === 'pattern') options.pattern = oneOf(raw, PATTERNS, 'options.pattern', errors) ?? undefined;
        if (key === 'patternSize') options.patternSize = oneOf(raw, PATTERN_SIZES, 'options.patternSize', errors) ?? undefined;
      }
      if (Object.keys(options).length) value.options = options;
    }
  }

  if (input.pattern !== undefined && input.pattern !== null) {
    if (!allowed.options.includes('pattern')) errors.push('pattern is not available for this garment type');
    else {
      const pattern = validatePattern(input.pattern, errors);
      if (pattern) value.pattern = pattern;
    }
  }

  const assetIds = new Set<string>();
  if (input.details !== undefined) {
    if (!Array.isArray(input.details)) errors.push('details must be an array');
    else if (input.details.length > LIMITS.maxDetails) errors.push(`details can have at most ${LIMITS.maxDetails} items`);
    else {
      const ids = new Set<string>();
      const details: CustomizationDetail[] = [];
      input.details.forEach((raw, i) => {
        const d = validateDetail(raw, i, errors);
        if (!d) return;
        if (ids.has(d.id)) errors.push(`details[${i}].id is duplicated`);
        ids.add(d.id);
        if (d.assetId) assetIds.add(d.assetId);
        details.push(d);
      });
      if (details.length) value.details = details;
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, value, assetIds: [...assetIds] };
}

/**
 * Adapta una personalización YA válida a otro tipo de prenda (al cambiar el
 * tipo): quita colores, piezas, opciones y estampado que el tipo nuevo no
 * tiene. Los detalles colocados se conservan.
 */
export function sanitizeForModel(stored: unknown, modelKey: string): Customization {
  const allowed = optionsFor(modelKey);
  const src = isPlainObject(stored) ? (stored as Customization) : {};
  const out: Customization = {};
  if (src.colors) {
    const colors = Object.fromEntries(Object.entries(src.colors).filter(([k]) => allowed.colors.includes(k as ColorSlot)));
    if (Object.keys(colors).length) out.colors = colors;
  }
  if (src.parts) {
    const keys = new Set(allowed.parts.map((part) => part.key));
    const parts = Object.fromEntries(Object.entries(src.parts).filter(([k]) => keys.has(k)));
    if (Object.keys(parts).length) out.parts = parts;
  }
  if (src.options) {
    const options = Object.fromEntries(Object.entries(src.options).filter(([k]) => allowed.options.includes(k as OptionKey)));
    if (Object.keys(options).length) out.options = options;
  }
  if (src.pattern && allowed.options.includes('pattern')) out.pattern = src.pattern;
  if (Array.isArray(src.details) && src.details.length) out.details = src.details;
  return out;
}
