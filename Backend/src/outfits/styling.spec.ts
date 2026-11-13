import { STYLING_BY_MODEL, STYLING_FIELDS, validateStyling } from './styling';

describe('Estilo de las prendas en un outfit', () => {
  it('acepta las opciones de cada prenda', () => {
    expect(validateStyling({ tuck: 'in', sleeves: 'rolled', front: 'top_open' }, 'shirt')).toEqual({
      ok: true,
      value: { tuck: 'in', sleeves: 'rolled', front: 'top_open' },
    });
    expect(validateStyling({ hem: 'cuffed', boots: 'in' }, 'pants')).toEqual({ ok: true, value: { hem: 'cuffed', boots: 'in' } });
    expect(validateStyling({ visor: 'backward' }, 'cap')).toEqual({ ok: true, value: { visor: 'backward' } });
    expect(validateStyling({ hood: 'down' }, 'sweater')).toEqual({ ok: true, value: { hood: 'down' } });
  });

  it('vacío o ausente es "como está diseñada"', () => {
    expect(validateStyling(undefined, 'tshirt')).toEqual({ ok: true, value: {} });
    expect(validateStyling({}, 'sneakers')).toEqual({ ok: true, value: {} });
  });

  it('rechaza claves de otra prenda, valores desconocidos y tipos raros', () => {
    expect(validateStyling({ tuck: 'in' }, 'sneakers').ok).toBe(false);
    expect(validateStyling({ visor: 'backward' }, 'tshirt').ok).toBe(false);
    expect(validateStyling({ hood: 'down' }, 'tshirt').ok).toBe(false);
    expect(validateStyling({ hood: 'sideways' }, 'jacket').ok).toBe(false);
    expect(validateStyling({ tuck: 'inside' }, 'tshirt').ok).toBe(false);
    expect(validateStyling({ tuck: 1 }, 'tshirt').ok).toBe(false);
    expect(validateStyling(['in'], 'tshirt').ok).toBe(false);
    expect(validateStyling('in', 'tshirt').ok).toBe(false);
  });

  it('no acepta nombres heredados de Object como valor', () => {
    expect(validateStyling({ tuck: 'toString' }, 'tshirt').ok).toBe(false);
  });

  it('todas las claves por prenda existen', () => {
    for (const keys of Object.values(STYLING_BY_MODEL)) for (const k of keys) expect(STYLING_FIELDS[k]).toBeDefined();
  });
});
