import {
  computeBudget,
  crossesTarget,
  priceTrend,
  toCents,
} from './wishlist.rules';

const d = (s: string) => new Date(s);

describe('wishlist rules', () => {
  it('céntimos sin errores de coma flotante', () => {
    expect(toCents('119.99')).toBe(11999);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(null)).toBe(null);
  });

  it('presupuesto: pendiente, comprado, objetivo y lo que falta (solo en su moneda)', () => {
    const b = computeBudget(
      [
        {
          status: 'WANT',
          category: 'SNEAKERS',
          currentPrice: 12000,
          purchasePrice: null,
          currency: 'EUR',
        },
        {
          status: 'SAVING',
          category: 'HOODIES',
          currentPrice: 8050,
          purchasePrice: null,
          currency: 'EUR',
        },
        {
          status: 'PENDING',
          category: 'PANTS',
          currentPrice: null,
          purchasePrice: null,
          currency: null,
        },
        {
          status: 'WANT',
          category: 'JACKETS',
          currentPrice: 20000,
          purchasePrice: null,
          currency: 'USD',
        },
        {
          status: 'PURCHASED',
          category: 'TSHIRTS',
          currentPrice: 3000,
          purchasePrice: 2500,
          currency: 'EUR',
        },
      ],
      [{ purchasePrice: 9000, currency: 'EUR' }],
      { budget: 30000, saved: 10000, currency: 'EUR' },
    );
    expect(b.counts).toMatchObject({
      total: 5,
      pending: 4,
      purchased: 2,
      unpriced: 1,
    });
    expect(b.counts.byStatus).toEqual({
      WANT: 2,
      SAVING: 1,
      PENDING: 1,
      PURCHASED: 1,
    });
    expect(b.money).toMatchObject({
      totalValue: 200.5,
      spent: 115,
      budget: 300,
      saved: 100,
      remaining: 200,
      shortfall: 100.5,
    });
    expect(b.money.progress).toBe(33.3);
    expect(b.money.otherCurrencies).toEqual([
      { currency: 'USD', total: 200, count: 1 },
    ]);
  });

  it('sin presupuesto objetivo: restante null', () => {
    const b = computeBudget([], [], {
      budget: null,
      saved: 0,
      currency: 'EUR',
    });
    expect(b.money).toMatchObject({
      totalValue: 0,
      remaining: null,
      progress: null,
      coverage: null,
    });
  });

  it('tendencia del precio', () => {
    expect(priceTrend([])).toBe(null);
    const t = priceTrend([
      { price: 12000, recordedAt: d('2026-10-01') },
      { price: 9999, recordedAt: d('2026-11-01') },
      { price: 10999, recordedAt: d('2026-10-15') },
    ])!;
    expect(t).toMatchObject({
      direction: 'down',
      diff: -10,
      lowest: 99.99,
      highest: 120,
      isLowest: true,
      points: 3,
    });
  });

  it('avisa solo al cruzar el precio objetivo hacia abajo', () => {
    expect(crossesTarget(12000, 9900, 10000)).toBe(true);
    expect(crossesTarget(9900, 9500, 10000)).toBe(false);
    expect(crossesTarget(null, 9000, 10000)).toBe(true);
    expect(crossesTarget(12000, 11000, 10000)).toBe(false);
    expect(crossesTarget(12000, 9000, null)).toBe(false);
  });
});
