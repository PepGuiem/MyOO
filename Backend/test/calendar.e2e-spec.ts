import { bearer, createTestApp, registerUser, TestContext } from './utils';

/** Día en formato YYYY-MM-DD a `n` días de hoy (UTC). */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

describe('OUTFIT CALENDAR (e2e)', () => {
  let ctx: TestContext;
  let alice: { token: string; userId: string };
  let bob: { token: string; userId: string };
  let outfitA: string;
  let outfitB: string;
  let bobOutfit: string;

  async function makeOutfit(token: string, name: string): Promise<string> {
    const type = await ctx.prisma.garmentType.findFirstOrThrow({
      where: { code: 'T_SHIRT' },
    });
    const w = await ctx
      .http()
      .post('/api/wardrobes')
      .set(...bearer(token))
      .send({ name: `Armario ${name}` })
      .expect(201);
    const item = await ctx
      .http()
      .post('/api/wardrobe-items')
      .set(...bearer(token))
      .send({
        wardrobeId: w.body.id,
        garmentTypeId: type.id,
        name: `Prenda ${name}`,
        color: '#222222',
      })
      .expect(201);
    const o = await ctx
      .http()
      .post('/api/outfits')
      .set(...bearer(token))
      .send({ name, items: [{ wardrobeItemId: item.body.id }] })
      .expect(201);
    return o.body.id;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    alice = await registerUser(ctx, 'alice');
    bob = await registerUser(ctx, 'bob');
    outfitA = await makeOutfit(alice.token, 'Lunes');
    outfitB = await makeOutfit(alice.token, 'Martes');
    bobOutfit = await makeOutfit(bob.token, 'De Bob');
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  let entry: string;

  it('asigna un outfit a un día con nota y evento', async () => {
    const res = await ctx
      .http()
      .post('/api/calendar')
      .set(...bearer(alice.token))
      .send({
        date: day(3),
        outfitId: outfitA,
        note: '  Llevar paraguas ',
        eventName: 'Concierto',
        eventKind: 'CONCERT',
      })
      .expect(201);
    entry = res.body.id;
    expect(res.body).toMatchObject({
      date: day(3),
      note: 'Llevar paraguas',
      eventName: 'Concierto',
      eventKind: 'CONCERT',
      worn: false,
    });
    expect(res.body.outfit.id).toBe(outfitA);
    expect(res.body.outfit.items.length).toBe(1);
  });

  it('valida fechas y outfits ajenos', async () => {
    await ctx
      .http()
      .post('/api/calendar')
      .set(...bearer(alice.token))
      .send({ date: '2026-02-30', outfitId: outfitA })
      .expect(400);
    await ctx
      .http()
      .post('/api/calendar')
      .set(...bearer(alice.token))
      .send({ date: day(1), outfitId: bobOutfit })
      .expect(400);
    await ctx
      .http()
      .post('/api/calendar')
      .set(...bearer(alice.token))
      .send({ date: day(1), outfitId: outfitA, worn: true })
      .expect(201);
    await ctx
      .http()
      .post('/api/calendar')
      .set(...bearer(alice.token))
      .send({ date: day(10), outfitId: outfitA, worn: true })
      .expect(400);
  });

  it('lista un rango y avisa de repeticiones', async () => {
    const res = await ctx
      .http()
      .get(`/api/calendar?from=${day(-1)}&to=${day(5)}`)
      .set(...bearer(alice.token))
      .expect(200);
    expect(res.body).toHaveLength(2);
    const later = res.body.find((e: { id: string }) => e.id === entry);
    expect(later.repeat).toMatchObject({ gapDays: 2 });
    await ctx
      .http()
      .get(`/api/calendar?from=${day(0)}&to=${day(90)}`)
      .set(...bearer(alice.token))
      .expect(400);
  });

  it('edita, marca como usado y no deja tocar lo de otro', async () => {
    await ctx
      .http()
      .patch(`/api/calendar/${entry}`)
      .set(...bearer(alice.token))
      .send({ worn: true })
      .expect(400);
    const moved = await ctx
      .http()
      .patch(`/api/calendar/${entry}`)
      .set(...bearer(alice.token))
      .send({ date: day(0), outfitId: outfitB, note: null })
      .expect(200);
    expect(moved.body).toMatchObject({ date: day(0), note: null });
    expect(moved.body.outfit.id).toBe(outfitB);
    const worn = await ctx
      .http()
      .patch(`/api/calendar/${entry}`)
      .set(...bearer(alice.token))
      .send({ worn: true })
      .expect(200);
    expect(worn.body.worn).toBe(true);
    await ctx
      .http()
      .patch(`/api/calendar/${entry}`)
      .set(...bearer(bob.token))
      .send({ note: 'x' })
      .expect(404);
    await ctx
      .http()
      .delete(`/api/calendar/${entry}`)
      .set(...bearer(bob.token))
      .expect(404);
  });

  it('máximo 4 outfits por día', async () => {
    for (let i = 0; i < 3; i++) {
      await ctx
        .http()
        .post('/api/calendar')
        .set(...bearer(alice.token))
        .send({ date: day(20), outfitId: outfitB })
        .expect(201);
    }
    await ctx
      .http()
      .post('/api/calendar')
      .set(...bearer(alice.token))
      .send({ date: day(20), outfitId: outfitA })
      .expect(201);
    await ctx
      .http()
      .post('/api/calendar')
      .set(...bearer(alice.token))
      .send({ date: day(20), outfitId: outfitA })
      .expect(400);
  });

  it('estadísticas, próximos días y recomendaciones', async () => {
    const ins = await ctx
      .http()
      .get(`/api/calendar/insights?today=${day(0)}`)
      .set(...bearer(alice.token))
      .expect(200);
    expect(ins.body.stats.wornTotal).toBe(2);
    expect(ins.body.stats.totalOutfits).toBe(2);
    expect(ins.body.upcoming.length).toBeGreaterThanOrEqual(1);
    expect(ins.body.repeats.length).toBeGreaterThanOrEqual(1);
    const sug = await ctx
      .http()
      .get(`/api/calendar/suggestions?date=${day(40)}`)
      .set(...bearer(alice.token))
      .expect(200);
    expect(sug.body.length).toBeGreaterThanOrEqual(1);
    expect(sug.body[0].outfit.items).toBeDefined();
  });

  it('borrar el outfit borra sus días; borrar un día no toca el outfit', async () => {
    const before = await ctx.prisma.calendarEntry.count({
      where: { userId: alice.userId, outfitId: outfitB },
    });
    expect(before).toBeGreaterThan(0);
    await ctx
      .http()
      .delete(`/api/outfits/${outfitB}`)
      .set(...bearer(alice.token))
      .expect(204);
    expect(
      await ctx.prisma.calendarEntry.count({ where: { outfitId: outfitB } }),
    ).toBe(0);
    const one = await ctx.prisma.calendarEntry.findFirstOrThrow({
      where: { userId: alice.userId },
    });
    await ctx
      .http()
      .delete(`/api/calendar/${one.id}`)
      .set(...bearer(alice.token))
      .expect(204);
    await ctx
      .http()
      .get(`/api/outfits/${outfitA}`)
      .set(...bearer(alice.token))
      .expect(200);
  });
});
