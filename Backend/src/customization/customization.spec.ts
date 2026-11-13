import { CUSTOMIZATION_BY_MODEL, LIMITS } from './customization-options';
import { sanitizeForModel, validateCustomization } from './customization';

const detail = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  kind: 'embroidery',
  position: [0.08, 1.32, 0.13],
  normal: [0, 0, 1.2],
  rotation: 0,
  size: 0.06,
  color: '#151517',
  text: 'MyOut',
  font: 'script',
  ...over,
});

describe('validateCustomization', () => {
  it('acepta una personalización completa y la normaliza', () => {
    const r = validateCustomization(
      {
        colors: { buttons: '#c9a15a', stitching: '#FFFFFF' },
        parts: { chestPocket: true, epaulettes: false },
        options: { buttonStyle: 'shank' },
        details: [detail({ rotation: 4 })],
      },
      'shirt',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.colors?.buttons).toBe('#C9A15A');
    // La normal se normaliza a longitud 1.
    expect(r.value.details?.[0].normal).toEqual([0, 0, 1]);
    // 4 rad se normaliza a −π..π
    expect(Math.abs(r.value.details![0].rotation)).toBeLessThanOrEqual(Math.PI);
  });

  it('acepta vacío o null', () => {
    expect(validateCustomization(undefined, 'shirt')).toEqual({ ok: true, value: {}, assetIds: [] });
    expect(validateCustomization(null, 'shirt')).toEqual({ ok: true, value: {}, assetIds: [] });
  });

  it.each([
    ['clave desconocida', { foo: 1 }],
    ['color que el tipo no tiene', { colors: { sole: '#000000' } }],
    ['color mal escrito', { colors: { buttons: 'red' } }],
    ['pieza que no existe', { parts: { wings: true } }],
    ['pieza no booleana', { parts: { chestPocket: 'yes' } }],
    ['opción que el tipo no tiene', { options: { metal: 'gold' } }],
    ['valor de opción inválido', { options: { buttonStyle: 'square' } }],
    ['detalles no es lista', { details: {} }],
    ['demasiados detalles', { details: Array.from({ length: LIMITS.maxDetails + 1 }, (_, i) => detail({ id: `d${i}` })) }],
    ['clave extra en un detalle', { details: [detail({ script: 'x' })] }],
    ['tipo de detalle inválido', { details: [detail({ kind: 'laser' })] }],
    ['posición fuera de rango', { details: [detail({ position: [0, 99, 0] })] }],
    ['posición no numérica', { details: [detail({ position: [0, 'a', 0] })] }],
    ['normal nula', { details: [detail({ normal: [0, 0, 0] })] }],
    ['tamaño demasiado grande', { details: [detail({ size: 3 })] }],
    ['texto demasiado largo', { details: [detail({ text: 'x'.repeat(LIMITS.maxText + 1) })] }],
    ['texto con caracteres de control', { details: [detail({ text: 'a\u0000b' })] }],
    ['texto en un remache', { details: [detail({ kind: 'rivet', font: undefined })] }],
    ['texto e imagen a la vez', { details: [detail({ assetId: '00000000-0000-4000-8000-000000000001' })] }],
    ['assetId que no es UUID', { details: [detail({ text: undefined, font: undefined, assetId: '../../etc/passwd' })] }],
    ['ids repetidos', { details: [detail(), detail()] }],
  ])('rechaza %s', (_name, input) => {
    const clean = JSON.parse(JSON.stringify(input)) as unknown; // quita los undefined
    expect(validateCustomization(clean, 'shirt').ok).toBe(false);
  });

  it('acepta estampados con sus colores', () => {
    const r = validateCustomization(
      { colors: { pattern: '#2b3445', pattern2: '#c9a15a' }, options: { pattern: 'check', patternSize: 'large' } },
      'shirt',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.options).toEqual({ pattern: 'check', patternSize: 'large' });
    expect(r.value.colors).toEqual({ pattern: '#2B3445', pattern2: '#C9A15A' });
  });

  it.each([
    ['estampado desconocido', { options: { pattern: 'leopard' } }, 'shirt'],
    ['tamaño de estampado inválido', { options: { patternSize: 'huge' } }, 'shirt'],
    ['estampado en un tipo sin estampado', { options: { pattern: 'stripes' } }, 'unknown_type'],
  ])('rechaza %s', (_name, input, model) => {
    expect(validateCustomization(input, model).ok).toBe(false);
  });

  const pattern = (over: Record<string, unknown> = {}) => ({
    kind: 'stripes',
    colors: ['#151517', '#e8e4da'],
    size: 0.05,
    thickness: 0.4,
    count: 2,
    angle: 45,
    opacity: 0.9,
    softness: 0.1,
    offsetX: 0.25,
    offsetY: 0,
    target: 'all',
    ...over,
  });

  it('acepta el estampado configurable y normaliza colores', () => {
    const r = validateCustomization({ pattern: pattern() }, 'jacket');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pattern).toEqual({ ...pattern(), colors: ['#151517', '#E8E4DA'] });
  });

  it('el estampado configurable rellena los ajustes que faltan', () => {
    const r = validateCustomization({ pattern: { kind: 'dots', colors: ['#ffffff'] } }, 'cap');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pattern).toMatchObject({ kind: 'dots', colors: ['#FFFFFF'], count: 1, angle: 0, opacity: 1, target: 'main' });
  });

  it.each([
    ['tipo desconocido', pattern({ kind: 'paisley' })],
    ['sin colores', pattern({ colors: [] })],
    ['más de 4 colores', pattern({ colors: ['#111111', '#222222', '#333333', '#444444', '#555555'] })],
    ['color inválido', pattern({ colors: ['red'] })],
    ['tamaño enorme', pattern({ size: 3 })],
    ['cantidad decimal', pattern({ count: 2.5 })],
    ['cantidad fuera de rango', pattern({ count: 9 })],
    ['giro fuera de rango', pattern({ angle: 720 })],
    ['zona desconocida', pattern({ target: 'sleeves' })],
    ['clave desconocida', pattern({ script: 'alert(1)' })],
    ['no es un objeto', 'stripes'],
  ])('rechaza el estampado con %s', (_name, p) => {
    expect(validateCustomization({ pattern: p }, 'shirt').ok).toBe(false);
  });

  it('al cambiar de tipo, el estampado se conserva si el nuevo tipo lo admite', () => {
    expect(sanitizeForModel({ pattern: pattern() }, 'sneakers').pattern).toBeDefined();
    expect(sanitizeForModel({ pattern: pattern() }, 'unknown_type').pattern).toBeUndefined();
  });

  it('la bufanda admite estampado, color de flecos y quitar los flecos', () => {
    const r = validateCustomization({ colors: { trim: '#8c3b3b' }, parts: { fringe: false }, options: { pattern: 'tartan' } }, 'scarf');
    expect(r.ok).toBe(true);
  });

  it('devuelve las imágenes usadas', () => {
    const asset = '00000000-0000-4000-8000-0000000000AA';
    const r = validateCustomization({ details: [detail({ text: undefined, font: undefined, kind: 'print', assetId: asset })] }, 'tshirt');
    expect(r.ok && r.assetIds).toEqual([asset.toLowerCase()]);
  });

  it('acepta parches recortados (sin marco) con imagen o texto', () => {
    const asset = '00000000-0000-4000-8000-0000000000AB';
    const withImage = detail({ kind: 'patch', shape: 'cutout', text: undefined, font: undefined, assetId: asset });
    const withText = detail({ id: 'd2', kind: 'patch', shape: 'cutout', font: 'college' });
    expect(validateCustomization({ details: [withImage, withText] }, 'jacket').ok).toBe(true);
  });

  it('el dibujo lleva imagen, nunca texto, y puede ser más grande que otros detalles', () => {
    const asset = '00000000-0000-4000-8000-0000000000AC';
    const drawing = (over: Record<string, unknown> = {}) =>
      detail({ kind: 'drawing', text: undefined, font: undefined, assetId: asset, size: 0.6, ...over });
    const ok = validateCustomization({ details: [drawing()] }, 'tshirt');
    expect(ok.ok && ok.assetIds).toEqual([asset.toLowerCase()]);
    // Sin imagen, con texto o más grande que el máximo: se rechaza.
    expect(validateCustomization({ details: [drawing({ assetId: undefined })] }, 'tshirt').ok).toBe(false);
    expect(validateCustomization({ details: [drawing({ assetId: undefined, text: 'hola' })] }, 'tshirt').ok).toBe(false);
    expect(validateCustomization({ details: [drawing({ size: LIMITS.maxDrawingSize + 0.1 })] }, 'tshirt').ok).toBe(false);
    // El resto de detalles mantiene su límite.
    expect(validateCustomization({ details: [detail({ size: 0.6 })] }, 'tshirt').ok).toBe(false);
  });

  it('todos los tipos del catálogo tienen piezas con claves únicas', () => {
    for (const [model, o] of Object.entries(CUSTOMIZATION_BY_MODEL)) {
      const keys = o.parts.map((p) => p.key);
      expect({ model, unique: new Set(keys).size }).toEqual({ model, unique: keys.length });
    }
  });
});

describe('sanitizeForModel', () => {
  it('quita lo que el tipo nuevo no tiene y conserva los detalles', () => {
    const out = sanitizeForModel(
      { colors: { buttons: '#111111', sole: '#222222' }, parts: { chestPocket: true }, details: [detail()] },
      'sneakers',
    );
    // Las zapatillas tienen suela pero no botones ni bolsillo.
    expect(out.colors).toEqual({ sole: '#222222' });
    expect(out.parts).toBeUndefined();
    expect(out.details).toHaveLength(1);
  });
});
