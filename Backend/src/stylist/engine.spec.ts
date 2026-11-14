import {
  EMPTY_PREFERENCES,
  EngineItem,
  alternativesFor,
  analyzeWardrobe,
  combinations,
  slotGain,
  colorFamily,
  colorName,
  formality,
  generateOutfits,
  inferStyles,
  slotOf,
} from './engine';

let n = 0;
const item = (
  p: Partial<EngineItem> & Pick<EngineItem, 'category' | 'modelKey'>,
): EngineItem => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  name: p.name ?? p.modelKey,
  color: '#808080',
  attributes: {},
  styles: [],
  season: 'ALL_SEASON',
  patterned: false,
  ...p,
});

const wardrobe = () => {
  n = 0;
  return {
    tee: item({
      name: 'Camiseta blanca',
      category: 'TOP',
      modelKey: 'tshirt',
      color: '#F4F4F2',
      attributes: { fit: 'regular', sleeve: 'short' },
    }),
    hoodie: item({
      name: 'Sudadera roja',
      category: 'TOP',
      modelKey: 'sweater',
      color: '#C0282D',
      attributes: { neckline: 'hoodie', fit: 'oversized' },
    }),
    shirt: item({
      name: 'Camisa celeste',
      category: 'TOP',
      modelKey: 'shirt',
      color: '#9EC3E6',
      attributes: { collar: 'button_down', fit: 'slim' },
    }),
    jeans: item({
      name: 'Vaquero',
      category: 'BOTTOM',
      modelKey: 'pants',
      color: '#3D5A88',
      attributes: { fit: 'straight', material: 'Vaquero' },
    }),
    joggers: item({
      name: 'Jogger gris',
      category: 'BOTTOM',
      modelKey: 'pants',
      color: '#8A8A8A',
      attributes: { fit: 'jogger' },
    }),
    wool: item({
      name: 'Pantalón de lana',
      category: 'BOTTOM',
      modelKey: 'pants',
      color: '#2B2B2E',
      attributes: { fit: 'slim', material: 'Lana' },
    }),
    sneakers: item({
      name: 'Zapatillas blancas',
      category: 'FOOTWEAR',
      modelKey: 'sneakers',
      color: '#F2F2F2',
      attributes: { style: 'court' },
    }),
    chelsea: item({
      name: 'Botas chelsea',
      category: 'FOOTWEAR',
      modelKey: 'boots',
      color: '#3B2416',
      attributes: { style: 'chelsea' },
    }),
    coat: item({
      name: 'Abrigo negro',
      category: 'OUTERWEAR',
      modelKey: 'coat',
      color: '#151515',
      attributes: { style: 'overcoat' },
      season: 'WINTER',
    }),
    cap: item({
      name: 'Gorra negra',
      category: 'ACCESSORY',
      modelKey: 'cap',
      color: '#111111',
    }),
    beanie: item({
      name: 'Gorro gris',
      category: 'ACCESSORY',
      modelKey: 'beanie',
      color: '#777777',
    }),
    boxer: item({
      name: 'Bóxer',
      category: 'BOTTOM',
      modelKey: 'underwear',
      color: '#222222',
    }),
  };
};

const ids = (o: { items: { itemId: string }[] }) =>
  o.items.map((i) => i.itemId);

describe('stylist engine', () => {
  it('clasifica colores: neutros, tierras y colores', () => {
    expect(colorFamily('#000000')).toBe('neutral');
    expect(colorFamily('#FFFFFF')).toBe('neutral');
    expect(colorFamily('#1D2A44')).toBe('neutral'); // azul marino
    expect(colorFamily('#D8C3A0')).toBe('neutral'); // beige
    expect(colorFamily('#8B5A2B')).toBe('earth'); // marrón
    expect(colorFamily('#C0282D')).toBe('color');
    expect(colorName('#C0282D')).toBe('rojo');
    expect(colorName('#F4F4F2')).toBe('blanco');
  });

  it('deduce el nivel de arreglo y los estilos', () => {
    const w = wardrobe();
    expect(formality(w.wool)).toBeGreaterThan(formality(w.jeans));
    expect(formality(w.joggers)).toBeLessThan(0.2);
    expect(inferStyles(w.hoodie)).toContain('streetwear');
    expect(inferStyles(w.coat)).toContain('old_money');
    expect(slotOf(w.boxer)).toBeNull();
  });

  it('genera outfits completos, distintos y sin ropa interior', () => {
    const w = wardrobe();
    const outfits = generateOutfits(Object.values(w), { count: 3, seed: 7 });
    expect(outfits.length).toBe(3);
    expect(new Set(outfits.map((o) => o.key)).size).toBe(3);
    for (const o of outfits) {
      const slots = o.items.map((i) => i.slot);
      expect(slots).toContain('top');
      expect(slots).toContain('bottom');
      expect(slots).toContain('shoes');
      expect(ids(o)).not.toContain(w.boxer.id);
      expect(o.reasons.length).toBeGreaterThan(0);
    }
  });

  it('con frío pone abrigo y con calor lo quita (y el gorro)', () => {
    const w = wardrobe();
    const cold = generateOutfits(Object.values(w), {
      weather: 'cold',
      count: 2,
      seed: 3,
    });
    for (const o of cold) expect(ids(o)).toContain(w.coat.id);
    const hot = generateOutfits(Object.values(w), {
      weather: 'hot',
      count: 3,
      seed: 3,
    });
    for (const o of hot) {
      expect(ids(o)).not.toContain(w.coat.id);
      expect(ids(o)).not.toContain(w.beanie.id);
      expect(ids(o)).not.toContain(w.hoodie.id);
    }
  });

  it('un evento formal elige camisa, lana y botas antes que sudadera y jogger', () => {
    const w = wardrobe();
    const [best] = generateOutfits(Object.values(w), {
      occasion: 'formal_event',
      count: 1,
      seed: 1,
    });
    expect(ids(best)).toEqual(
      expect.arrayContaining([w.shirt.id, w.wool.id, w.chelsea.id]),
    );
    expect(ids(best)).not.toContain(w.joggers.id);
  });

  it('respeta las prendas fijadas y las excluidas', () => {
    const w = wardrobe();
    const outfits = generateOutfits(Object.values(w), {
      lockedIds: [w.hoodie.id],
      excludeIds: [w.jeans.id],
      count: 2,
      seed: 5,
    });
    for (const o of outfits) {
      expect(ids(o)).toContain(w.hoodie.id);
      expect(ids(o)).not.toContain(w.jeans.id);
    }
  });

  it('es determinista con la misma semilla', () => {
    const w = wardrobe();
    const a = generateOutfits(Object.values(w), { count: 3, seed: 42 }).map(
      (o) => o.key,
    );
    const b = generateOutfits(Object.values(w), { count: 3, seed: 42 }).map(
      (o) => o.key,
    );
    expect(a).toEqual(b);
  });

  it('da consejos con acción y no repite los que se rechazan siempre', () => {
    const w = wardrobe();
    const pool = [w.tee, w.jeans, w.sneakers, w.chelsea, w.cap];
    const [o] = generateOutfits(pool, { style: 'casual', count: 1, seed: 2 });
    const codes = o.tips.map((t) => t.code);
    expect(codes).toContain('roll_hem');
    const roll = o.tips.find((t) => t.code === 'roll_hem');
    expect(roll?.action).toEqual({
      type: 'styling',
      itemId: w.jeans.id,
      styling: { hem: 'cuffed' },
    });
    const prefs = { ...EMPTY_PREFERENCES, rejectedTips: { roll_hem: 3 } };
    const [o2] = generateOutfits(
      pool,
      { style: 'casual', count: 1, seed: 2 },
      prefs,
    );
    expect(o2.tips.map((t) => t.code)).not.toContain('roll_hem');
  });

  it('aprende: una prenda guardada muchas veces sube y un conjunto rechazado baja', () => {
    const w = wardrobe();
    const pool = [w.tee, w.shirt, w.jeans, w.sneakers];
    const first = generateOutfits(pool, { count: 1, seed: 9 })[0];
    const prefs = { ...EMPTY_PREFERENCES, disliked: [first.key] };
    const again = generateOutfits(pool, { count: 1, seed: 9 }, prefs)[0];
    expect(again.key).not.toBe(first.key);
  });

  it('propone cambios del mismo hueco', () => {
    const w = wardrobe();
    const pool = Object.values(w);
    const alts = alternativesFor(
      pool,
      [w.tee.id, w.jeans.id, w.sneakers.id],
      w.jeans.id,
      { style: 'formal' },
    );
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) expect([w.joggers.id, w.wool.id]).toContain(a.itemId);
    expect(alts[0].itemId).toBe(w.wool.id);
  });

  it('detecta lo que le falta al armario', () => {
    const w = wardrobe();
    const a = analyzeWardrobe([w.tee, w.hoodie, w.shirt, w.jeans]);
    const codes = a.insights.map((i) => i.code);
    expect(codes).toContain('no_shoes');
    expect(codes).toContain('no_outerwear');
    expect(a.stats.total).toBe(4);
    expect(analyzeWardrobe([]).insights[0].code).toBe('empty');
  });

  it('cuenta combinaciones y lo que gana el armario con cada prenda sugerida', () => {
    expect(
      combinations({ top: 3, bottom: 2, full: 1, shoes: 2, outer: 1 }),
    ).toBe((3 * 2 + 1) * 2 * 2);
    // Sin calzado no sale ningún outfit; un par lo hace posible.
    expect(
      slotGain({ top: 2, bottom: 1, full: 0, shoes: 0, outer: 0 }, 'shoes'),
    ).toEqual({ before: 0, after: 2 });
    expect(
      slotGain({ top: 2, bottom: 1, full: 0, shoes: 1, outer: 0 }, 'accessory'),
    ).toBeNull();

    const w = wardrobe();
    // 3 partes de arriba, 1 de abajo y sin calzado.
    const a = analyzeWardrobe([w.tee, w.hoodie, w.shirt, w.jeans]);
    const shoes = a.insights.find((i) => i.code === 'no_shoes');
    expect(shoes?.suggestion).toMatchObject({
      slot: 'shoes',
      wishlistCategory: 'SNEAKERS',
      gain: { before: 0 },
    });
    expect(shoes?.suggestion?.gain?.after).toBeGreaterThan(0);
    expect(a.stats.combinations).toBe(0);
    // Los avisos que no son una prenda no llevan sugerencia.
    for (const i of a.insights)
      if (i.code === 'unused' || i.code === 'empty')
        expect(i.suggestion).toBeUndefined();
  });
});
