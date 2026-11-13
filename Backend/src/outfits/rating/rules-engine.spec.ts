import { RatingItem, tierFor } from './rating.types';
import {
  detectStyle,
  occasionOf,
  rateOutfit,
  scoreOutfit,
} from './rules-engine';

let n = 0;
const item = (
  p: Partial<RatingItem> & Pick<RatingItem, 'category' | 'modelKey'>,
): RatingItem => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  name: p.name ?? p.modelKey,
  color: '#808080',
  attributes: {},
  styles: [],
  season: 'ALL_SEASON',
  patterned: false,
  styling: {},
  detailColors: [],
  details: 0,
  ...p,
});

const kit = () => {
  n = 0;
  return {
    hoodie: item({
      name: 'Sudadera negra',
      category: 'TOP',
      modelKey: 'sweater',
      color: '#111111',
      attributes: { neckline: 'hoodie', fit: 'oversized' },
    }),
    tee: item({
      name: 'Camiseta blanca',
      category: 'TOP',
      modelKey: 'tshirt',
      color: '#F4F4F2',
      attributes: { fit: 'regular' },
    }),
    redTee: item({
      name: 'Camiseta roja',
      category: 'TOP',
      modelKey: 'tshirt',
      color: '#C0282D',
      attributes: { fit: 'oversized' },
    }),
    cargo: item({
      name: 'Cargo gris',
      category: 'BOTTOM',
      modelKey: 'pants',
      color: '#8A8A8A',
      attributes: { fit: 'cargo' },
    }),
    slim: item({
      name: 'Pantalón negro',
      category: 'BOTTOM',
      modelKey: 'pants',
      color: '#151515',
      attributes: { fit: 'slim' },
    }),
    chinos: item({
      name: 'Chino camel',
      category: 'BOTTOM',
      modelKey: 'pants',
      color: '#B58450',
      attributes: { fit: 'straight', material: 'chino' },
    }),
    green: item({
      name: 'Pantalón verde',
      category: 'BOTTOM',
      modelKey: 'pants',
      color: '#2E9E3A',
      attributes: { fit: 'regular' },
    }),
    sneakers: item({
      name: 'Zapas blancas',
      category: 'FOOTWEAR',
      modelKey: 'sneakers',
      color: '#F5F5F5',
      attributes: { style: 'court' },
    }),
    redSneakers: item({
      name: 'Zapas rojas',
      category: 'FOOTWEAR',
      modelKey: 'sneakers',
      color: '#C9252C',
      attributes: { style: 'chunky' },
    }),
    boots: item({
      name: 'Botas',
      category: 'FOOTWEAR',
      modelKey: 'boots',
      color: '#1a1a1a',
      attributes: { style: 'combat' },
    }),
    cap: item({
      name: 'Gorra negra',
      category: 'ACCESSORY',
      modelKey: 'cap',
      color: '#101010',
    }),
    redCap: item({
      name: 'Gorra roja',
      category: 'ACCESSORY',
      modelKey: 'cap',
      color: '#C42A30',
    }),
    blazer: item({
      name: 'Blazer',
      category: 'OUTERWEAR',
      modelKey: 'jacket',
      color: '#1D2A44',
      attributes: { style: 'blazer' },
    }),
    yellow: item({
      name: 'Sudadera amarilla',
      category: 'TOP',
      modelKey: 'sweater',
      color: '#F0D44A',
      attributes: { neckline: 'hoodie' },
    }),
    shirt: item({
      name: 'Camisa celeste',
      category: 'TOP',
      modelKey: 'shirt',
      color: '#9EC3E6',
      attributes: { collar: 'button_down' },
    }),
    chelsea: item({
      name: 'Chelsea marrón',
      category: 'FOOTWEAR',
      modelKey: 'boots',
      color: '#6B4423',
      attributes: { style: 'chelsea' },
    }),
    purple: item({
      name: 'Chaqueta morada',
      category: 'OUTERWEAR',
      modelKey: 'jacket',
      color: '#6B3FA0',
      attributes: { style: 'bomber' },
    }),
  };
};

describe('rules rating engine', () => {
  it('niveles por tramos', () => {
    expect(tierFor(0)).toBe('BEGINNER');
    expect(tierFor(39)).toBe('BEGINNER');
    expect(tierFor(40)).toBe('CASUAL');
    expect(tierFor(60)).toBe('GOOD_STYLE');
    expect(tierFor(80)).toBe('FASHION_KILLER');
    expect(tierFor(94)).toBe('FASHION_KILLER');
    expect(tierFor(95)).toBe('STREETWEAR_LEGEND');
    expect(tierFor(100)).toBe('STREETWEAR_LEGEND');
  });

  it('outfit vacío: 0 y sin insignias', () => {
    const r = rateOutfit({ items: [] });
    expect(r.total).toBe(0);
    expect(r.badges).toEqual([]);
    expect(r.tier).toBe('BEGINNER');
  });

  it('cada categoría queda entre 0 y 25 y el total es la suma', () => {
    const k = kit();
    const sets = [
      [k.hoodie],
      [k.hoodie, k.cargo, k.sneakers, k.cap],
      [k.yellow, k.green, k.purple, k.redSneakers, k.redCap, k.boots, k.cargo],
      [k.tee, k.chinos, k.blazer, k.boots],
    ];
    for (const items of sets) {
      const r = rateOutfit({ items });
      let sum = 0;
      for (const c of Object.values(r.categories)) {
        expect(c.score >= 0 && c.score <= 25).toBe(true);
        sum += c.score;
      }
      expect(r.total).toBe(sum);
    }
  });

  it('un streetwear completo y coherente puntúa mejor que uno a medias', () => {
    const k = kit();
    const full = scoreOutfit({
      items: [k.hoodie, k.cargo, k.sneakers, k.cap],
      style: 'STREETWEAR',
    }).total;
    const half = scoreOutfit({ items: [k.hoodie], style: 'STREETWEAR' }).total;
    expect(full).toBeGreaterThan(half + 25);
    expect(full).toBeGreaterThanOrEqual(60);
  });

  it('colores: un acento sobre neutros gana a tres colores que chocan', () => {
    const k = kit();
    const accent = scoreOutfit({ items: [k.redTee, k.slim, k.sneakers] })
      .categories.colors.score;
    const busy = scoreOutfit({
      items: [k.yellow, k.green, k.purple, k.sneakers],
    }).categories.colors.score;
    expect(accent).toBeGreaterThan(busy + 8);
  });

  it('eco de color: la gorra roja repite la camiseta roja', () => {
    const k = kit();
    const r = rateOutfit({ items: [k.redTee, k.slim, k.sneakers, k.redCap] });
    expect(
      r.categories.colors.checks.some((c) => c.code === 'colors.echo'),
    ).toBe(true);
  });

  it('equilibrio: sin calzado o con dos pantalones resta', () => {
    const k = kit();
    const ok = scoreOutfit({ items: [k.tee, k.slim, k.sneakers] }).categories
      .balance.score;
    const noShoes = scoreOutfit({ items: [k.tee, k.slim] }).categories.balance
      .score;
    const twoBottoms = scoreOutfit({
      items: [k.tee, k.slim, k.cargo, k.sneakers],
    }).categories.balance.score;
    expect(ok).toBeGreaterThan(noShoes);
    expect(ok).toBeGreaterThan(twoBottoms);
  });

  it('estilo: un blazer en un outfit trap resta coherencia', () => {
    const k = kit();
    const clean = scoreOutfit({
      items: [k.hoodie, k.cargo, k.redSneakers],
      style: 'TRAP',
    }).categories.style.score;
    const mixed = scoreOutfit({
      items: [k.hoodie, k.cargo, k.redSneakers, k.blazer],
      style: 'TRAP',
    }).categories.style.score;
    expect(clean).toBeGreaterThan(mixed);
  });

  it('detalles: un accesorio y cómo se lleva suman', () => {
    const k = kit();
    const plain = scoreOutfit({ items: [k.tee, k.slim, k.sneakers] }).categories
      .details.score;
    const styled = scoreOutfit({
      items: [
        { ...k.tee, styling: { tuck: 'front' } },
        k.slim,
        k.sneakers,
        k.cap,
      ],
    }).categories.details.score;
    expect(styled).toBeGreaterThan(plain + 6);
  });

  it('detecta el estilo por las prendas', () => {
    const k = kit();
    expect(detectStyle([k.shirt, k.chinos, k.blazer, k.chelsea])).toBe(
      'OLD_MONEY',
    );
    expect(['STREETWEAR', 'SKATE', 'TRAP', 'TECHWEAR']).toContain(
      detectStyle([k.hoodie, k.cargo, k.sneakers]),
    );
  });

  it('reconoce la ocasión por palabras', () => {
    expect(occasionOf('Fiesta en el club')).toBe('party');
    expect(occasionOf('Curro')).toBe('work');
    expect(occasionOf('Boda de mi prima')).toBe('formal_event');
    expect(occasionOf('xyz')).toBe(null);
  });

  it('propone prendas concretas del armario con los puntos que suman (y son verdad)', () => {
    const k = kit();
    const input = { items: [k.hoodie, k.cargo], style: 'STREETWEAR' as const };
    const r = rateOutfit(input, Object.values(k));
    const add = r.tips.find((t) => t.code === 'add.shoes');
    expect(add?.action?.type).toBe('add');
    const id = add?.action?.type === 'add' ? add.action.itemId : '';
    const after = scoreOutfit({
      ...input,
      items: [...input.items, Object.values(k).find((i) => i.id === id)!],
    }).total;
    expect(after - r.total).toBe(add?.gain);
  });

  it('es determinista', () => {
    const k = kit();
    const a = rateOutfit(
      { items: [k.hoodie, k.cargo, k.sneakers, k.cap] },
      Object.values(k),
    );
    const b = rateOutfit(
      { items: [k.hoodie, k.cargo, k.sneakers, k.cap] },
      Object.values(k),
    );
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
