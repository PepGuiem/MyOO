import {
  brandKey,
  brandOf,
  colorGroup,
  computeFacets,
  FacetRow,
} from './item-facets';

let n = 0;
const row = (p: Partial<FacetRow> = {}): FacetRow => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  name: p.name ?? `Prenda ${n}`,
  color: '#111111',
  season: 'ALL_SEASON',
  attributes: {},
  isFavorite: false,
  createdAt: new Date('2026-11-01T10:00:00Z'),
  garmentType: {
    id: 'gt-tee',
    code: 'tshirt',
    name: 'Camiseta',
    category: 'TOP',
  },
  sneaker: null,
  ...p,
});

describe('colorGroup', () => {
  it('agrupa por el color con nombre más parecido', () => {
    expect(colorGroup('#0A0A0A')).toBe('black');
    expect(colorGroup('#FAFAF7')).toBe('white');
    expect(colorGroup('#1D2A44')).toBe('blue'); // azul marino
    expect(colorGroup('#6D1F2A')).toBe('red'); // burdeos
    expect(colorGroup('#6B6B3A')).toBe('green'); // oliva
    expect(colorGroup('#E2762B')).toBe('orange');
    expect(colorGroup('#B58450')).toBe('brown'); // camel
  });

  it('un color que no es #RRGGBB cuenta como gris', () => {
    expect(colorGroup('rojo')).toBe('grey');
    expect(colorGroup('#FFF')).toBe('grey');
  });
});

describe('brandOf', () => {
  it('usa la marca de los atributos (sin espacios de más)', () => {
    expect(brandOf({ attributes: { brand: '  Carhartt ' } })).toBe('Carhartt');
  });

  it('si no hay, la de la ficha de zapatilla; «Otras» sin nombre no cuenta', () => {
    expect(
      brandOf({
        attributes: {},
        sneaker: { brand: 'NEW_BALANCE', brandName: null },
      }),
    ).toBe('New Balance');
    expect(
      brandOf({
        attributes: {},
        sneaker: { brand: 'OTHER', brandName: 'Hoka' },
      }),
    ).toBe('Hoka');
    expect(
      brandOf({ attributes: {}, sneaker: { brand: 'OTHER', brandName: null } }),
    ).toBeNull();
  });

  it('sin marca, o con atributos raros, devuelve null', () => {
    expect(brandOf({ attributes: {} })).toBeNull();
    expect(brandOf({ attributes: { brand: 42 } })).toBeNull();
    expect(brandOf({ attributes: null })).toBeNull();
    expect(brandOf({ attributes: ['brand'] })).toBeNull();
  });

  it('brandKey no distingue mayúsculas ni espacios', () => {
    expect(brandKey(' Stone  Island ')).toBe(brandKey('stone island'));
  });
});

describe('computeFacets', () => {
  it('armario vacío: todo a cero y sin última prenda', () => {
    const f = computeFacets([]);
    expect(f).toMatchObject({
      total: 0,
      favorites: 0,
      categories: 0,
      brands: [],
      colors: [],
      seasons: [],
      lastAdded: null,
    });
  });

  it('cuenta categorías, tipos, favoritas, marcas, colores y temporadas', () => {
    const jeans = {
      id: 'gt-jeans',
      code: 'jeans',
      name: 'Vaqueros',
      category: 'BOTTOM' as const,
    };
    const f = computeFacets([
      row({
        isFavorite: true,
        attributes: { brand: 'Nike' },
        color: '#0A0A0A',
      }),
      row({
        attributes: { brand: 'nike' },
        color: '#FAFAF7',
        season: 'SUMMER',
      }),
      row({
        attributes: { brand: 'NIKE ' },
        garmentType: jeans,
        color: '#2F5DA8',
        isFavorite: true,
      }),
      row({ attributes: {}, garmentType: jeans, color: '#2F5DA8' }),
    ]);
    expect(f.total).toBe(4);
    expect(f.favorites).toBe(2);
    expect(f.categories).toBe(2);
    expect(f.byCategory).toEqual({ TOP: 2, BOTTOM: 2 });
    expect(f.garmentTypes.map((t) => [t.code, t.count])).toEqual([
      ['tshirt', 2],
      ['jeans', 2],
    ]);
    // Las tres escrituras de Nike son la misma marca.
    expect(f.brands).toHaveLength(1);
    expect(f.brands[0].count).toBe(3);
    // Colores en el orden fijo de los grupos.
    expect(f.colors).toEqual([
      { value: 'black', count: 1 },
      { value: 'white', count: 1 },
      { value: 'blue', count: 2 },
    ]);
    expect(f.seasons[0]).toEqual({ value: 'ALL_SEASON', count: 3 });
  });

  it('la marca se muestra con su escritura más usada', () => {
    const f = computeFacets([
      row({ attributes: { brand: 'Ácme Studio' } }),
      row({ attributes: { brand: 'ácme studio' } }),
      row({ attributes: { brand: 'Ácme Studio' } }),
    ]);
    expect(f.brands).toEqual([{ value: 'Ácme Studio', count: 3 }]);
  });

  it('la última añadida es la más reciente', () => {
    const f = computeFacets([
      row({ name: 'Vieja', createdAt: new Date('2026-01-01T00:00:00Z') }),
      row({ name: 'Nueva', createdAt: new Date('2026-11-10T00:00:00Z') }),
      row({ name: 'Media', createdAt: new Date('2026-06-01T00:00:00Z') }),
    ]);
    expect(f.lastAdded?.name).toBe('Nueva');
  });
});
