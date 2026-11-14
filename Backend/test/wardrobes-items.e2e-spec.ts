import { bearer, createTestApp, registerUser, TestContext } from './utils';

describe('Armarios y prendas (e2e)', () => {
  let ctx: TestContext;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let typeIds: Record<string, string>;

  beforeAll(async () => {
    ctx = await createTestApp();
    alice = await registerUser(ctx, 'alice');
    bob = await registerUser(ctx, 'bob');
    const types = await ctx.prisma.garmentType.findMany();
    typeIds = Object.fromEntries(types.map((t) => [t.code, t.id]));
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const createWardrobe = (token: string, name: string) =>
    ctx
      .http()
      .post('/api/wardrobes')
      .set(...bearer(token))
      .send({ name });

  describe('armarios', () => {
    let wardrobeId: string;

    it('crea y lista con paginación', async () => {
      const created = await createWardrobe(alice.token, 'Principal').expect(
        201,
      );
      wardrobeId = created.body.id;
      expect(created.body).toMatchObject({ name: 'Principal', itemCount: 0 });
      expect(created.body.userId).toBeUndefined();

      const list = await ctx
        .http()
        .get('/api/wardrobes?page=1&pageSize=10')
        .set(...bearer(alice.token))
        .expect(200);
      expect(list.body.meta).toEqual({
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      });
      expect(list.body.data[0].id).toBe(wardrobeId);
    });

    it('valida la paginación', async () => {
      await ctx
        .http()
        .get('/api/wardrobes?pageSize=1000')
        .set(...bearer(alice.token))
        .expect(400);
    });

    it('409 si el nombre ya existe para el mismo usuario', async () => {
      await createWardrobe(alice.token, 'Principal').expect(409);
    });

    it('otro usuario puede usar el mismo nombre', async () => {
      await createWardrobe(bob.token, 'Principal').expect(201);
    });

    it('otro usuario NO puede ver, editar ni borrar el armario (404)', async () => {
      await ctx
        .http()
        .get(`/api/wardrobes/${wardrobeId}`)
        .set(...bearer(bob.token))
        .expect(404);
      await ctx
        .http()
        .patch(`/api/wardrobes/${wardrobeId}`)
        .set(...bearer(bob.token))
        .send({ name: 'Hackeado' })
        .expect(404);
      await ctx
        .http()
        .delete(`/api/wardrobes/${wardrobeId}`)
        .set(...bearer(bob.token))
        .expect(404);
    });

    it('400 con un id que no es UUID y 404 si no existe', async () => {
      await ctx
        .http()
        .get('/api/wardrobes/abc')
        .set(...bearer(alice.token))
        .expect(400);
      await ctx
        .http()
        .get('/api/wardrobes/00000000-0000-4000-8000-999999999999')
        .set(...bearer(alice.token))
        .expect(404);
    });

    it('actualiza el armario', async () => {
      const res = await ctx
        .http()
        .patch(`/api/wardrobes/${wardrobeId}`)
        .set(...bearer(alice.token))
        .send({ description: 'Ropa de diario' })
        .expect(200);
      expect(res.body.description).toBe('Ropa de diario');
    });
  });

  describe('prendas', () => {
    let wardrobeId: string;
    let itemId: string;

    beforeAll(async () => {
      const res = await createWardrobe(alice.token, 'Prendas').expect(201);
      wardrobeId = res.body.id;
    });

    const validItem = () => ({
      wardrobeId,
      garmentTypeId: typeIds.T_SHIRT,
      name: 'Camiseta blanca',
      color: '#ffffff',
      size: 'M',
      season: 'SUMMER',
      attributes: { sleeve: 'short', material: 'Algodón' },
    });

    it('crea una prenda con atributos válidos', async () => {
      const res = await ctx
        .http()
        .post('/api/wardrobe-items')
        .set(...bearer(alice.token))
        .send(validItem())
        .expect(201);
      itemId = res.body.id;
      expect(res.body).toMatchObject({
        name: 'Camiseta blanca',
        color: '#FFFFFF',
        attributes: { sleeve: 'short', material: 'Algodón' },
        garmentType: { code: 'T_SHIRT', modelKey: 'tshirt' },
        wardrobe: { id: wardrobeId },
      });
    });

    it.each([
      ['atributo desconocido', { attributes: { foo: 'bar' } }],
      ['valor de enum inválido', { attributes: { sleeve: 'media' } }],
      ['color inválido', { color: 'rojo' }],
      ['temporada inválida', { season: 'MONZON' }],
      ['imageUrl inválida', { imageUrl: 'javascript:alert(1)' }],
      ['nombre vacío', { name: '   ' }],
      [
        'tipo inexistente',
        { garmentTypeId: '00000000-0000-4000-8000-999999999999' },
      ],
      ['modelUrl que no es GLB', { modelUrl: 'https://cdn.test/modelo.obj' }],
      ['modelUrl con esquema raro', { modelUrl: 'javascript:alert(1).glb' }],
    ])('400: %s', async (_label, override) => {
      await ctx
        .http()
        .post('/api/wardrobe-items')
        .set(...bearer(alice.token))
        .send({ ...validItem(), ...override })
        .expect(400);
    });

    it('400 si el armario es de otro usuario', async () => {
      const bobWardrobe = await createWardrobe(bob.token, 'De Bob').expect(201);
      await ctx
        .http()
        .post('/api/wardrobe-items')
        .set(...bearer(alice.token))
        .send({ ...validItem(), wardrobeId: bobWardrobe.body.id })
        .expect(400);
    });

    it('la base de datos también impide mezclar propietarios (FK compuesta)', async () => {
      const bobWardrobe = await ctx.prisma.wardrobe.findFirstOrThrow({
        where: { userId: bob.userId },
      });
      await expect(
        ctx.prisma.wardrobeItem.create({
          data: {
            userId: alice.userId,
            wardrobeId: bobWardrobe.id,
            garmentTypeId: typeIds.T_SHIRT,
            name: 'Intrusa',
            color: '#000000',
          },
        }),
      ).rejects.toThrow();
    });

    it('acepta un modelo 3D GLB por URL o por ruta local', async () => {
      for (const modelUrl of [
        'https://cdn.test/prendas/camiseta.glb',
        '/models/camiseta.glb',
      ]) {
        const res = await ctx
          .http()
          .post('/api/wardrobe-items')
          .set(...bearer(alice.token))
          .send({
            ...validItem(),
            name: `Con modelo ${modelUrl.length}`,
            modelUrl,
          })
          .expect(201);
        expect(res.body.modelUrl).toBe(modelUrl);
        await ctx
          .http()
          .delete(`/api/wardrobe-items/${res.body.id}`)
          .set(...bearer(alice.token))
          .expect(204);
      }
    });

    it('lista con filtros', async () => {
      await ctx
        .http()
        .post('/api/wardrobe-items')
        .set(...bearer(alice.token))
        .send({
          ...validItem(),
          name: 'Vaquero',
          garmentTypeId: typeIds.PANTS,
          attributes: { fit: 'slim', inseamCm: 80 },
        })
        .expect(201);

      const bottoms = await ctx
        .http()
        .get('/api/wardrobe-items?category=BOTTOM')
        .set(...bearer(alice.token))
        .expect(200);
      expect(bottoms.body.data.map((i: { name: string }) => i.name)).toEqual([
        'Vaquero',
      ]);

      const search = await ctx
        .http()
        .get('/api/wardrobe-items?search=camiseta')
        .set(...bearer(alice.token))
        .expect(200);
      expect(search.body.meta.total).toBe(1);

      // Bob no ve las prendas de Alice.
      const bobList = await ctx
        .http()
        .get('/api/wardrobe-items')
        .set(...bearer(bob.token))
        .expect(200);
      expect(bobList.body.meta.total).toBe(0);
    });

    it('al cambiar de tipo, revalida los atributos con el esquema nuevo', async () => {
      // Los atributos de camiseta (sleeve) no valen para pantalón.
      await ctx
        .http()
        .patch(`/api/wardrobe-items/${itemId}`)
        .set(...bearer(alice.token))
        .send({ garmentTypeId: typeIds.PANTS })
        .expect(400);

      const ok = await ctx
        .http()
        .patch(`/api/wardrobe-items/${itemId}`)
        .set(...bearer(alice.token))
        .send({ garmentTypeId: typeIds.PANTS, attributes: { fit: 'regular' } })
        .expect(200);
      expect(ok.body.garmentType.code).toBe('PANTS');
      expect(ok.body.attributes).toEqual({ fit: 'regular' });
    });

    it('otro usuario no puede ver, editar ni borrar la prenda', async () => {
      await ctx
        .http()
        .get(`/api/wardrobe-items/${itemId}`)
        .set(...bearer(bob.token))
        .expect(404);
      await ctx
        .http()
        .patch(`/api/wardrobe-items/${itemId}`)
        .set(...bearer(bob.token))
        .send({ name: 'x' })
        .expect(404);
      await ctx
        .http()
        .delete(`/api/wardrobe-items/${itemId}`)
        .set(...bearer(bob.token))
        .expect(404);
    });

    it('borra la prenda', async () => {
      await ctx
        .http()
        .delete(`/api/wardrobe-items/${itemId}`)
        .set(...bearer(alice.token))
        .expect(204);
      await ctx
        .http()
        .get(`/api/wardrobe-items/${itemId}`)
        .set(...bearer(alice.token))
        .expect(404);
    });

    it('borrar un armario borra sus prendas', async () => {
      await ctx
        .http()
        .delete(`/api/wardrobes/${wardrobeId}`)
        .set(...bearer(alice.token))
        .expect(204);
      const count = await ctx.prisma.wardrobeItem.count({
        where: { wardrobeId },
      });
      expect(count).toBe(0);
    });
  });

  describe('favoritas, filtros nuevos y resumen', () => {
    let wardrobeId: string;
    const ids: Record<string, string> = {};

    const create = (
      name: string,
      color: string,
      extra: Record<string, unknown> = {},
    ) =>
      ctx
        .http()
        .post('/api/wardrobe-items')
        .set(...bearer(alice.token))
        .send({
          wardrobeId,
          garmentTypeId: typeIds.T_SHIRT,
          name,
          color,
          season: 'ALL_SEASON',
          attributes: { sleeve: 'short' },
          ...extra,
        })
        .expect(201);

    beforeAll(async () => {
      const w = await createWardrobe(alice.token, 'Colección').expect(201);
      wardrobeId = w.body.id;
      ids.negra = (
        await create('Negra', '#0a0a0a', {
          attributes: { sleeve: 'short', brand: 'Acme' },
        })
      ).body.id;
      ids.blanca = (
        await create('Blanca', '#fafaf7', {
          attributes: { sleeve: 'short', brand: 'acme ' },
        })
      ).body.id;
      ids.azul = (
        await create('Azul', '#2f5da8', { season: 'SUMMER' })
      ).body.id;
    });

    it('las prendas nuevas no son favoritas', async () => {
      const res = await ctx
        .http()
        .get(`/api/wardrobe-items/${ids.negra}`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(res.body.isFavorite).toBe(false);
    });

    it('marca y desmarca favoritas (idempotente) y solo las propias', async () => {
      const put = await ctx
        .http()
        .put(`/api/wardrobe-items/${ids.azul}/favorite`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(put.body).toEqual({ id: ids.azul, isFavorite: true });
      await ctx
        .http()
        .put(`/api/wardrobe-items/${ids.azul}/favorite`)
        .set(...bearer(alice.token))
        .expect(200);
      await ctx
        .http()
        .put(`/api/wardrobe-items/${ids.negra}/favorite`)
        .set(...bearer(alice.token))
        .expect(200);
      await ctx
        .http()
        .delete(`/api/wardrobe-items/${ids.negra}/favorite`)
        .set(...bearer(alice.token))
        .expect(200);

      // Bob no puede tocar las de Alice.
      await ctx
        .http()
        .put(`/api/wardrobe-items/${ids.blanca}/favorite`)
        .set(...bearer(bob.token))
        .expect(404);
      await ctx
        .http()
        .put('/api/wardrobe-items/abc/favorite')
        .set(...bearer(alice.token))
        .expect(400);

      const fav = await ctx
        .http()
        .get(`/api/wardrobe-items?wardrobeId=${wardrobeId}&favorite=true`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(fav.body.data.map((i: { name: string }) => i.name)).toEqual([
        'Azul',
      ]);
    });

    it('filtra por marca (sin distinguir mayúsculas) y por grupo de color', async () => {
      const brand = await ctx
        .http()
        .get(
          `/api/wardrobe-items?wardrobeId=${wardrobeId}&brand=ACME&sort=name`,
        )
        .set(...bearer(alice.token))
        .expect(200);
      expect(brand.body.data.map((i: { name: string }) => i.name)).toEqual([
        'Blanca',
        'Negra',
      ]);
      expect(brand.body.meta.total).toBe(2);

      const blue = await ctx
        .http()
        .get(`/api/wardrobe-items?wardrobeId=${wardrobeId}&color=blue`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(blue.body.data.map((i: { name: string }) => i.name)).toEqual([
        'Azul',
      ]);

      const none = await ctx
        .http()
        .get(
          `/api/wardrobe-items?wardrobeId=${wardrobeId}&color=blue&brand=acme`,
        )
        .set(...bearer(alice.token))
        .expect(200);
      expect(none.body.meta.total).toBe(0);

      await ctx
        .http()
        .get('/api/wardrobe-items?color=fucsia-neon')
        .set(...bearer(alice.token))
        .expect(400);
      await ctx
        .http()
        .get('/api/wardrobe-items?sort=random')
        .set(...bearer(alice.token))
        .expect(400);
    });

    it('ordena por favoritas primero', async () => {
      const res = await ctx
        .http()
        .get(`/api/wardrobe-items?wardrobeId=${wardrobeId}&sort=favorites`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(res.body.data[0].name).toBe('Azul');
    });

    it('resumen del armario con datos reales', async () => {
      const res = await ctx
        .http()
        .get(`/api/wardrobe-items/facets?wardrobeId=${wardrobeId}`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(res.body).toMatchObject({
        total: 3,
        favorites: 1,
        categories: 1,
        brands: [{ count: 2 }],
        lastAdded: { id: ids.azul, name: 'Azul' },
      });
      expect(res.body.colors.map((c: { value: string }) => c.value)).toEqual([
        'black',
        'white',
        'blue',
      ]);

      // Bob ve su propio resumen, vacío.
      const bobFacets = await ctx
        .http()
        .get('/api/wardrobe-items/facets')
        .set(...bearer(bob.token))
        .expect(200);
      expect(bobFacets.body.total).toBe(0);
      await ctx
        .http()
        .get('/api/wardrobe-items/facets?wardrobeId=abc')
        .set(...bearer(alice.token))
        .expect(400);
    });
  });
});
