import { canCreate, LimitRule, resolveLimit } from './plan-limits';

const rules: LimitRule[] = [
  { resource: 'WARDROBES', isUnlimited: false, maxCount: 2 },
  { resource: 'OUTFITS', isUnlimited: true, maxCount: 0 },
];

describe('resolveLimit', () => {
  it('devuelve el máximo definido', () => {
    expect(resolveLimit(rules, 'WARDROBES')).toEqual({
      isUnlimited: false,
      max: 2,
    });
  });

  it('representa "ilimitado" de forma explícita', () => {
    expect(resolveLimit(rules, 'OUTFITS')).toEqual({
      isUnlimited: true,
      max: null,
    });
  });

  it('si el plan no define el recurso, el límite es 0', () => {
    expect(resolveLimit(rules, 'WARDROBE_ITEMS')).toEqual({
      isUnlimited: false,
      max: 0,
    });
  });

  it('nunca devuelve un máximo negativo', () => {
    expect(
      resolveLimit(
        [{ resource: 'WARDROBES', isUnlimited: false, maxCount: -5 }],
        'WARDROBES',
      ).max,
    ).toBe(0);
  });
});

describe('canCreate', () => {
  const two = { isUnlimited: false, max: 2 };

  it('permite crear mientras no se supere el máximo', () => {
    expect(canCreate(two, 0)).toBe(true);
    expect(canCreate(two, 1)).toBe(true);
  });

  it('bloquea al llegar al máximo', () => {
    expect(canCreate(two, 2)).toBe(false);
    expect(canCreate(two, 5)).toBe(false); // p. ej. tras bajar de plan
  });

  it('tiene en cuenta creaciones múltiples', () => {
    expect(canCreate(two, 1, 2)).toBe(false);
  });

  it('ilimitado siempre permite', () => {
    expect(canCreate({ isUnlimited: true, max: null }, 10_000)).toBe(true);
  });
});
