import { bearer, createTestApp, registerUser, TestContext } from './utils';

describe('Auth y usuarios (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET /api/health responde ok', async () => {
    const res = await ctx.http().get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up' });
  });

  describe('registro', () => {
    it('crea la cuenta y devuelve un token, sin el hash', async () => {
      const res = await ctx
        .http()
        .post('/api/auth/register')
        .send({ email: '  Ana@Example.COM ', password: 'Password123' })
        .expect(201);

      expect(res.body.tokenType).toBe('Bearer');
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.user.email).toBe('ana@example.com');
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('argon2');
    });

    it('guarda la contraseña con Argon2id (nunca en texto plano)', async () => {
      const user = await ctx.prisma.user.findUniqueOrThrow({
        where: { email: 'ana@example.com' },
      });
      expect(user.passwordHash?.startsWith('$argon2id$')).toBe(true);
      expect(user.passwordHash).not.toContain('Password123');
    });

    it('rechaza un email ya registrado (409), sin distinguir mayúsculas', async () => {
      await ctx
        .http()
        .post('/api/auth/register')
        .send({ email: 'ANA@example.com', password: 'Password123' })
        .expect(409);
    });

    it.each([
      [{ email: 'no-es-un-email', password: 'Password123' }],
      [{ email: 'x@test.local', password: 'corta1' }],
      [{ email: 'x@test.local', password: 'sinnumeros' }],
      [{ email: 'x@test.local' }],
      [{ password: 'Password123' }],
    ])('rechaza datos inválidos (400): %j', async (body) => {
      const res = await ctx
        .http()
        .post('/api/auth/register')
        .send(body)
        .expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, path: '/api/auth/register' });
    });

    it('rechaza campos no permitidos (asignación masiva)', async () => {
      await ctx
        .http()
        .post('/api/auth/register')
        .send({ email: 'y@test.local', password: 'Password123', passwordHash: 'x' })
        .expect(400);
    });
  });

  describe('login', () => {
    it('devuelve token con credenciales correctas', async () => {
      const res = await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: 'Password123' })
        .expect(200);
      expect(res.body.accessToken).toBeDefined();
    });

    it('401 con contraseña incorrecta o email inexistente (mismo mensaje)', async () => {
      const a = await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'ana@example.com', password: 'Incorrecta123' })
        .expect(401);
      const b = await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'nadie@example.com', password: 'Incorrecta123' })
        .expect(401);
      expect(a.body.message).toBe(b.body.message);
    });
  });

  describe('rutas protegidas', () => {
    it('401 sin token', async () => {
      await ctx.http().get('/api/users/me').expect(401);
    });

    it('401 con token inválido', async () => {
      await ctx
        .http()
        .get('/api/users/me')
        .set(...bearer('esto.no.vale'))
        .expect(401);
    });

    it('GET y PATCH /api/users/me', async () => {
      const { token, email } = await registerUser(ctx, 'perfil');
      const me = await ctx.http().get('/api/users/me').set(...bearer(token)).expect(200);
      expect(me.body.email).toBe(email);
      expect(me.body.passwordHash).toBeUndefined();

      const updated = await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(token))
        .send({ displayName: '  Nuevo nombre ' })
        .expect(200);
      expect(updated.body.displayName).toBe('Nuevo nombre');

      // No se puede cambiar el email por aquí.
      await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(token))
        .send({ email: 'otro@test.local' })
        .expect(400);
    });

    it('un token de un usuario borrado deja de valer', async () => {
      const { token, userId } = await registerUser(ctx, 'borrado');
      await ctx.prisma.user.delete({ where: { id: userId } });
      await ctx.http().get('/api/users/me').set(...bearer(token)).expect(401);
    });
  });

  it('GET /api/garment-types es público y devuelve el esquema de atributos', async () => {
    const res = await ctx.http().get('/api/garment-types').expect(200);
    expect(res.body.length).toBeGreaterThan(5);
    const tshirt = res.body.find((t: { code: string }) => t.code === 'T_SHIRT');
    expect(tshirt.attributeSchema.fields.sleeve.type).toBe('enum');
  });
});
