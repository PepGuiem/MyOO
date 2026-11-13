import { bearer, createTestApp, registerUser, TestContext } from './utils';

describe('Estilo de las prendas en un outfit (e2e)', () => {
  let ctx: TestContext;
  let user: { token: string; userId: string };
  const item: Record<string, string> = {};

  beforeAll(async () => {
    ctx = await createTestApp();
    user = await registerUser(ctx, 'stylist');
    const w = await ctx.http().post('/api/wardrobes').set(...bearer(user.token)).send({ name: 'Armario' }).expect(201);
    const types = await ctx.prisma.garmentType.findMany({ where: { code: { in: ['SHIRT', 'PANTS', 'SNEAKERS'] } } });
    for (const t of types) {
      const res = await ctx
        .http()
        .post('/api/wardrobe-items')
        .set(...bearer(user.token))
        .send({ wardrobeId: w.body.id, garmentTypeId: t.id, name: t.code, color: '#333333' })
        .expect(201);
      item[t.code] = res.body.id;
    }
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('las opciones de estilo vienen con cada tipo de prenda', async () => {
    const res = await ctx.http().get('/api/garment-types').expect(200);
    const shirt = res.body.find((t: { code: string }) => t.code === 'SHIRT');
    expect(shirt.stylingOptions.map((o: { key: string }) => o.key)).toEqual(['tuck', 'sleeves', 'front']);
    const sneakers = res.body.find((t: { code: string }) => t.code === 'SNEAKERS');
    expect(sneakers.stylingOptions).toEqual([]);
  });

  it('guarda y devuelve el estilo de cada prenda', async () => {
    const res = await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(user.token))
      .send({
        name: 'Oficina',
        items: [
          { wardrobeItemId: item.SHIRT, styling: { tuck: 'in', sleeves: 'rolled' } },
          { wardrobeItemId: item.PANTS, styling: { hem: 'cuffed' } },
          { wardrobeItemId: item.SNEAKERS },
        ],
      })
      .expect(201);
    const byId = Object.fromEntries(
      res.body.items.map((i: { wardrobeItem: { id: string }; styling: unknown }) => [i.wardrobeItem.id, i.styling]),
    );
    expect(byId[item.SHIRT]).toEqual({ tuck: 'in', sleeves: 'rolled' });
    expect(byId[item.PANTS]).toEqual({ hem: 'cuffed' });
    expect(byId[item.SNEAKERS]).toEqual({});
  });

  it('400 con opciones que no son de esa prenda o valores desconocidos', async () => {
    for (const styling of [{ tuck: 'in' }, { visor: 'backward' }]) {
      await ctx
        .http()
        .post('/api/outfits')
        .set(...bearer(user.token))
        .send({ name: 'Mal', items: [{ wardrobeItemId: item.SNEAKERS, styling }] })
        .expect(400);
    }
    await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(user.token))
      .send({ name: 'Mal', items: [{ wardrobeItemId: item.SHIRT, styling: { tuck: 'dentro' } }] })
      .expect(400);
    await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(user.token))
      .send({ name: 'Mal', items: [{ wardrobeItemId: item.SHIRT, styling: 'in' }] })
      .expect(400);
  });
});
