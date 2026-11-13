import { bearer, createTestApp, registerUser, TestContext } from './utils';

const MEASURES = { heightCm: 178, shoulderCm: 44, chestCm: 98, waistCm: 82, hipCm: 96, armCm: 30 };

describe('Maniquíes personalizados (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const create = (token: string, body: object) => ctx.http().post('/api/mannequins').set(...bearer(token)).send(body);

  it('crea un maniquí (el primero queda por defecto) y redondea a medio centímetro', async () => {
    const { token } = await registerUser(ctx, 'mq');
    const res = await create(token, { name: 'Yo', sex: 'male', measures: { ...MEASURES, chestCm: 98.26 } }).expect(201);
    expect(res.body.isDefault).toBe(true);
    expect(res.body.measures.chestCm).toBe(98.5);
    const list = await ctx.http().get('/api/mannequins').set(...bearer(token)).expect(200);
    expect(list.body).toHaveLength(1);
  });

  it('valida las medidas, el sexo y no admite campos de más (400)', async () => {
    const { token } = await registerUser(ctx, 'mq-val');
    await create(token, { name: 'X', sex: 'male', measures: { ...MEASURES, heightCm: 300 } }).expect(400);
    await create(token, { name: 'X', sex: 'otro', measures: MEASURES }).expect(400);
    await create(token, { name: 'X', sex: 'male', measures: { ...MEASURES, extra: 1 } }).expect(400);
    await create(token, { name: 'X', sex: 'male', measures: { heightCm: 170 } }).expect(400);
  });

  it('el plan gratuito permite 1; al subir de plan se pueden crear más', async () => {
    const { token } = await registerUser(ctx, 'mq-plan');
    await create(token, { name: 'Uno', sex: 'female', measures: MEASURES }).expect(201);
    const blocked = await create(token, { name: 'Dos', sex: 'female', measures: MEASURES }).expect(403);
    expect(blocked.body.error).toBe('PlanLimitReached');
    expect(blocked.body.resource).toBe('MANNEQUINS');

    await ctx.http().post('/api/subscriptions/change-plan').set(...bearer(token)).send({ planCode: 'PLUS' }).expect((r) => expect([200, 201]).toContain(r.status));
    await create(token, { name: 'Dos', sex: 'female', measures: MEASURES }).expect(201);
    const me = await ctx.http().get('/api/plans/me').set(...bearer(token)).expect(200);
    const usage = me.body.usage.find((u: { resource: string }) => u.resource === 'MANNEQUINS');
    expect(usage).toEqual({ resource: 'MANNEQUINS', used: 2, isUnlimited: false, max: 5 });
  });

  it('solo un maniquí por defecto; nombres únicos por cuenta (409)', async () => {
    const { token } = await registerUser(ctx, 'mq-def');
    await ctx.http().post('/api/subscriptions/change-plan').set(...bearer(token)).send({ planCode: 'PLUS' });
    const a = await create(token, { name: 'A', sex: 'male', measures: MEASURES }).expect(201);
    const b = await create(token, { name: 'B', sex: 'male', measures: MEASURES, isDefault: true }).expect(201);
    const list = await ctx.http().get('/api/mannequins').set(...bearer(token)).expect(200);
    const byId = Object.fromEntries(list.body.map((m: { id: string; isDefault: boolean }) => [m.id, m.isDefault]));
    expect(byId[a.body.id as string]).toBe(false);
    expect(byId[b.body.id as string]).toBe(true);
    await create(token, { name: 'A', sex: 'male', measures: MEASURES }).expect(409);
    await ctx.http().patch(`/api/mannequins/${a.body.id as string}`).set(...bearer(token)).send({ isDefault: true }).expect(200);
    const after = await ctx.http().get(`/api/mannequins/${b.body.id as string}`).set(...bearer(token)).expect(200);
    expect(after.body.isDefault).toBe(false);
  });

  it('no deja ver, cambiar ni borrar maniquíes de otra cuenta (404)', async () => {
    const owner = await registerUser(ctx, 'mq-own');
    const other = await registerUser(ctx, 'mq-other');
    const m = await create(owner.token, { name: 'Mío', sex: 'male', measures: MEASURES }).expect(201);
    const id = m.body.id as string;
    await ctx.http().get(`/api/mannequins/${id}`).set(...bearer(other.token)).expect(404);
    await ctx.http().patch(`/api/mannequins/${id}`).set(...bearer(other.token)).send({ name: 'Robado' }).expect(404);
    await ctx.http().delete(`/api/mannequins/${id}`).set(...bearer(other.token)).expect(404);
    await ctx.http().delete(`/api/mannequins/${id}`).set(...bearer(owner.token)).expect(204);
  });
});
