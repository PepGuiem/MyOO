import { bearer, createTestApp, registerUser, TestContext } from './utils';

describe('WISHLIST (e2e)', () => {
  let ctx: TestContext;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let sneakers: string;
  let hoodie: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    alice = await registerUser(ctx, 'alice');
    bob = await registerUser(ctx, 'bob');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('añade artículos (crea el armario si no hay) con precio inicial en el historial', async () => {
    const res = await ctx
      .http()
      .post('/api/wishlist')
      .set(...bearer(alice.token))
      .send({
        name: 'Zapas blancas',
        category: 'SNEAKERS',
        color: '#F5F5F5',
        brand: 'Marca X',
        size: '43',
        price: 120,
        productUrl: 'https://tienda.example/zapas',
        targetPrice: 100,
      })
      .expect(201);
    sneakers = res.body.id;
    expect(res.body).toMatchObject({
      wishlistStatus: 'WANT',
      wishlistCategory: 'SNEAKERS',
      currentPrice: '120',
      currency: 'EUR',
      size: '43',
    });
    expect(res.body.attributes.brand).toBe('Marca X');
    expect(res.body.garmentType.code).toBe('SNEAKERS');
    expect(res.body.prices).toHaveLength(1);
    const h = await ctx
      .http()
      .post('/api/wishlist')
      .set(...bearer(alice.token))
      .send({
        name: 'Sudadera gris',
        category: 'HOODIES',
        color: '#8A8A8A',
        status: 'SAVING',
        price: 80.5,
      })
      .expect(201);
    hoodie = h.body.id;
    expect(h.body.attributes.neckline).toBe('hoodie');
    await ctx
      .http()
      .post('/api/wishlist')
      .set(...bearer(alice.token))
      .send({ name: 'Algo', category: 'OTHER', color: '#000000' })
      .expect(400);
    await ctx
      .http()
      .post('/api/wishlist')
      .set(...bearer(alice.token))
      .send({ name: 'Sin color', category: 'PANTS' })
      .expect(400);
  });

  it('la wishlist no sale en el armario ni cuenta para el límite; sí se puede pedir aparte', async () => {
    const wardrobe = await ctx
      .http()
      .get('/api/wardrobe-items')
      .set(...bearer(alice.token))
      .expect(200);
    expect(wardrobe.body.meta.total).toBe(0);
    const all = await ctx
      .http()
      .get('/api/wardrobe-items?wishlist=include')
      .set(...bearer(alice.token))
      .expect(200);
    expect(all.body.meta.total).toBe(2);
    const wardrobes = await ctx
      .http()
      .get('/api/wardrobes')
      .set(...bearer(alice.token))
      .expect(200);
    expect(wardrobes.body.data[0]).toMatchObject({
      name: 'Mi armario',
      itemCount: 0,
    });
  });

  it('filtros, búsqueda y orden', async () => {
    const s = await ctx
      .http()
      .get('/api/wishlist?status=SAVING')
      .set(...bearer(alice.token))
      .expect(200);
    expect(s.body.data.map((i: { id: string }) => i.id)).toEqual([hoodie]);
    const c = await ctx
      .http()
      .get('/api/wishlist?category=SNEAKERS')
      .set(...bearer(alice.token))
      .expect(200);
    expect(c.body.meta.total).toBe(1);
    const q = await ctx
      .http()
      .get('/api/wishlist?search=sudadera')
      .set(...bearer(alice.token))
      .expect(200);
    expect(q.body.meta.total).toBe(1);
    const asc = await ctx
      .http()
      .get('/api/wishlist?sort=price_asc')
      .set(...bearer(alice.token))
      .expect(200);
    expect(asc.body.data[0].id).toBe(hoodie);
  });

  it('precios: historial, tendencia y aviso al bajar del objetivo', async () => {
    const r = await ctx
      .http()
      .post(`/api/wishlist/${sneakers}/prices`)
      .set(...bearer(alice.token))
      .send({ price: 95, note: 'Rebajas' })
      .expect(201);
    expect(r.body.currentPrice).toBe('95');
    expect(r.body.trend).toMatchObject({ direction: 'down', diff: -25 });
    const n = await ctx.prisma.notification.findMany({
      where: { userId: alice.userId, type: 'PRICE_DROP' },
    });
    expect(n).toHaveLength(1);
    await ctx
      .http()
      .post(`/api/wishlist/${sneakers}/prices`)
      .set(...bearer(alice.token))
      .send({ price: 90 })
      .expect(201);
    expect(
      await ctx.prisma.notification.count({
        where: { userId: alice.userId, type: 'PRICE_DROP' },
      }),
    ).toBe(1);
    await ctx
      .http()
      .post(`/api/wishlist/${sneakers}/prices`)
      .set(...bearer(alice.token))
      .send({ price: 90, currency: 'USD' })
      .expect(400);
    const hist = await ctx
      .http()
      .get(`/api/wishlist/${sneakers}/prices`)
      .set(...bearer(alice.token))
      .expect(200);
    expect(hist.body.map((p: { price: string }) => p.price)).toEqual([
      '120',
      '95',
      '90',
    ]);
    const back = await ctx
      .http()
      .delete(`/api/wishlist/${sneakers}/prices/${hist.body[2].id}`)
      .set(...bearer(alice.token))
      .expect(200);
    expect(back.body.currentPrice).toBe('95');
  });

  it('sin servicios de seguimiento no se inventa nada', async () => {
    await ctx
      .http()
      .patch(`/api/wishlist/${sneakers}`)
      .set(...bearer(alice.token))
      .send({ trackPrice: true })
      .expect(200);
    const r = await ctx
      .http()
      .post('/api/wishlist/prices/refresh')
      .set(...bearer(alice.token))
      .expect(200);
    expect(r.body).toEqual({
      trackers: 0,
      tracked: 1,
      updated: 0,
      unsupported: 1,
    });
  });

  it('presupuesto', async () => {
    const b = await ctx
      .http()
      .put('/api/wishlist/budget')
      .set(...bearer(alice.token))
      .send({ budget: 300, saved: 50 })
      .expect(200);
    expect(b.body.money).toMatchObject({
      totalValue: 175.5,
      budget: 300,
      saved: 50,
      remaining: 250,
      shortfall: 125.5,
    });
    expect(b.body.counts).toMatchObject({ total: 2, pending: 2, purchased: 0 });
  });

  it('se puede usar en un outfit y se distingue', async () => {
    const o = await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(alice.token))
      .send({
        name: 'Con deseo',
        items: [{ wardrobeItemId: hoodie }, { wardrobeItemId: sneakers }],
      })
      .expect(201);
    expect(
      o.body.items.every(
        (i: { wardrobeItem: { wishlistStatus: string | null } }) =>
          i.wardrobeItem.wishlistStatus !== null,
      ),
    ).toBe(true);
  });

  it('comprado → al armario (con su precio de compra)', async () => {
    await ctx
      .http()
      .patch(`/api/wishlist/${hoodie}`)
      .set(...bearer(alice.token))
      .send({ status: 'PURCHASED' })
      .expect(200);
    const moved = await ctx
      .http()
      .post(`/api/wishlist/${hoodie}/move`)
      .set(...bearer(alice.token))
      .send({ purchasePrice: 75 })
      .expect(200);
    expect(moved.body).toMatchObject({
      wishlistStatus: null,
      purchasePrice: '75',
      currency: 'EUR',
    });
    const wardrobe = await ctx
      .http()
      .get('/api/wardrobe-items')
      .set(...bearer(alice.token))
      .expect(200);
    expect(wardrobe.body.meta.total).toBe(1);
    await ctx
      .http()
      .get(`/api/wishlist/${hoodie}`)
      .set(...bearer(alice.token))
      .expect(404);
    const sum = await ctx
      .http()
      .get('/api/wishlist/summary')
      .set(...bearer(alice.token))
      .expect(200);
    expect(sum.body.counts).toMatchObject({
      total: 1,
      purchased: 1,
      movedToWardrobe: 1,
    });
    expect(sum.body.money.spent).toBe(75);
  });

  it('cada persona solo ve y toca lo suyo', async () => {
    const list = await ctx
      .http()
      .get('/api/wishlist')
      .set(...bearer(bob.token))
      .expect(200);
    expect(list.body.meta.total).toBe(0);
    await ctx
      .http()
      .get(`/api/wishlist/${sneakers}`)
      .set(...bearer(bob.token))
      .expect(404);
    await ctx
      .http()
      .patch(`/api/wishlist/${sneakers}`)
      .set(...bearer(bob.token))
      .send({ name: 'x' })
      .expect(404);
    await ctx
      .http()
      .post(`/api/wishlist/${sneakers}/prices`)
      .set(...bearer(bob.token))
      .send({ price: 1 })
      .expect(404);
    await ctx
      .http()
      .delete(`/api/wishlist/${sneakers}`)
      .set(...bearer(bob.token))
      .expect(404);
    await ctx
      .http()
      .delete(`/api/wishlist/${sneakers}`)
      .set(...bearer(alice.token))
      .expect(204);
  });
});
