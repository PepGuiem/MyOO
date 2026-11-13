import { bearer, createTestApp, registerUser, TestContext } from './utils';

describe('Estilista y datos de compra (e2e)', () => {
  let ctx: TestContext;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let typeIds: Record<string, string>;
  let wardrobeId: string;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createTestApp();
    alice = await registerUser(ctx, 'stylist-a');
    bob = await registerUser(ctx, 'stylist-b');
    const types = await ctx.prisma.garmentType.findMany();
    typeIds = Object.fromEntries(types.map((t) => [t.code, t.id]));
    const w = await ctx.http().post('/api/wardrobes').set(...bearer(alice.token)).send({ name: 'Todo' }).expect(201);
    wardrobeId = w.body.id;
    const add = async (key: string, code: string, name: string, color: string, extra: object = {}) => {
      const r = await ctx
        .http()
        .post('/api/wardrobe-items')
        .set(...bearer(alice.token))
        .send({ wardrobeId, garmentTypeId: typeIds[code], name, color, ...extra })
        .expect(201);
      ids[key] = r.body.id;
      return r;
    };
    await add('tee', 'T_SHIRT', 'Camiseta blanca', '#F4F4F2');
    await add('jeans', 'PANTS', 'Vaquero', '#3D5A88', { attributes: { fit: 'straight', material: 'Vaquero' } });
    await add('sneakers', 'SNEAKERS', 'Zapatillas', '#F2F2F2', {
      styles: ['streetwear', 'casual'],
      productName: "Air Force 1 '07",
      storeName: 'Nike',
      purchasePlatform: 'online',
      productUrl: 'https://www.nike.com/es/t/air-force-1-07',
      productRef: 'CW2288-111',
      purchasePrice: 119.99,
      purchaseDate: '2026-03-14',
    });
    await add('coat', 'COAT', 'Abrigo', '#151515', { attributes: { style: 'overcoat' } });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('guarda y devuelve los datos de compra; el precio sin moneda va en euros', async () => {
    const r = await ctx.http().get(`/api/wardrobe-items/${ids.sneakers}`).set(...bearer(alice.token)).expect(200);
    expect(r.body).toMatchObject({
      styles: ['streetwear', 'casual'],
      storeName: 'Nike',
      purchasePlatform: 'online',
      productRef: 'CW2288-111',
      currency: 'EUR',
    });
    expect(Number(r.body.purchasePrice)).toBe(119.99);
    expect(r.body.purchaseDate).toMatch(/^2026-03-14/);
    // null borra
    const cleared = await ctx
      .http()
      .patch(`/api/wardrobe-items/${ids.sneakers}`)
      .set(...bearer(alice.token))
      .send({ productUrl: null, purchasePrice: null })
      .expect(200);
    expect(cleared.body.productUrl).toBeNull();
    expect(cleared.body.purchasePrice).toBeNull();
  });

  it('valida enlace, estilos, plataforma, precio y fecha (400)', async () => {
    const patch = (body: object) =>
      ctx.http().patch(`/api/wardrobe-items/${ids.tee}`).set(...bearer(alice.token)).send(body);
    await patch({ productUrl: 'javascript:alert(1)' }).expect(400);
    await patch({ productUrl: 'ftp://x.com/a' }).expect(400);
    await patch({ styles: ['punk'] }).expect(400);
    await patch({ purchasePlatform: 'robado' }).expect(400);
    await patch({ purchasePrice: -1 }).expect(400);
    await patch({ purchasePrice: 1.234 }).expect(400);
    await patch({ purchaseDate: '14/03/2026' }).expect(400);
    await patch({ currency: 'euros' }).expect(400);
  });

  it('genera outfits completos con las prendas del usuario y las devuelve', async () => {
    const r = await ctx
      .http()
      .post('/api/stylist/outfits')
      .set(...bearer(alice.token))
      .send({ weather: 'cold', count: 2, seed: 4 })
      .expect(200);
    expect(r.body.outfits.length).toBeGreaterThan(0);
    const o = r.body.outfits[0];
    const used = o.items.map((i: { itemId: string }) => i.itemId);
    expect(used).toEqual(expect.arrayContaining([ids.tee, ids.jeans, ids.sneakers, ids.coat]));
    expect(o.reasons.length).toBeGreaterThan(0);
    for (const id of used) expect(r.body.items[id].garmentType.modelKey).toBeDefined();
  });

  it('no deja fijar prendas de otro usuario ni pedir con valores raros', async () => {
    const other = await ctx.http().post('/api/wardrobes').set(...bearer(bob.token)).send({ name: 'B' }).expect(201);
    const bobItem = await ctx
      .http()
      .post('/api/wardrobe-items')
      .set(...bearer(bob.token))
      .send({ wardrobeId: other.body.id, garmentTypeId: typeIds.T_SHIRT, name: 'X', color: '#000000' })
      .expect(201);
    await ctx
      .http()
      .post('/api/stylist/outfits')
      .set(...bearer(alice.token))
      .send({ lockedItemIds: [bobItem.body.id] })
      .expect(400);
    await ctx.http().post('/api/stylist/outfits').set(...bearer(alice.token)).send({ style: 'gotico' }).expect(400);
    await ctx
      .http()
      .post('/api/stylist/feedback')
      .set(...bearer(alice.token))
      .send({ signal: 'LIKE', itemIds: [bobItem.body.id] })
      .expect(400);
  });

  it('propone alternativas del mismo hueco y guarda señales', async () => {
    const r = await ctx
      .http()
      .post('/api/stylist/alternatives')
      .set(...bearer(alice.token))
      .send({ itemIds: [ids.tee, ids.jeans, ids.sneakers], replaceItemId: ids.jeans })
      .expect(200);
    expect(Array.isArray(r.body.alternatives)).toBe(true);
    await ctx
      .http()
      .post('/api/stylist/feedback')
      .set(...bearer(alice.token))
      .send({ signal: 'REJECT_TIP', itemIds: [ids.jeans], tipCode: 'roll_hem', style: 'casual' })
      .expect(204);
    await ctx.http().post('/api/stylist/feedback').set(...bearer(alice.token)).send({ signal: 'REJECT_TIP', itemIds: [] }).expect(400);
    const n = await ctx.prisma.stylistFeedback.count({ where: { userId: alice.userId } });
    expect(n).toBe(1);
  });

  it('analiza el armario', async () => {
    const r = await ctx.http().get('/api/stylist/insights').set(...bearer(alice.token)).expect(200);
    expect(r.body.stats.total).toBe(4);
    expect(r.body.insights.map((i: { code: string }) => i.code)).toContain('no_accessory');
  });
});
