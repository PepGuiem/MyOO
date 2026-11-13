import {
  AItem,
  AOutfit,
  analyze,
  isValidTimeZone,
  localDay,
} from './analytics.rules';

let n = 0;
const item = (
  p: Partial<AItem> & Pick<AItem, 'category' | 'modelKey'>,
): AItem => ({
  id: `i${++n}`,
  name: p.name ?? p.modelKey,
  color: '#111111',
  attributes: {},
  styles: [],
  season: 'ALL_SEASON',
  patterned: false,
  styling: {},
  detailColors: [],
  details: 0,
  createdAt: new Date('2026-10-01T10:00:00Z'),
  brand: null,
  ...p,
});

const now = new Date('2026-11-13T12:00:00Z');

function wardrobe() {
  n = 0;
  return {
    hoodie: item({
      name: 'Sudadera negra',
      category: 'TOP',
      modelKey: 'sweater',
      attributes: { neckline: 'hoodie', fit: 'oversized' },
      brand: 'Nike',
    }),
    tee: item({
      name: 'Camiseta blanca',
      category: 'TOP',
      modelKey: 'tshirt',
      color: '#F4F4F2',
      brand: 'nike',
    }),
    cargo: item({
      name: 'Cargo negro',
      category: 'BOTTOM',
      modelKey: 'pants',
      attributes: { fit: 'cargo' },
      brand: 'Carhartt',
    }),
    sneakers: item({
      name: 'Zapas negras',
      category: 'FOOTWEAR',
      modelKey: 'sneakers',
    }),
    jacket1: item({
      name: 'Bomber verde',
      category: 'OUTERWEAR',
      modelKey: 'jacket',
      color: '#3E8E41',
      attributes: { style: 'bomber' },
    }),
    jacket2: item({
      name: 'Cazadora roja',
      category: 'OUTERWEAR',
      modelKey: 'jacket',
      color: '#C0282D',
      attributes: { style: 'biker' },
    }),
    jacket3: item({
      name: 'Abrigo camel',
      category: 'OUTERWEAR',
      modelKey: 'coat',
      color: '#B58450',
      attributes: { style: 'overcoat' },
    }),
  };
}

const outfit = (
  id: string,
  itemIds: string[],
  p: Partial<AOutfit> = {},
): AOutfit => ({
  id,
  name: id,
  style: null,
  createdAt: new Date('2026-11-05T10:00:00Z'),
  ratingScore: null,
  isFavorite: false,
  itemIds,
  ...p,
});

describe('style analytics', () => {
  it('zona horaria: el día y «este mes» son los de quien mira', () => {
    expect(isValidTimeZone('Europe/Madrid')).toBe(true);
    expect(isValidTimeZone('Nada/Nada')).toBe(false);
    expect(localDay(new Date('2026-10-31T23:30:00Z'), 'Europe/Madrid')).toBe(
      '2026-11-01',
    );
    expect(localDay(new Date('2026-10-31T23:30:00Z'), 'UTC')).toBe(
      '2026-10-31',
    );
  });

  it('sin datos: ceros y nulls, nada inventado', () => {
    const r = analyze({
      items: [],
      outfits: [],
      worn: [],
      now,
      tz: 'Europe/Madrid',
    });
    expect(r.totals).toMatchObject({
      items: 0,
      outfits: 0,
      outfitsThisMonth: 0,
      avgRating: null,
    });
    expect(r.highlights).toMatchObject({
      topStyle: null,
      topColor: null,
      topBrand: null,
      mostCombined: null,
    });
    expect(r.colors.ranking).toEqual([]);
    expect(r.insights).toEqual([]);
    expect(r.evolution.monthly).toHaveLength(12);
    expect(r.evolution.weekly).toHaveLength(12);
  });

  it('totales, estilo, color, marca y prenda más combinada', () => {
    const w = wardrobe();
    const outfits = [
      outfit('a', [w.hoodie.id, w.cargo.id, w.sneakers.id], {
        style: 'STREETWEAR',
        ratingScore: 70,
      }),
      outfit('b', [w.tee.id, w.cargo.id, w.sneakers.id], {
        style: 'STREETWEAR',
        ratingScore: 60,
      }),
      outfit('c', [w.hoodie.id, w.cargo.id], {
        createdAt: new Date('2026-09-10T10:00:00Z'),
      }),
    ];
    const r = analyze({
      items: Object.values(w),
      outfits,
      worn: [{ outfitId: 'a', date: '2026-11-12' }],
      now,
      tz: 'Europe/Madrid',
    });
    expect(r.totals).toMatchObject({
      items: 7,
      outfits: 3,
      outfitsThisMonth: 2,
      worn30: 1,
      avgRating: 65,
    });
    expect(r.highlights.topStyle?.style).toBe('STREETWEAR');
    expect(r.highlights.topColor?.name).toBe('negro');
    expect(r.highlights.topBrand).toEqual({ name: 'Nike', count: 2 });
    expect(r.highlights.mostCombined).toMatchObject({
      name: 'Cargo negro',
      count: 3,
    });
    expect(r.styles.reduce((a, s) => a + s.count, 0)).toBe(3);
    expect(r.colors.pairs[0]).toMatchObject({
      a: { name: 'blanco' },
      b: { name: 'negro' },
    });
    expect(r.unused.count).toBe(3);
    const nov = r.evolution.monthly.find((m) => m.key === '2026-11')!;
    expect(nov.outfits).toBe(2);
    expect(nov.worn).toBe(1);
    expect(nov.styles.STREETWEAR).toBe(2);
  });

  it('insights a partir de los datos: negro de más, chaquetas sin usar, prendas sin combinar', () => {
    const w = wardrobe();
    const outfits = [
      outfit('a', [w.hoodie.id, w.cargo.id, w.sneakers.id], {
        style: 'STREETWEAR',
      }),
      outfit('b', [w.hoodie.id, w.cargo.id, w.sneakers.id], {
        style: 'STREETWEAR',
      }),
      outfit('c', [w.hoodie.id, w.cargo.id, w.sneakers.id], {
        style: 'STREETWEAR',
      }),
      outfit('d', [w.tee.id, w.cargo.id, w.sneakers.id], {
        style: 'STREETWEAR',
      }),
    ];
    const r = analyze({
      items: Object.values(w),
      outfits,
      worn: [],
      now,
      tz: 'Europe/Madrid',
    });
    const codes = r.insights.map((i) => i.code);
    expect(codes).toContain('color.dominant');
    expect(codes).toContain('style.dominant');
    expect(codes).toContain('category.outerwear');
    expect(codes).toContain('items.unused');
    expect(codes).toContain('color.forgotten');
    expect(r.insights.find((i) => i.code === 'color.dominant')?.title).toBe(
      'Utilizas demasiado el negro',
    );
  });

  it('los datos de una persona no se mezclan: solo cuenta lo que se le pasa', () => {
    const w = wardrobe();
    const r = analyze({
      items: [w.tee],
      outfits: [outfit('x', [w.hoodie.id])],
      worn: [],
      now,
      tz: 'UTC',
    });
    // La sudadera no está entre sus prendas: no cuenta para colores ni estilos.
    expect(r.colors.ranking).toEqual([]);
    expect(r.styles.every((s) => s.count === 0)).toBe(true);
  });
});
