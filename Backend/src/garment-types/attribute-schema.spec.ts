import {
  AttributeSchema,
  MAX_ATTRIBUTE_KEYS,
  parseAttributeSchema,
  validateAttributes,
} from './attribute-schema';

const schema: AttributeSchema = {
  fields: {
    sleeve: {
      type: 'enum',
      label: 'Manga',
      options: [
        { value: 'short', label: 'Corta' },
        { value: 'long', label: 'Larga' },
      ],
    },
    material: { type: 'string', label: 'Material', maxLength: 10 },
    waterproof: { type: 'boolean', label: 'Impermeable' },
    inseamCm: {
      type: 'number',
      label: 'Largo',
      min: 40,
      max: 120,
      integer: true,
    },
  },
};

describe('validateAttributes', () => {
  it('acepta atributos válidos y recorta textos', () => {
    const result = validateAttributes(schema, {
      sleeve: 'short',
      material: '  Lana ',
      waterproof: false,
      inseamCm: 80,
    });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      sleeve: 'short',
      material: 'Lana',
      waterproof: false,
      inseamCm: 80,
    });
  });

  it('acepta undefined/null como "sin atributos"', () => {
    expect(validateAttributes(schema, undefined)).toMatchObject({
      ok: true,
      value: {},
    });
    expect(validateAttributes(schema, null)).toMatchObject({
      ok: true,
      value: {},
    });
  });

  it('rechaza algo que no es un objeto', () => {
    expect(validateAttributes(schema, ['a']).ok).toBe(false);
    expect(validateAttributes(schema, 'texto').ok).toBe(false);
  });

  it('rechaza claves desconocidas', () => {
    const result = validateAttributes(schema, { color: 'red' });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain('attributes.color');
  });

  it('rechaza valores fuera del enum', () => {
    expect(validateAttributes(schema, { sleeve: 'medium' }).ok).toBe(false);
  });

  it('rechaza textos demasiado largos', () => {
    expect(
      validateAttributes(schema, { material: 'x'.repeat(11) }).ok,
    ).toBe(false);
  });

  it('valida tipos, enteros y rangos numéricos', () => {
    expect(validateAttributes(schema, { waterproof: 'yes' }).ok).toBe(false);
    expect(validateAttributes(schema, { inseamCm: '80' }).ok).toBe(false);
    expect(validateAttributes(schema, { inseamCm: 80.5 }).ok).toBe(false);
    expect(validateAttributes(schema, { inseamCm: 10 }).ok).toBe(false);
    expect(validateAttributes(schema, { inseamCm: 500 }).ok).toBe(false);
    expect(validateAttributes(schema, { inseamCm: Infinity }).ok).toBe(false);
  });

  it('limita el número de claves', () => {
    const many: Record<string, string> = {};
    for (let i = 0; i <= MAX_ATTRIBUTE_KEYS; i++) many[`k${i}`] = 'v';
    const result = validateAttributes(schema, many);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('more than'))).toBe(true);
  });
});

describe('parseAttributeSchema', () => {
  it('devuelve un esquema vacío si el JSON no tiene la forma esperada', () => {
    expect(parseAttributeSchema(null)).toEqual({ fields: {} });
    expect(parseAttributeSchema({})).toEqual({ fields: {} });
    expect(parseAttributeSchema({ fields: [] })).toEqual({ fields: {} });
  });

  it('devuelve el esquema si es válido', () => {
    expect(parseAttributeSchema(schema)).toBe(schema);
  });
});
