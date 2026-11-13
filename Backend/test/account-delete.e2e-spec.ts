import { bearer, createTestApp, registerUser, TestContext } from './utils';

describe('Borrar la cuenta (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('pide la contraseña: sin ella 400, con una incorrecta 403 (no 401) y no borra nada', async () => {
    const { token, userId } = await registerUser(ctx, 'borrar');
    await ctx.http().delete('/api/users/me').set(...bearer(token)).send({}).expect(400);
    await ctx.http().delete('/api/users/me').set(...bearer(token)).send({ password: 'Otra12345' }).expect(403);
    expect(await ctx.prisma.user.findUnique({ where: { id: userId } })).not.toBeNull();
  });

  it('con la contraseña correcta borra la cuenta y todos sus datos', async () => {
    const { token, userId, email } = await registerUser(ctx, 'borrar');
    const w = await ctx.http().post('/api/wardrobes').set(...bearer(token)).send({ name: 'Diario' }).expect(201);

    await ctx.http().delete('/api/users/me').set(...bearer(token)).send({ password: 'Password123' }).expect(204);

    expect(await ctx.prisma.user.findUnique({ where: { id: userId } })).toBeNull();
    expect(await ctx.prisma.wardrobe.findUnique({ where: { id: w.body.id as string } })).toBeNull();
    // El token ya no sirve y no se puede entrar con esa cuenta.
    await ctx.http().get('/api/users/me').set(...bearer(token)).expect((r) => expect([401, 404]).toContain(r.status));
    await ctx.http().post('/api/auth/login').send({ email, password: 'Password123' }).expect(401);
  });

  it('no afecta a otras cuentas', async () => {
    const a = await registerUser(ctx, 'queda');
    const b = await registerUser(ctx, 'se-va');
    await ctx.http().delete('/api/users/me').set(...bearer(b.token)).send({ password: 'Password123' }).expect(204);
    await ctx.http().get('/api/users/me').set(...bearer(a.token)).expect(200);
  });
});
