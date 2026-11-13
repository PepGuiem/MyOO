import { bearer, createTestApp, registerUser, TestContext } from './utils';

describe('Monitor de admins (e2e)', () => {
  let ctx: TestContext;
  let admin: { token: string; userId: string };
  let user: { token: string; userId: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await registerUser(ctx, 'mon-admin');
    user = await registerUser(ctx, 'mon-user');
    await ctx.prisma.user.update({
      where: { id: admin.userId },
      data: { role: 'ADMIN' },
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('solo para admins', async () => {
    for (const path of ['live', 'database', 'activity', 'feed']) {
      await ctx
        .http()
        .get(`/api/admin/monitor/${path}`)
        .set(...bearer(user.token))
        .expect(403);
    }
  });

  it('live: estado, tráfico por minuto y rutas (sin contar el propio monitor)', async () => {
    await ctx
      .http()
      .get('/api/users/me')
      .set(...bearer(user.token))
      .expect(200);
    await ctx
      .http()
      .get('/api/ideas/no-es-un-uuid')
      .set(...bearer(user.token))
      .expect(400);
    const res = await ctx
      .http()
      .get('/api/admin/monitor/live?range=1h')
      .set(...bearer(admin.token))
      .expect(200);
    expect(res.body.status.checks.map((c: { key: string }) => c.key)).toEqual([
      'database',
      'errors',
      'latency',
      'eventloop',
      'memory',
      'moderation',
    ]);
    expect(res.body.database.ok).toBe(true);
    expect(res.body.traffic.points).toHaveLength(60);
    expect(res.body.summary.last60.requests).toBeGreaterThanOrEqual(2);
    const routes = res.body.routes.map((r: { route: string }) => r.route);
    expect(routes).toContain('/api/users/me');
    expect(routes.some((r: string) => r.startsWith('/api/admin/monitor'))).toBe(
      false,
    );
    await ctx
      .http()
      .get('/api/admin/monitor/live?range=2h')
      .set(...bearer(admin.token))
      .expect(400);
  });

  it('actividad: el usuario que ha hecho peticiones cuenta como activo hoy', async () => {
    await ctx
      .http()
      .get('/api/users/me')
      .set(...bearer(user.token))
      .expect(200);
    // La actividad se apunta sin esperar a la respuesta.
    await new Promise((r) => setTimeout(r, 200));
    const res = await ctx
      .http()
      .get('/api/admin/monitor/activity?days=7')
      .set(...bearer(admin.token))
      .expect(200);
    expect(res.body.active.dau).toBeGreaterThanOrEqual(2);
    expect(res.body.daily.signups.points).toHaveLength(7);
    expect(res.body.daily.signups.points[6].value).toBeGreaterThanOrEqual(2);
    expect(res.body.totals.users).toBeGreaterThanOrEqual(2);
    await ctx
      .http()
      .get('/api/admin/monitor/activity?days=12')
      .set(...bearer(admin.token))
      .expect(400);
  });

  it('base de datos y últimos eventos', async () => {
    const db = await ctx
      .http()
      .get('/api/admin/monitor/database')
      .set(...bearer(admin.token))
      .expect(200);
    expect(db.body).toMatchObject({ ok: true });
    expect(db.body.tables.length).toBeGreaterThan(0);
    const feed = await ctx
      .http()
      .get('/api/admin/monitor/feed')
      .set(...bearer(admin.token))
      .expect(200);
    expect(feed.body.some((i: { kind: string }) => i.kind === 'signup')).toBe(
      true,
    );
  });
});
