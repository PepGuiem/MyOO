import {
  brandLabel,
  normalize,
  sameSneaker,
  sneakerStats,
  StatSneaker,
  usageOf,
} from './sneakers.rules';

const pair = (id: string, extra: Partial<StatSneaker> = {}): StatSneaker => ({
  id,
  name: `Par ${id}`,
  brand: 'NIKE',
  model: 'Modelo A',
  colorway: 'Blanco',
  size: '43',
  color: '#F5F5F2',
  condition: 'GOOD',
  wearCount: 0,
  purchasePrice: null,
  currency: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...extra,
});

describe('sneakers.rules', () => {
  it('normaliza y detecta el mismo par aunque cambien mayúsculas, acentos o signos', () => {
    expect(normalize("  Áir-Max 1 '86 ")).toBe('air max 1 86');
    const a = {
      brand: 'NIKE' as const,
      model: "Air Max 1 '86",
      colorway: 'Blanco/Rojo',
      size: '43',
    };
    expect(
      sameSneaker(a, {
        brand: 'NIKE',
        model: 'air max 1 86',
        colorway: 'blanco rojo',
        size: ' 43 ',
      }),
    ).toBe(true);
    expect(sameSneaker(a, { ...a, size: '44' })).toBe(false);
    expect(sameSneaker(a, { ...a, brand: 'JORDAN' })).toBe(false);
    expect(sameSneaker(a, { ...a, colorway: null })).toBe(false);
    // «Otras»: también cuenta el nombre de la marca
    expect(
      sameSneaker(
        { brand: 'OTHER', brandName: 'Marca X', model: 'M' },
        { brand: 'OTHER', brandName: 'marca x', model: 'm' },
      ),
    ).toBe(true);
    expect(
      sameSneaker(
        { brand: 'OTHER', brandName: 'Marca X', model: 'M' },
        { brand: 'OTHER', brandName: 'Marca Y', model: 'M' },
      ),
    ).toBe(false);
    expect(brandLabel('OTHER', 'Marca X')).toBe('Marca X');
    expect(brandLabel('NEW_BALANCE')).toBe('New Balance');
  });

  it('cuenta días del calendario (sin repetir el mismo día), outfits y compañeras', () => {
    const u = usageOf(['s1', 's2'], {
      outfits: [
        { id: 'o1', itemIds: ['s1', 'a', 'b'] },
        { id: 'o2', itemIds: ['s1', 'b', 'c'] },
        { id: 'o3', itemIds: ['x'] },
      ],
      worn: [
        { outfitId: 'o1', date: '2026-11-01' },
        { outfitId: 'o2', date: '2026-11-01' },
        { outfitId: 'o2', date: '2026-11-03' },
        { outfitId: 'o3', date: '2026-11-04' },
      ],
    });
    expect(u.get('s1')).toEqual({ calendar: 2, outfits: 2, partners: 3 });
    expect(u.get('s2')).toEqual({ calendar: 0, outfits: 0, partners: 0 });
  });

  it('sin zapatillas no inventa nada', () => {
    const s = sneakerStats(
      [],
      { outfits: [], worn: [] },
      { count: 0, value: [] },
    );
    expect(s.total).toBe(0);
    expect(s.topBrand).toBe(null);
    expect(s.topColor).toBe(null);
    expect(s.topModel).toBe(null);
    expect(s.leastUsed).toBe(null);
    expect(s.spent).toEqual([]);
    expect(s.combos).toEqual([]);
  });

  it('dice si hay empate en la marca más repetida', () => {
    const s = sneakerStats(
      [pair('a'), pair('b', { brand: 'VANS', color: '#111111' })],
      { outfits: [], worn: [] },
      { count: 0, value: [] },
    );
    expect(s.topBrand).toMatchObject({ count: 1, tie: 2 });
    expect(s.topColor).toMatchObject({ count: 1, tie: 2 });
  });

  it('dashboard: marca, color, gasto por moneda, modelo más usado, menos usada y combinaciones', () => {
    const list = [
      pair('a', { wearCount: 3, purchasePrice: 12000, currency: 'EUR' }),
      pair('b', {
        model: 'Modelo B',
        color: '#111111',
        wearCount: 1,
        purchasePrice: 9999,
        currency: 'EUR',
        createdAt: new Date('2025-06-01'),
      }),
      pair('c', {
        brand: 'ADIDAS',
        model: 'Modelo C',
        purchasePrice: 5000,
        currency: 'USD',
      }),
      pair('d', {
        model: 'Modelo A',
        colorway: 'Negro',
        size: '42',
        wearCount: 0,
      }),
    ];
    const s = sneakerStats(
      list,
      {
        outfits: [
          { id: 'o1', itemIds: ['c', 'p1'] },
          { id: 'o2', itemIds: ['c', 'p2', 'p3'] },
          { id: 'o3', itemIds: ['b', 'p1'] },
        ],
        worn: [
          { outfitId: 'o1', date: '2026-11-02' },
          { outfitId: 'o2', date: '2026-11-05' },
          { outfitId: 'o2', date: '2026-11-06' },
        ],
      },
      { count: 2, value: [{ currency: 'EUR', total: 180 }] },
    );
    expect(s.total).toBe(4);
    expect(s.topBrand).toMatchObject({
      brand: 'NIKE',
      count: 3,
      share: 75,
      tie: 1,
    });
    expect(s.byBrand.map((b) => b.brand)).toEqual(['NIKE', 'ADIDAS']);
    expect(s.topColor).toMatchObject({ name: 'blanco', count: 3 });
    expect(s.spent).toEqual([
      { currency: 'EUR', total: 219.99, count: 2 },
      { currency: 'USD', total: 50, count: 1 },
    ]);
    expect(s.unpriced).toBe(1);
    // Modelo A: 3 (a) + 0 (d) = 3; Modelo C: 3 días de calendario → empate, gana el de más pares
    expect(s.topModel).toMatchObject({ model: 'Modelo A', uses: 3, pairs: 2 });
    expect(s.leastUsed).toMatchObject({ id: 'd', uses: 0 });
    expect(s.combos.map((c) => [c.id, c.outfits, c.partners])).toEqual([
      ['c', 2, 3],
      ['b', 1, 1],
    ]);
    expect(s.neverCombined).toBe(2);
    expect(s.totalUses).toBe(7);
  });
});
