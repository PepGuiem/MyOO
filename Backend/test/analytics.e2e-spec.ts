import { bearer, createTestApp, registerUser, TestContext } from './utils';

describe('STYLE ANALYTICS (e2e)', () => {
  let ctx: TestContext;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let items: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    alice = await registerUser(ctx, 'alice');
    bob = await registerUser(ctx, 'bob');
    const types = await ctx.prisma.garmentType.findMany({
      where: { code: { in: ['T_SHIRT', 'PANTS', 'SNEAKERS'] } },
    });
    const w = await ctx
      .http()
      .post('/api/wardrobes')
      .set(...bearer(alice.token))
      .send({ name: 'Armario' })
      .expect(201);
    const colors = ['#111111', '#111111', '#F4F4F2'];
    items = [];
    for (let i = 0; i < types.length; i++) {
      const r = await ctx
        .http()
        .post('/api/wardrobe-items')
        .set(...bearer(alice.token))
        .send({
          wardrobeId: w.body.id,
          garmentTypeId: types[i].id,
          name: `Prenda ${i}`,
          color: colors[i],
        })
        .expect(201);
      items.push(r.body.id);
    }
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('cuenta lo real y se actualiza al crear y borrar outfits', async () => {
    const empty = await ctx
      .http()
      .get('/api/analytics?tz=Europe/Madrid')
      .set(...bearer(alice.token))
      .expect(200);
    expect(empty.body.totals).toMatchObject({
      items: 3,
      outfits: 0,
      outfitsThisMonth: 0,
    });
    expect(empty.body.highlights.mostCombined).toBe(null);

    const o = await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(alice.token))
      .send({
        name: 'Uno',
        style: 'MINIMAL',
        items: items.map((wardrobeItemId) => ({ wardrobeItemId })),
      })
      .expect(201);
    const after = await ctx
      .http()
      .get('/api/analytics')
      .set(...bearer(alice.token))
      .expect(200);
    expect(after.body.totals).toMatchObject({
      items: 3,
      outfits: 1,
      outfitsThisMonth: 1,
    });
    expect(after.body.highlights.topStyle.style).toBe('MINIMAL');
    expect(after.body.highlights.topColor.name).toBe('negro');
    expect(after.body.unused.count).toBe(0);

    await ctx
      .http()
      .delete(`/api/outfits/${o.body.id}`)
      .set(...bearer(alice.token))
      .expect(204);
    const gone = await ctx
      .http()
      .get('/api/analytics')
      .set(...bearer(alice.token))
      .expect(200);
    expect(gone.body.totals.outfits).toBe(0);
    expect(gone.body.unused.count).toBe(3);
  });

  it('cada persona ve solo lo suyo', async () => {
    const res = await ctx
      .http()
      .get('/api/analytics')
      .set(...bearer(bob.token))
      .expect(200);
    expect(res.body.totals).toMatchObject({ items: 0, outfits: 0 });
    expect(res.body.colors.ranking).toEqual([]);
  });

  it('zona horaria inválida: 400; sin sesión: 401', async () => {
    await ctx
      .http()
      .get('/api/analytics?tz=Marte/Base')
      .set(...bearer(alice.token))
      .expect(400);
    await ctx.http().get('/api/analytics').expect(401);
  });
});
