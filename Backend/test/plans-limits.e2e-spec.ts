import { bearer, createTestApp, registerUser, TestContext } from './utils';

describe('Planes, límites y suscripciones (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const createWardrobe = (token: string, name: string) =>
    ctx.http().post('/api/wardrobes').set(...bearer(token)).send({ name });

  it('GET /api/plans es público', async () => {
    const res = await ctx.http().get('/api/plans').expect(200);
    const codes = res.body.map((p: { code: string }) => p.code);
    expect(codes).toEqual(expect.arrayContaining(['FREE', 'BASIC', 'PLUS', 'PREMIUM']));
  });

  it('sin suscripción se aplica el plan por defecto (FREE)', async () => {
    const { token } = await registerUser(ctx, 'free');
    const res = await ctx.http().get('/api/plans/me').set(...bearer(token)).expect(200);
    expect(res.body.plan.code).toBe('FREE');
    expect(res.body.subscriptionId).toBeNull();
    const wardrobes = res.body.usage.find(
      (u: { resource: string }) => u.resource === 'WARDROBES',
    );
    expect(wardrobes).toEqual({ resource: 'WARDROBES', used: 0, isUnlimited: false, max: 2 });
  });

  it('flujo completo: límite, subir de plan, bajar de plan sin perder datos', async () => {
    const { token, userId } = await registerUser(ctx, 'flow');

    await createWardrobe(token, 'A').expect(201);
    await createWardrobe(token, 'B').expect(201);

    const blocked = await createWardrobe(token, 'C').expect(403);
    expect(blocked.body).toMatchObject({
      error: 'PlanLimitReached',
      resource: 'WARDROBES',
      limit: 2,
      planCode: 'FREE',
    });

    // Subir a PREMIUM (simulado).
    const up = await ctx
      .http()
      .post('/api/subscriptions/change-plan')
      .set(...bearer(token))
      .send({ planCode: 'premium' })
      .expect(201);
    expect(up.body).toMatchObject({ status: 'ACTIVE', plan: { code: 'PREMIUM' } });

    await createWardrobe(token, 'C').expect(201);

    // Repetir el mismo plan -> 409
    await ctx
      .http()
      .post('/api/subscriptions/change-plan')
      .set(...bearer(token))
      .send({ planCode: 'PREMIUM' })
      .expect(409);

    // Bajar a FREE: los 3 armarios se CONSERVAN...
    await ctx
      .http()
      .post('/api/subscriptions/change-plan')
      .set(...bearer(token))
      .send({ planCode: 'FREE' })
      .expect(201);

    const list = await ctx.http().get('/api/wardrobes').set(...bearer(token)).expect(200);
    expect(list.body.meta.total).toBe(3);

    // ...pero no se pueden crear más mientras se supere el límite.
    await createWardrobe(token, 'D').expect(403);

    // Sí se puede borrar.
    await ctx
      .http()
      .delete(`/api/wardrobes/${list.body.data[0].id}`)
      .set(...bearer(token))
      .expect(204);

    // Historial conservado: PREMIUM (cancelada) + FREE (activa).
    const history = await ctx.http().get('/api/subscriptions').set(...bearer(token)).expect(200);
    expect(history.body).toHaveLength(2);
    expect(history.body.filter((s: { status: string }) => s.status === 'ACTIVE')).toHaveLength(1);

    const active = await ctx.prisma.subscription.count({
      where: { userId, status: 'ACTIVE' },
    });
    expect(active).toBe(1);
  });

  it('404 al cambiar a un plan inexistente', async () => {
    const { token } = await registerUser(ctx, 'noplan');
    await ctx
      .http()
      .post('/api/subscriptions/change-plan')
      .set(...bearer(token))
      .send({ planCode: 'GOLD' })
      .expect(404);
  });

  it('concurrencia: peticiones simultáneas no superan el límite', async () => {
    const { token, userId } = await registerUser(ctx, 'race');

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => createWardrobe(token, `Paralelo ${i}`)),
    );
    const statuses = results.map((r) => r.status).sort();

    expect(statuses.filter((s) => s === 201)).toHaveLength(2);
    expect(statuses.filter((s) => s === 403)).toHaveLength(4);
    expect(await ctx.prisma.wardrobe.count({ where: { userId } })).toBe(2);
  });

  it('el límite de prendas es por usuario, no por armario', async () => {
    const { token, userId } = await registerUser(ctx, 'items');
    const freePlan = await ctx.prisma.plan.findUniqueOrThrow({ where: { code: 'FREE' } });
    const limit = await ctx.prisma.planLimit.findUniqueOrThrow({
      where: { planId_resource: { planId: freePlan.id, resource: 'WARDROBE_ITEMS' } },
    });
    const type = await ctx.prisma.garmentType.findUniqueOrThrow({ where: { code: 'CAP' } });

    const w1 = await createWardrobe(token, 'Uno').expect(201);
    const w2 = await createWardrobe(token, 'Dos').expect(201);

    // Rellenamos directamente en BD hasta el límite, repartido en 2 armarios.
    await ctx.prisma.wardrobeItem.createMany({
      data: Array.from({ length: limit.maxCount }, (_, i) => ({
        userId,
        wardrobeId: i % 2 === 0 ? w1.body.id : w2.body.id,
        garmentTypeId: type.id,
        name: `Gorra ${i}`,
        color: '#111111',
      })),
    });

    await ctx
      .http()
      .post('/api/wardrobe-items')
      .set(...bearer(token))
      .send({ wardrobeId: w2.body.id, garmentTypeId: type.id, name: 'Una más', color: '#222222' })
      .expect(403);
  });
});
