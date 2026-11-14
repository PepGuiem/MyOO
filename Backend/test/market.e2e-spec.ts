import { bearer, createTestApp, registerUser, TestContext } from './utils';

type U = { token: string; userId: string };

/** PNG real de 1×1 píxel. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

describe('STREET MARKET (e2e)', () => {
  let ctx: TestContext;
  let ana: U;
  let leo: U;
  let eva: U;
  let listing: string;
  let photo: string;

  const upload = async (u: U) =>
    (
      await ctx
        .http()
        .post('/api/assets')
        .set(...bearer(u.token))
        .attach('file', PNG_1X1, 'f.png')
        .expect(201)
    ).body.id as string;

  beforeAll(async () => {
    // El market está apagado por defecto; en este test se enciende.
    process.env.MARKET_ENABLED = 'true';
    ctx = await createTestApp();
    ana = await registerUser(ctx, 'ana');
    leo = await registerUser(ctx, 'leo');
    eva = await registerUser(ctx, 'eva');
  });

  afterAll(async () => {
    await ctx.app.close();
    delete process.env.MARKET_ENABLED;
  });

  const base = {
    kind: 'SELL',
    title: 'Hoodie negra oversize',
    category: 'HOODIES',
    brand: 'Marca Local',
    size: 'L',
    condition: 'LIKE_NEW',
    price: 45,
    city: 'Barcelona',
  };

  it('publica un anuncio con fotos propias; vender exige precio', async () => {
    photo = await upload(ana);
    const ajena = await upload(leo);
    await ctx
      .http()
      .post('/api/market')
      .set(...bearer(ana.token))
      .send({ ...base, price: undefined })
      .expect(400);
    await ctx
      .http()
      .post('/api/market')
      .set(...bearer(ana.token))
      .send({ ...base, photoAssetIds: [ajena] })
      .expect(400);
    await ctx
      .http()
      .post('/api/market')
      .set(...bearer(ana.token))
      .send({ ...base, photoAssetIds: [photo, photo] })
      .expect(400);
    const res = await ctx
      .http()
      .post('/api/market')
      .set(...bearer(ana.token))
      .send({ ...base, photoAssetIds: [photo] })
      .expect(201);
    listing = res.body.id;
    expect(res.body).toMatchObject({
      kind: 'SELL',
      price: '45',
      currency: 'EUR',
      status: 'ACTIVE',
      isMine: true,
      photos: [photo],
      canContact: false,
    });

    // Intercambio sin precio
    const swap = await ctx
      .http()
      .post('/api/market')
      .set(...bearer(ana.token))
      .send({
        ...base,
        kind: 'SWAP',
        title: 'Cambio gorra',
        category: 'ACCESSORIES',
        price: null,
        swapFor: 'Una gorra verde',
      })
      .expect(201);
    expect(swap.body).toMatchObject({
      kind: 'SWAP',
      price: null,
      swapFor: 'Una gorra verde',
    });
  });

  it('«Vender» desde el armario: copia la prenda para el 3D y su foto; no vale una prenda ajena', async () => {
    const type = await ctx.prisma.garmentType.findUniqueOrThrow({
      where: { code: 'SNEAKERS' },
    });
    const wardrobe = await ctx.prisma.wardrobe.findFirstOrThrow({
      where: { userId: ana.userId },
    });
    const item = await ctx
      .http()
      .post('/api/wardrobe-items')
      .set(...bearer(ana.token))
      .send({
        wardrobeId: wardrobe.id,
        garmentTypeId: type.id,
        name: 'Zapas blancas',
        color: '#F5F5F2',
        size: '43',
      })
      .expect(201);
    const res = await ctx
      .http()
      .post('/api/market')
      .set(...bearer(ana.token))
      .send({
        ...base,
        title: 'Zapas blancas',
        category: 'SNEAKERS',
        size: '43',
        itemId: item.body.id,
      })
      .expect(201);
    expect(res.body.garment).toMatchObject({
      name: 'Zapas blancas',
      color: '#F5F5F2',
      garmentType: { code: 'SNEAKERS' },
    });
    expect(res.body.itemId).toBe(item.body.id);
    await ctx
      .http()
      .post('/api/market')
      .set(...bearer(leo.token))
      .send({ ...base, itemId: item.body.id })
      .expect(404);
    // Borrar la prenda no borra el anuncio
    await ctx
      .http()
      .delete(`/api/wardrobe-items/${item.body.id}`)
      .set(...bearer(ana.token))
      .expect(204);
    await ctx
      .http()
      .get(`/api/market/${res.body.id}`)
      .set(...bearer(ana.token))
      .expect(200);
  });

  it('el market filtra, busca y ordena; las fotos solo las ve quien ve el anuncio', async () => {
    const all = await ctx
      .http()
      .get('/api/market')
      .set(...bearer(leo.token))
      .expect(200);
    expect(all.body.meta.total).toBe(3);
    const one = await ctx
      .http()
      .get('/api/market?category=HOODIES&city=barcel&search=OVERSIZE')
      .set(...bearer(leo.token))
      .expect(200);
    expect(one.body.data.map((x: { id: string }) => x.id)).toEqual([listing]);
    expect(one.body.data[0]).toMatchObject({
      isMine: false,
      canContact: true,
      itemId: null,
    });
    const cheap = await ctx
      .http()
      .get('/api/market?maxPrice=10')
      .set(...bearer(leo.token))
      .expect(200);
    expect(cheap.body.meta.total).toBe(0);
    const swaps = await ctx
      .http()
      .get('/api/market?kind=SWAP')
      .set(...bearer(leo.token))
      .expect(200);
    expect(swaps.body.meta.total).toBe(1);

    const img = await ctx
      .http()
      .get(`/api/market/${listing}/photos/${photo}`)
      .set(...bearer(leo.token))
      .expect(200);
    expect(img.headers['content-type']).toContain('image/png');
    // La imagen sigue siendo privada por la ruta normal
    await ctx
      .http()
      .get(`/api/assets/${photo}/content`)
      .set(...bearer(leo.token))
      .expect(404);
    // Y no se puede borrar mientras la usa un anuncio
    await ctx
      .http()
      .delete(`/api/assets/${photo}`)
      .set(...bearer(ana.token))
      .expect(409);
  });

  it('favoritos', async () => {
    await ctx
      .http()
      .post(`/api/market/${listing}/favorite`)
      .set(...bearer(ana.token))
      .expect(400);
    const f = await ctx
      .http()
      .post(`/api/market/${listing}/favorite`)
      .set(...bearer(leo.token))
      .expect(200);
    expect(f.body).toEqual({ isFavorite: true, favorites: 1 });
    await ctx
      .http()
      .post(`/api/market/${listing}/favorite`)
      .set(...bearer(leo.token))
      .expect(200);
    const favs = await ctx
      .http()
      .get('/api/market?scope=favorites')
      .set(...bearer(leo.token))
      .expect(200);
    expect(favs.body.data.map((x: { id: string }) => x.id)).toEqual([listing]);
    expect(favs.body.data[0]).toMatchObject({ isFavorite: true, favorites: 1 });
    const off = await ctx
      .http()
      .delete(`/api/market/${listing}/favorite`)
      .set(...bearer(leo.token))
      .expect(200);
    expect(off.body).toEqual({ isFavorite: false, favorites: 0 });
  });

  it('contactar abre el chat con un mensaje aunque el vendedor solo acepte a quien sigue; uno hasta que conteste', async () => {
    const c = await ctx
      .http()
      .post(`/api/market/${listing}/contact`)
      .set(...bearer(leo.token))
      .send({ message: '¿Me la guardas?' })
      .expect(201);
    const msgs = await ctx.prisma.message.findMany({
      where: { conversationId: c.body.conversationId },
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].body).toContain(`/market/${listing}`);
    expect(msgs[0].body).toContain('¿Me la guardas?');
    await ctx
      .http()
      .post(`/api/market/${listing}/contact`)
      .set(...bearer(leo.token))
      .send({})
      .expect(409);
    // Cuando contesta, se puede seguir hablando
    await ctx
      .http()
      .post(`/api/conversations/${c.body.conversationId}/messages`)
      .set(...bearer(ana.token))
      .send({ body: 'Sí' })
      .expect(201);
    await ctx
      .http()
      .post(`/api/market/${listing}/contact`)
      .set(...bearer(leo.token))
      .send({})
      .expect(201);
    await ctx
      .http()
      .post(`/api/market/${listing}/contact`)
      .set(...bearer(ana.token))
      .send({})
      .expect(400);

    // Con «nadie» no se puede
    await ctx.prisma.user.update({
      where: { id: ana.userId },
      data: { messagePolicy: 'NOBODY' },
    });
    await ctx
      .http()
      .post(`/api/market/${listing}/contact`)
      .set(...bearer(eva.token))
      .send({})
      .expect(403);
    await ctx.prisma.user.update({
      where: { id: ana.userId },
      data: { messagePolicy: 'FOLLOWING' },
    });
  });

  it('estado, edición, bloqueos y borrado', async () => {
    await ctx
      .http()
      .patch(`/api/market/${listing}`)
      .set(...bearer(leo.token))
      .send({ status: 'SOLD' })
      .expect(404);
    const sold = await ctx
      .http()
      .patch(`/api/market/${listing}`)
      .set(...bearer(ana.token))
      .send({ status: 'SOLD', price: 40 })
      .expect(200);
    expect(sold.body).toMatchObject({
      status: 'SOLD',
      price: '40',
      canContact: false,
    });
    const all = await ctx
      .http()
      .get('/api/market')
      .set(...bearer(leo.token))
      .expect(200);
    expect(all.body.data.some((x: { id: string }) => x.id === listing)).toBe(
      false,
    );
    await ctx
      .http()
      .post(`/api/market/${listing}/contact`)
      .set(...bearer(eva.token))
      .send({})
      .expect(409);
    await ctx
      .http()
      .patch(`/api/market/${listing}`)
      .set(...bearer(ana.token))
      .send({ kind: 'SELL', price: null })
      .expect(400);

    // Bloqueo: dejan de verse sus anuncios
    await ctx
      .http()
      .post(`/api/people/${ana.userId}/block`)
      .set(...bearer(eva.token))
      .expect(204);
    const blocked = await ctx
      .http()
      .get('/api/market')
      .set(...bearer(eva.token))
      .expect(200);
    expect(blocked.body.meta.total).toBe(0);
    await ctx
      .http()
      .get(`/api/market/${listing}`)
      .set(...bearer(eva.token))
      .expect(404);
    await ctx
      .http()
      .get(`/api/market/${listing}/photos/${photo}`)
      .set(...bearer(eva.token))
      .expect(404);

    // Borrar el anuncio borra también la foto que ya no usa nadie
    await ctx
      .http()
      .delete(`/api/market/${listing}`)
      .set(...bearer(ana.token))
      .expect(204);
    expect(await ctx.prisma.asset.count({ where: { id: photo } })).toBe(0);
  });
});
