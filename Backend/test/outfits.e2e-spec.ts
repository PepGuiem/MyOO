import { bearer, createTestApp, registerUser, TestContext } from './utils';

describe('Outfits (e2e)', () => {
  let ctx: TestContext;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let aliceItems: string[];
  let bobItem: string;

  async function setupWardrobe(token: string, n: number): Promise<string[]> {
    const types = await ctx.prisma.garmentType.findMany({
      where: { code: { in: ['T_SHIRT', 'PANTS', 'SNEAKERS', 'JACKET'] } },
    });
    const w = await ctx
      .http()
      .post('/api/wardrobes')
      .set(...bearer(token))
      .send({ name: 'Armario' })
      .expect(201);
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const res = await ctx
        .http()
        .post('/api/wardrobe-items')
        .set(...bearer(token))
        .send({
          wardrobeId: w.body.id,
          garmentTypeId: types[i % types.length].id,
          name: `Prenda ${i}`,
          color: '#333333',
        })
        .expect(201);
      ids.push(res.body.id);
    }
    return ids;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    alice = await registerUser(ctx, 'alice');
    bob = await registerUser(ctx, 'bob');
    aliceItems = await setupWardrobe(alice.token, 4);
    [bobItem] = await setupWardrobe(bob.token, 1);
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  let outfitId: string;

  it('crea un outfit con prendas ordenadas', async () => {
    const res = await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(alice.token))
      .send({
        name: 'Lunes',
        occasion: 'Trabajo',
        season: 'AUTUMN',
        items: [
          { wardrobeItemId: aliceItems[1] },
          { wardrobeItemId: aliceItems[0] },
        ],
      })
      .expect(201);
    outfitId = res.body.id;
    expect(
      res.body.items.map(
        (i: { wardrobeItem: { id: string } }) => i.wardrobeItem.id,
      ),
    ).toEqual([aliceItems[1], aliceItems[0]]);
    expect(res.body.items[0].wardrobeItem.garmentType.modelKey).toBeDefined();
  });

  it('la misma prenda se puede reutilizar en varios outfits', async () => {
    await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(alice.token))
      .send({ name: 'Martes', items: [{ wardrobeItemId: aliceItems[0] }] })
      .expect(201);
  });

  it('400 si una prenda aparece repetida', async () => {
    await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(alice.token))
      .send({
        name: 'Repetido',
        items: [
          { wardrobeItemId: aliceItems[0] },
          { wardrobeItemId: aliceItems[0] },
        ],
      })
      .expect(400);
  });

  it('400 si se usa una prenda de otro usuario', async () => {
    const res = await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(alice.token))
      .send({ name: 'Robado', items: [{ wardrobeItemId: bobItem }] })
      .expect(400);
    expect(String(res.body.message)).toContain(bobItem);
  });

  it('la BD impide asociar la prenda de otro usuario (FK compuesta)', async () => {
    await expect(
      ctx.prisma.outfitItem.create({
        data: { userId: alice.userId, outfitId, wardrobeItemId: bobItem },
      }),
    ).rejects.toThrow();
  });

  it('400 sin prendas', async () => {
    await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(alice.token))
      .send({ name: 'Vacío', items: [] })
      .expect(400);
  });

  it('PATCH reemplaza las prendas del outfit', async () => {
    const res = await ctx
      .http()
      .patch(`/api/outfits/${outfitId}`)
      .set(...bearer(alice.token))
      .send({
        name: 'Lunes v2',
        items: [
          { wardrobeItemId: aliceItems[2], position: 0 },
          { wardrobeItemId: aliceItems[3], position: 1 },
        ],
      })
      .expect(200);
    expect(res.body.name).toBe('Lunes v2');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].wardrobeItem.id).toBe(aliceItems[2]);
  });

  it('un PATCH inválido no deja cambios a medias (transacción)', async () => {
    await ctx
      .http()
      .patch(`/api/outfits/${outfitId}`)
      .set(...bearer(alice.token))
      .send({
        name: 'No debería guardarse',
        items: [{ wardrobeItemId: bobItem }],
      })
      .expect(400);
    const res = await ctx
      .http()
      .get(`/api/outfits/${outfitId}`)
      .set(...bearer(alice.token))
      .expect(200);
    expect(res.body.name).toBe('Lunes v2');
    expect(res.body.items).toHaveLength(2);
  });

  it('otro usuario no puede ver, editar ni borrar el outfit', async () => {
    await ctx
      .http()
      .get(`/api/outfits/${outfitId}`)
      .set(...bearer(bob.token))
      .expect(404);
    await ctx
      .http()
      .patch(`/api/outfits/${outfitId}`)
      .set(...bearer(bob.token))
      .send({ name: 'x' })
      .expect(404);
    await ctx
      .http()
      .delete(`/api/outfits/${outfitId}`)
      .set(...bearer(bob.token))
      .expect(404);
  });

  it('al borrar una prenda desaparece de los outfits', async () => {
    await ctx
      .http()
      .delete(`/api/wardrobe-items/${aliceItems[2]}`)
      .set(...bearer(alice.token))
      .expect(204);
    const res = await ctx
      .http()
      .get(`/api/outfits/${outfitId}`)
      .set(...bearer(alice.token))
      .expect(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('lista y borra outfits', async () => {
    const list = await ctx
      .http()
      .get('/api/outfits')
      .set(...bearer(alice.token))
      .expect(200);
    expect(list.body.meta.total).toBe(2);
    await ctx
      .http()
      .delete(`/api/outfits/${outfitId}`)
      .set(...bearer(alice.token))
      .expect(204);
    const after = await ctx
      .http()
      .get('/api/outfits')
      .set(...bearer(alice.token))
      .expect(200);
    expect(after.body.meta.total).toBe(1);
  });

  describe('estilos, favoritos, búsqueda y duplicar', () => {
    let fav: string;

    it('guarda el estilo y el favorito', async () => {
      const res = await ctx
        .http()
        .post('/api/outfits')
        .set(...bearer(alice.token))
        .send({
          name: 'Noche trap',
          style: 'TRAP',
          isFavorite: true,
          items: [{ wardrobeItemId: aliceItems[0] }],
        })
        .expect(201);
      expect(res.body).toMatchObject({ style: 'TRAP', isFavorite: true });
      fav = res.body.id;
      await ctx
        .http()
        .post('/api/outfits')
        .set(...bearer(alice.token))
        .send({
          name: 'Skate park',
          style: 'SKATE',
          items: [{ wardrobeItemId: aliceItems[1] }],
        })
        .expect(201);
      await ctx
        .http()
        .post('/api/outfits')
        .set(...bearer(alice.token))
        .send({
          name: 'Raro',
          style: 'NO_EXISTE',
          items: [{ wardrobeItemId: aliceItems[1] }],
        })
        .expect(400);
    });

    it('filtra por estilo, favoritos y nombre; resume las cifras', async () => {
      const trap = await ctx
        .http()
        .get('/api/outfits?style=TRAP')
        .set(...bearer(alice.token))
        .expect(200);
      expect(trap.body.data.map((o: { name: string }) => o.name)).toEqual([
        'Noche trap',
      ]);
      const favs = await ctx
        .http()
        .get('/api/outfits?favorite=true')
        .set(...bearer(alice.token))
        .expect(200);
      expect(favs.body.data.map((o: { id: string }) => o.id)).toEqual([fav]);
      const search = await ctx
        .http()
        .get('/api/outfits?search=skate')
        .set(...bearer(alice.token))
        .expect(200);
      expect(search.body.meta.total).toBe(1);
      const byName = await ctx
        .http()
        .get('/api/outfits?sort=name')
        .set(...bearer(alice.token))
        .expect(200);
      const names = byName.body.data.map((o: { name: string }) => o.name);
      expect(names).toEqual(
        [...names].sort((a: string, b: string) => a.localeCompare(b)),
      );
      const sum = await ctx
        .http()
        .get('/api/outfits/summary')
        .set(...bearer(alice.token))
        .expect(200);
      expect(sum.body).toMatchObject({
        favorites: 1,
        byStyle: { TRAP: 1, SKATE: 1, TECHWEAR: 0 },
      });
      expect(sum.body.total).toBe(sum.body.unstyled + 2);
    });

    it('quitar favorito y estilo con PATCH', async () => {
      const res = await ctx
        .http()
        .patch(`/api/outfits/${fav}`)
        .set(...bearer(alice.token))
        .send({ isFavorite: false, style: null })
        .expect(200);
      expect(res.body).toMatchObject({ isFavorite: false, style: null });
      await ctx
        .http()
        .patch(`/api/outfits/${fav}`)
        .set(...bearer(alice.token))
        .send({ isFavorite: true, style: 'TRAP' })
        .expect(200);
    });

    it('duplica con las mismas prendas; otra persona no puede', async () => {
      const copy = await ctx
        .http()
        .post(`/api/outfits/${fav}/duplicate`)
        .set(...bearer(alice.token))
        .expect(201);
      expect(copy.body).toMatchObject({
        name: 'Noche trap (copia)',
        style: 'TRAP',
        isFavorite: false,
        isShared: false,
      });
      expect(
        copy.body.items.map(
          (i: { wardrobeItem: { id: string } }) => i.wardrobeItem.id,
        ),
      ).toEqual([aliceItems[0]]);
      expect(copy.body.id).not.toBe(fav);
      await ctx
        .http()
        .post(`/api/outfits/${fav}/duplicate`)
        .set(...bearer(bob.token))
        .expect(404);
    });
  });
  describe('OUTFIT RATING', () => {
    let rated: string;

    it('se puntúa al crear: nota 0-100, nivel y cuatro categorías de 25', async () => {
      const res = await ctx
        .http()
        .post('/api/outfits')
        .set(...bearer(alice.token))
        .send({
          name: 'Con nota',
          style: 'STREETWEAR',
          items: [
            { wardrobeItemId: aliceItems[0] },
            { wardrobeItemId: aliceItems[1] },
          ],
        })
        .expect(201);
      rated = res.body.id;
      expect(res.body.ratingScore).toBeGreaterThanOrEqual(0);
      expect(res.body.ratingScore).toBeLessThanOrEqual(100);
      expect(res.body.ratingTier).toBeDefined();
      const cur = await ctx
        .http()
        .get(`/api/outfits/${rated}/rating`)
        .set(...bearer(alice.token))
        .expect(200);
      const r = cur.body.rating;
      expect(r.total).toBe(res.body.ratingScore);
      expect(r.colors + r.style + r.balance + r.details).toBe(r.total);
      for (const c of ['colors', 'style', 'balance', 'details'])
        expect(r[c]).toBeLessThanOrEqual(25);
      expect(cur.body.stale).toBe(false);
      expect(cur.body.result.engine).toBe('rules@1');
      expect(Array.isArray(cur.body.result.comments)).toBe(true);
      expect(Array.isArray(cur.body.result.tips)).toBe(true);
    });

    it('recalcular sin cambios no repite la fila; cambiar prendas añade historial', async () => {
      const again = await ctx
        .http()
        .post(`/api/outfits/${rated}/rating`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(again.body.changed).toBe(false);
      let hist = await ctx
        .http()
        .get(`/api/outfits/${rated}/ratings`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(hist.body).toHaveLength(1);
      // Marcar favorito no cuenta para la nota
      await ctx
        .http()
        .patch(`/api/outfits/${rated}`)
        .set(...bearer(alice.token))
        .send({ isFavorite: true })
        .expect(200);
      await ctx
        .http()
        .patch(`/api/outfits/${rated}`)
        .set(...bearer(alice.token))
        .send({
          items: [
            { wardrobeItemId: aliceItems[0] },
            { wardrobeItemId: aliceItems[1] },
            { wardrobeItemId: aliceItems[3] },
          ],
        })
        .expect(200);
      hist = await ctx
        .http()
        .get(`/api/outfits/${rated}/ratings`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(hist.body).toHaveLength(2);
      expect(hist.body[0].trigger).toBe('UPDATE');
    });

    it('cambiar el color de una prenda deja la nota desactualizada (stale)', async () => {
      await ctx
        .http()
        .patch(`/api/wardrobe-items/${aliceItems[0]}`)
        .set(...bearer(alice.token))
        .send({ color: '#E2762B' })
        .expect(200);
      const cur = await ctx
        .http()
        .get(`/api/outfits/${rated}/rating`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(cur.body.stale).toBe(true);
      const re = await ctx
        .http()
        .post(`/api/outfits/${rated}/rating`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(re.body.changed).toBe(true);
    });

    it('preview: puntúa sin guardar y rechaza prendas ajenas', async () => {
      const before = await ctx.prisma.outfitRating.count();
      const res = await ctx
        .http()
        .post('/api/outfits/ratings/preview')
        .set(...bearer(alice.token))
        .send({ items: [{ wardrobeItemId: aliceItems[1] }], style: 'MINIMAL' })
        .expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(0);
      expect(await ctx.prisma.outfitRating.count()).toBe(before);
      await ctx
        .http()
        .post('/api/outfits/ratings/preview')
        .set(...bearer(alice.token))
        .send({ items: [{ wardrobeItemId: bobItem }] })
        .expect(400);
    });

    it('compara outfits propios; los ajenos dan 404', async () => {
      const other = await ctx
        .http()
        .post('/api/outfits')
        .set(...bearer(alice.token))
        .send({ name: 'Otro', items: [{ wardrobeItemId: aliceItems[1] }] })
        .expect(201);
      const cmp = await ctx
        .http()
        .get(`/api/outfits/ratings/compare?ids=${rated},${other.body.id}`)
        .set(...bearer(alice.token))
        .expect(200);
      expect(cmp.body.outfits).toHaveLength(2);
      expect(cmp.body.winners.total.length).toBeGreaterThanOrEqual(1);
      await ctx
        .http()
        .get(`/api/outfits/ratings/compare?ids=${rated}`)
        .set(...bearer(alice.token))
        .expect(400);
      await ctx
        .http()
        .get(`/api/outfits/ratings/compare?ids=${rated},${other.body.id}`)
        .set(...bearer(bob.token))
        .expect(404);
      await ctx
        .http()
        .get(`/api/outfits/${rated}/rating`)
        .set(...bearer(bob.token))
        .expect(404);
    });

    it('ordena por nota y puntúa los outfits que no tenían', async () => {
      await ctx.prisma.outfit.updateMany({
        where: { userId: alice.userId },
        data: { ratingScore: null, ratingTier: null },
      });
      const list = await ctx
        .http()
        .get('/api/outfits?sort=score')
        .set(...bearer(alice.token))
        .expect(200);
      const scores = list.body.data.map(
        (o: { ratingScore: number | null }) => o.ratingScore,
      );
      expect(scores.every((s: number | null) => typeof s === 'number')).toBe(
        true,
      );
      const again = await ctx
        .http()
        .get('/api/outfits?sort=score')
        .set(...bearer(alice.token))
        .expect(200);
      const sorted = again.body.data.map(
        (o: { ratingScore: number }) => o.ratingScore,
      );
      expect(sorted).toEqual([...sorted].sort((a: number, b: number) => b - a));
    });
  });
});
