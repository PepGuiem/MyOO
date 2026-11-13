import { bearer, createTestApp, registerUser, TestContext } from './utils';

/** «YYYY-MM-DD» de hace n días (UTC). */
const daysAgo = (n: number) =>
  new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

describe('SNEAKER COLLECTION (e2e)', () => {
  let ctx: TestContext;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let pairA: string;
  let pairB: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    alice = await registerUser(ctx, 'alice');
    bob = await registerUser(ctx, 'bob');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const base = {
    brand: 'NIKE',
    model: 'Modelo Uno',
    colorway: 'Blanco/Negro',
    size: '43',
    color: '#F5F5F2',
  };

  it('añade un par a la colección (prenda + ficha) con sus datos de compra', async () => {
    const res = await ctx
      .http()
      .post('/api/sneakers')
      .set(...bearer(alice.token))
      .send({
        ...base,
        condition: 'LIKE_NEW',
        purchasePrice: 120,
        purchaseDate: daysAgo(30),
        notes: 'Mis primeras',
        wearCount: 2,
      })
      .expect(201);
    pairA = res.body.id;
    expect(res.body).toMatchObject({
      name: 'Nike Modelo Uno',
      size: '43',
      purchasePrice: '120',
      currency: 'EUR',
      wishlistStatus: null,
      sneaker: {
        brand: 'NIKE',
        brandLabel: 'Nike',
        model: 'Modelo Uno',
        colorway: 'Blanco/Negro',
        condition: 'LIKE_NEW',
        wearCount: 2,
      },
      uses: { manual: 2, calendar: 0, total: 2 },
      colorName: 'blanco',
    });
    expect(res.body.garmentType.code).toBe('SNEAKERS');
    expect(res.body.attributes.brand).toBe('Nike');
    // Sale en el armario como una prenda más
    const items = await ctx
      .http()
      .get('/api/wardrobe-items')
      .set(...bearer(alice.token))
      .expect(200);
    expect(
      items.body.data.find((i: { id: string }) => i.id === pairA).sneaker.model,
    ).toBe('Modelo Uno');
  });

  it('valida marca, modelo y «Otras»', async () => {
    await ctx
      .http()
      .post('/api/sneakers')
      .set(...bearer(alice.token))
      .send({ model: 'X' })
      .expect(400);
    await ctx
      .http()
      .post('/api/sneakers')
      .set(...bearer(alice.token))
      .send({ brand: 'NIKE' })
      .expect(400);
    await ctx
      .http()
      .post('/api/sneakers')
      .set(...bearer(alice.token))
      .send({ brand: 'OTHER', model: 'X' })
      .expect(400);
    await ctx
      .http()
      .post('/api/sneakers')
      .set(...bearer(alice.token))
      .send({ brand: 'MARCA', model: 'X' })
      .expect(400);
    await ctx
      .http()
      .post('/api/sneakers')
      .set(...bearer(alice.token))
      .send({ ...base, size: '40', purchaseDate: '2999-01-01' })
      .expect(400);
  });

  it('evita duplicados: aviso 409, doble envío y «guardar igualmente»', async () => {
    const dup = await ctx
      .http()
      .post('/api/sneakers')
      .set(...bearer(alice.token))
      .send({
        ...base,
        model: 'modelo  UNO',
        colorway: 'blanco negro',
        size: ' 43',
      })
      .expect(409);
    expect(dup.body).toMatchObject({
      code: 'duplicate_sneaker',
      duplicates: [{ id: pairA, scope: 'owned' }],
    });

    // Dos envíos a la vez del mismo par nuevo: solo se guarda uno.
    const body = { ...base, model: 'Modelo Dos', size: '42' };
    const [r1, r2] = await Promise.all([
      ctx
        .http()
        .post('/api/sneakers')
        .set(...bearer(alice.token))
        .send(body),
      ctx
        .http()
        .post('/api/sneakers')
        .set(...bearer(alice.token))
        .send(body),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    pairB = (r1.status === 201 ? r1 : r2).body.id;

    // Si de verdad tienes dos pares iguales:
    const twin = await ctx
      .http()
      .post('/api/sneakers')
      .set(...bearer(alice.token))
      .send({ ...body, allowDuplicate: true })
      .expect(201);
    await ctx
      .http()
      .delete(`/api/sneakers/${twin.body.id}`)
      .set(...bearer(alice.token))
      .expect(204);
  });

  it('wishlist de sneakers: separada de la colección y avisa si ya tienes el par', async () => {
    const owned = await ctx
      .http()
      .post('/api/sneakers')
      .set(...bearer(alice.token))
      .send({ ...base, scope: 'wish' })
      .expect(409);
    expect(owned.body.message).toBe('You already own this pair');
    const w = await ctx
      .http()
      .post('/api/sneakers')
      .set(...bearer(alice.token))
      .send({
        brand: 'NEW_BALANCE',
        model: 'Modelo Tres',
        colorway: 'Gris',
        size: '43',
        color: '#8A8A8A',
        scope: 'wish',
        price: 150,
        targetPrice: 120,
      })
      .expect(201);
    expect(w.body).toMatchObject({
      wishlistStatus: 'WANT',
      currentPrice: '150',
      sneaker: { brandLabel: 'New Balance' },
    });
    const own = await ctx
      .http()
      .get('/api/sneakers')
      .set(...bearer(alice.token))
      .expect(200);
    expect(own.body.data.map((s: { id: string }) => s.id).sort()).toEqual(
      [pairA, pairB].sort(),
    );
    const wish = await ctx
      .http()
      .get('/api/sneakers?scope=wish')
      .set(...bearer(alice.token))
      .expect(200);
    expect(wish.body.meta.total).toBe(1);
    // También sale en la WISHLIST general
    const wl = await ctx
      .http()
      .get('/api/wishlist?category=SNEAKERS')
      .set(...bearer(alice.token))
      .expect(200);
    expect(wl.body.meta.total).toBe(1);
  });

  it('añade la ficha a unas zapatillas que ya estaban en el armario (sin duplicarlas)', async () => {
    const type = await ctx.prisma.garmentType.findUniqueOrThrow({
      where: { code: 'SNEAKERS' },
    });
    const wardrobe = await ctx.prisma.wardrobe.findFirstOrThrow({
      where: { userId: alice.userId },
    });
    const old = await ctx
      .http()
      .post('/api/wardrobe-items')
      .set(...bearer(alice.token))
      .send({
        wardrobeId: wardrobe.id,
        garmentTypeId: type.id,
        name: 'Zapas viejas',
        color: '#111111',
        size: '44',
      })
      .expect(201);
    const cand = await ctx
      .http()
      .get('/api/sneakers/candidates')
      .set(...bearer(alice.token))
      .expect(200);
    expect(cand.body.map((c: { id: string }) => c.id)).toEqual([old.body.id]);
    const adopted = await ctx
      .http()
      .post(`/api/sneakers/adopt/${old.body.id}`)
      .set(...bearer(alice.token))
      .send({ brand: 'VANS', model: 'Modelo Cuatro', condition: 'WORN' })
      .expect(201);
    expect(adopted.body).toMatchObject({
      id: old.body.id,
      name: 'Zapas viejas',
      sneaker: { brand: 'VANS' },
    });
    await ctx
      .http()
      .post(`/api/sneakers/adopt/${old.body.id}`)
      .set(...bearer(alice.token))
      .send({ brand: 'VANS', model: 'X' })
      .expect(409);
    expect(
      (
        await ctx
          .http()
          .get('/api/sneakers/candidates')
          .set(...bearer(alice.token))
          .expect(200)
      ).body,
    ).toEqual([]);
    // Quitar solo la ficha: la prenda sigue en el armario
    await ctx
      .http()
      .delete(`/api/sneakers/${old.body.id}?keepItem=true`)
      .set(...bearer(alice.token))
      .expect(204);
    await ctx
      .http()
      .get(`/api/wardrobe-items/${old.body.id}`)
      .set(...bearer(alice.token))
      .expect(200);
  });

  it('usos: contador manual + días del calendario; filtro de outfits por zapatillas', async () => {
    await ctx
      .http()
      .post(`/api/sneakers/${pairA}/wear`)
      .set(...bearer(alice.token))
      .send({ delta: 1 })
      .expect(200);
    const down = await ctx
      .http()
      .post(`/api/sneakers/${pairB}/wear`)
      .set(...bearer(alice.token))
      .send({ delta: -1 })
      .expect(200);
    expect(down.body.uses.manual).toBe(0); // no baja de 0
    await ctx
      .http()
      .post(`/api/sneakers/${pairA}/wear`)
      .set(...bearer(alice.token))
      .send({ delta: 5 })
      .expect(400);

    const o = await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(alice.token))
      .send({ name: 'Con las uno', items: [{ wardrobeItemId: pairA }] })
      .expect(201);
    await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(alice.token))
      .send({ name: 'Con las dos', items: [{ wardrobeItemId: pairB }] })
      .expect(201);
    await ctx
      .http()
      .post('/api/calendar')
      .set(...bearer(alice.token))
      .send({ date: daysAgo(1), outfitId: o.body.id, worn: true })
      .expect(201);

    const a = await ctx
      .http()
      .get(`/api/sneakers/${pairA}`)
      .set(...bearer(alice.token))
      .expect(200);
    expect(a.body).toMatchObject({
      uses: { manual: 3, calendar: 1, total: 4 },
      outfitCount: 1,
    });
    const filtered = await ctx
      .http()
      .get(`/api/outfits?itemId=${pairA}`)
      .set(...bearer(alice.token))
      .expect(200);
    expect(filtered.body.data.map((x: { id: string }) => x.id)).toEqual([
      o.body.id,
    ]);
  });

  it('estadísticas', async () => {
    const s = await ctx
      .http()
      .get('/api/sneakers/stats')
      .set(...bearer(alice.token))
      .expect(200);
    expect(s.body).toMatchObject({
      total: 2,
      topBrand: { brand: 'NIKE', count: 2 },
      topColor: { name: 'blanco', count: 2 },
      spent: [{ currency: 'EUR', total: 120, count: 1 }],
      topModel: { model: 'Modelo Uno', uses: 4 },
      leastUsed: { id: pairB, uses: 0 },
      wishlist: { count: 1, value: [{ currency: 'EUR', total: 150 }] },
    });
    expect(s.body.combos.map((c: { id: string }) => c.id).sort()).toEqual(
      [pairA, pairB].sort(),
    );
  });

  it('editar: cambia el nombre, comprueba duplicados y no deja tocar la de otro', async () => {
    const u = await ctx
      .http()
      .patch(`/api/sneakers/${pairB}`)
      .set(...bearer(alice.token))
      .send({ model: 'Modelo Dos Bis', condition: 'BEAT' })
      .expect(200);
    expect(u.body).toMatchObject({
      name: 'Nike Modelo Dos Bis',
      sneaker: { condition: 'BEAT' },
    });
    await ctx
      .http()
      .patch(`/api/sneakers/${pairB}`)
      .set(...bearer(alice.token))
      .send({ model: 'Modelo Uno', colorway: 'Blanco/Negro', size: '43' })
      .expect(409);

    await ctx
      .http()
      .get(`/api/sneakers/${pairA}`)
      .set(...bearer(bob.token))
      .expect(404);
    await ctx
      .http()
      .patch(`/api/sneakers/${pairA}`)
      .set(...bearer(bob.token))
      .send({ model: 'x' })
      .expect(404);
    await ctx
      .http()
      .post(`/api/sneakers/${pairA}/wear`)
      .set(...bearer(bob.token))
      .send({ delta: 1 })
      .expect(404);
    await ctx
      .http()
      .delete(`/api/sneakers/${pairA}`)
      .set(...bearer(bob.token))
      .expect(404);
    expect(
      (
        await ctx
          .http()
          .get('/api/sneakers')
          .set(...bearer(bob.token))
          .expect(200)
      ).body.meta.total,
    ).toBe(0);
    expect(
      (
        await ctx
          .http()
          .get('/api/sneakers/stats')
          .set(...bearer(bob.token))
          .expect(200)
      ).body.total,
    ).toBe(0);

    await ctx
      .http()
      .delete(`/api/sneakers/${pairB}`)
      .set(...bearer(alice.token))
      .expect(204);
    await ctx
      .http()
      .get(`/api/wardrobe-items/${pairB}`)
      .set(...bearer(alice.token))
      .expect(404);
  });
});
