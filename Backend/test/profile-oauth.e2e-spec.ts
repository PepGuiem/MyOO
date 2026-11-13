import { createHash } from 'node:crypto';
import { bearer, createTestApp, registerUser, TestContext } from './utils';

/** PNG real de 1×1 píxel (para la foto de perfil). */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
let n = 0;

/**
 * Simula la vuelta de Google: deja en la base de datos un flujo ya comprobado
 * con su código de resultado (lo que haría el callback tras hablar con Google).
 */
async function googleResult(
  ctx: TestContext,
  identity: {
    sub: string;
    email: string | null;
    emailVerified: boolean;
    name?: string;
  },
  flow: { intent?: 'LOGIN' | 'LINK' | 'REAUTH'; userId?: string } = {},
): Promise<string> {
  n += 1;
  const result = `resultado-de-prueba-${Date.now()}-${n}-xxxxxxxx`;
  await ctx.prisma.oAuthFlow.create({
    data: {
      stateHash: sha(`state-${result}`),
      browserHash: sha('cookie'),
      provider: 'GOOGLE',
      intent: flow.intent ?? 'LOGIN',
      userId: flow.userId ?? null,
      nonce: 'n',
      claimedAt: new Date(),
      resultHash: sha(result),
      outcome: {
        provider: 'GOOGLE',
        name: identity.name ?? null,
        picture: null,
        ...identity,
      },
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  return result;
}

describe('Perfil y login con Google/Apple (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  describe('perfil', () => {
    it('GET /users/me devuelve el perfil, sin hash ni tokens', async () => {
      const { token } = await registerUser(ctx, 'perfil');
      const me = await ctx
        .http()
        .get('/api/users/me')
        .set(...bearer(token))
        .expect(200);
      expect(me.body).toMatchObject({
        hasPassword: true,
        emailVerified: false,
        accounts: [],
        styleTags: [],
        username: null,
      });
      expect(JSON.stringify(me.body)).not.toMatch(
        /passwordHash|argon2|accessToken/,
      );
    });

    it('PATCH /users/me guarda el perfil completo', async () => {
      const { token } = await registerUser(ctx, 'perfil2');
      const res = await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(token))
        .send({
          username: '@Ana.Street',
          bio: 'Vintage y calle',
          pronouns: 'ella',
          location: 'Barcelona',
          website: 'https://ana.example',
          instagramHandle: '@ana.street',
          styleTags: ['streetwear', 'vintage'],
          favoriteColors: ['#1a1a1a'],
          sizeTop: 'M',
          sizeBottom: '38',
          sizeShoes: '39',
          accentColor: '#ff5a1f',
        })
        .expect(200);
      expect(res.body).toMatchObject({
        username: 'ana.street',
        instagramHandle: 'ana.street',
        styleTags: ['streetwear', 'vintage'],
        favoriteColors: ['#1A1A1A'],
        sizes: { top: 'M', bottom: '38', shoes: '39' },
        accentColor: '#FF5A1F',
      });

      // Borrar un campo con texto vacío
      const cleared = await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(token))
        .send({ bio: '' })
        .expect(200);
      expect(cleared.body.bio).toBeNull();
    });

    it('el @usuario es único (409) y hay nombres reservados (400)', async () => {
      const a = await registerUser(ctx, 'unico-a');
      const b = await registerUser(ctx, 'unico-b');
      await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(a.token))
        .send({ username: 'mismo_nombre' })
        .expect(200);
      const res = await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(b.token))
        .send({ username: 'MISMO_NOMBRE' })
        .expect(409);
      expect(res.body.code).toBe('username_taken');
      await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(b.token))
        .send({ username: 'admin' })
        .expect(400);

      const avail = await ctx
        .http()
        .get('/api/users/me/username-available')
        .query({ username: 'mismo_nombre' })
        .set(...bearer(b.token))
        .expect(200);
      expect(avail.body).toMatchObject({ available: false, valid: true });
      const mine = await ctx
        .http()
        .get('/api/users/me/username-available')
        .query({ username: 'mismo_nombre' })
        .set(...bearer(a.token))
        .expect(200);
      expect(mine.body.available).toBe(true);
    });

    it('foto de perfil: solo imágenes propias; la anterior se borra al cambiarla', async () => {
      const a = await registerUser(ctx, 'foto-a');
      const b = await registerUser(ctx, 'foto-b');
      const up = async (token: string) =>
        (
          await ctx
            .http()
            .post('/api/assets')
            .set(...bearer(token))
            .attach('file', PNG_1X1, 'f.png')
            .expect(201)
        ).body.id as string;

      const ajena = await up(b.token);
      await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(a.token))
        .send({ avatarAssetId: ajena })
        .expect(400);

      const first = await up(a.token);
      const res = await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(a.token))
        .send({ avatarAssetId: first })
        .expect(200);
      expect(res.body.avatarAssetId).toBe(first);
      // La foto de perfil no aparece entre las imágenes para logos.
      const list = await ctx
        .http()
        .get('/api/assets')
        .set(...bearer(a.token))
        .expect(200);
      const ids = (list.body as { id: string }[]).map((x) => x.id);
      expect(ids).not.toContain(first);

      const second = await up(a.token);
      await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(a.token))
        .send({ avatarAssetId: second })
        .expect(200);
      expect(
        await ctx.prisma.asset.findUnique({ where: { id: first } }),
      ).toBeNull();

      const removed = await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(a.token))
        .send({ avatarAssetId: null })
        .expect(200);
      expect(removed.body.avatarAssetId).toBeNull();
    });

    it('cambiar la contraseña pide la actual', async () => {
      const { token, email } = await registerUser(ctx, 'pw');
      await ctx
        .http()
        .post('/api/users/me/password')
        .set(...bearer(token))
        .send({ newPassword: 'Nueva12345' })
        .expect(403);
      await ctx
        .http()
        .post('/api/users/me/password')
        .set(...bearer(token))
        .send({ newPassword: 'Nueva12345', currentPassword: 'mal' })
        .expect(403);
      await ctx
        .http()
        .post('/api/users/me/password')
        .set(...bearer(token))
        .send({ newPassword: 'Nueva12345', currentPassword: 'Password123' })
        .expect(204);
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email, password: 'Nueva12345' })
        .expect(200);
    });
  });

  describe('login con Google (canje del resultado)', () => {
    it('GET /auth/oauth/providers dice qué proveedores hay', async () => {
      const res = await ctx.http().get('/api/auth/oauth/providers').expect(200);
      expect(res.body).toEqual({
        google: expect.any(Boolean),
        apple: expect.any(Boolean),
        instagram: expect.any(Boolean),
      });
    });

    it('crea la cuenta sin contraseña; el código solo vale una vez', async () => {
      const result = await googleResult(ctx, {
        sub: 'g-nuevo',
        email: 'nuevo.google@test.local',
        emailVerified: true,
        name: 'Nuevo',
      });
      const res = await ctx
        .http()
        .post('/api/auth/oauth/exchange')
        .send({ result })
        .expect(200);
      expect(res.body).toMatchObject({
        created: true,
        user: {
          email: 'nuevo.google@test.local',
          hasPassword: false,
          emailVerified: true,
          displayName: 'Nuevo',
        },
      });
      expect(res.body.user.accounts).toEqual([
        expect.objectContaining({ provider: 'GOOGLE' }),
      ]);
      await ctx
        .http()
        .post('/api/auth/oauth/exchange')
        .send({ result })
        .expect(400);

      // Sin contraseña, el login con email no funciona (mismo 401 de siempre).
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: 'nuevo.google@test.local', password: 'Password123' })
        .expect(401);
    });

    it('conecta con una cuenta existente si Google verifica el email; si nunca se verificó, quita la contraseña', async () => {
      const { email, userId } = await registerUser(ctx, 'existente');
      const result = await googleResult(ctx, {
        sub: 'g-existente',
        email,
        emailVerified: true,
      });
      const res = await ctx
        .http()
        .post('/api/auth/oauth/exchange')
        .send({ result })
        .expect(200);
      expect(res.body).toMatchObject({
        created: false,
        passwordRemoved: true,
        user: { id: userId, hasPassword: false },
      });
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email, password: 'Password123' })
        .expect(401);
    });

    it('no conecta si Google no verifica el email', async () => {
      const { email } = await registerUser(ctx, 'sinverificar');
      const result = await googleResult(ctx, {
        sub: 'g-sinverificar',
        email,
        emailVerified: false,
      });
      const res = await ctx
        .http()
        .post('/api/auth/oauth/exchange')
        .send({ result })
        .expect(400);
      expect(res.body.code).toBe('email_unverified');
    });

    it('LINK: solo lo termina el mismo usuario que lo empezó', async () => {
      const a = await registerUser(ctx, 'link-a');
      const b = await registerUser(ctx, 'link-b');
      const result = await googleResult(
        ctx,
        { sub: 'g-link', email: 'otro@test.local', emailVerified: true },
        { intent: 'LINK', userId: a.userId },
      );
      await ctx
        .http()
        .post('/api/auth/oauth/exchange/me')
        .set(...bearer(b.token))
        .send({ result })
        .expect(403);

      const again = await googleResult(
        ctx,
        { sub: 'g-link', email: 'otro@test.local', emailVerified: true },
        { intent: 'LINK', userId: a.userId },
      );
      await ctx
        .http()
        .post('/api/auth/oauth/exchange/me')
        .set(...bearer(a.token))
        .send({ result: again })
        .expect(200);
      const me = await ctx
        .http()
        .get('/api/users/me')
        .set(...bearer(a.token))
        .expect(200);
      expect(me.body.accounts).toEqual([
        expect.objectContaining({
          provider: 'GOOGLE',
          email: 'otro@test.local',
        }),
      ]);

      // Un LINK no sirve para entrar sin sesión.
      const third = await googleResult(
        ctx,
        { sub: 'g-link', email: 'otro@test.local', emailVerified: true },
        { intent: 'LINK', userId: a.userId },
      );
      await ctx
        .http()
        .post('/api/auth/oauth/exchange')
        .send({ result: third })
        .expect(400);
    });

    it('cuenta sin contraseña: no se puede quitar su único login, y borrarla pide volver a entrar con Google', async () => {
      const result = await googleResult(ctx, {
        sub: 'g-solo',
        email: 'solo.google@test.local',
        emailVerified: true,
      });
      const login = await ctx
        .http()
        .post('/api/auth/oauth/exchange')
        .send({ result })
        .expect(200);
      const token = login.body.accessToken as string;

      const unlink = await ctx
        .http()
        .delete('/api/users/me/accounts/google')
        .set(...bearer(token))
        .expect(409);
      expect(unlink.body.code).toBe('last_login_method');

      const del = await ctx
        .http()
        .delete('/api/users/me')
        .set(...bearer(token))
        .send({})
        .expect(403);
      expect(del.body.code).toBe('reauth_required');

      // Volver a entrar con la MISMA cuenta de Google da una prueba de identidad...
      const reauth = await googleResult(
        ctx,
        { sub: 'g-solo', email: 'solo.google@test.local', emailVerified: true },
        { intent: 'REAUTH', userId: login.body.user.id },
      );
      const proof = await ctx
        .http()
        .post('/api/auth/oauth/exchange/me')
        .set(...bearer(token))
        .send({ result: reauth })
        .expect(200);
      expect(proof.body).toMatchObject({
        intent: 'reauth',
        provider: 'google',
      });

      // ...con la que se puede crear una contraseña (y solo una vez).
      await ctx
        .http()
        .post('/api/users/me/password')
        .set(...bearer(token))
        .send({
          newPassword: 'Nueva12345',
          reauthToken: proof.body.reauthToken,
        })
        .expect(204);
      await ctx
        .http()
        .post('/api/users/me/password')
        .set(...bearer(token))
        .send({ newPassword: 'Otra12345', reauthToken: proof.body.reauthToken })
        .expect(403);

      // Con contraseña ya se puede desconectar Google.
      await ctx
        .http()
        .delete('/api/users/me/accounts/google')
        .set(...bearer(token))
        .expect(204);
    });

    it('REAUTH con otra cuenta de Google no vale', async () => {
      const result = await googleResult(ctx, {
        sub: 'g-dueno',
        email: 'dueno@test.local',
        emailVerified: true,
      });
      const login = await ctx
        .http()
        .post('/api/auth/oauth/exchange')
        .send({ result })
        .expect(200);
      const reauth = await googleResult(
        ctx,
        { sub: 'g-otro', email: 'x@test.local', emailVerified: true },
        { intent: 'REAUTH', userId: login.body.user.id },
      );
      await ctx
        .http()
        .post('/api/auth/oauth/exchange/me')
        .set(...bearer(login.body.accessToken))
        .send({ result: reauth })
        .expect(403);
    });
  });

  describe('vuelta del proveedor (callback)', () => {
    it('sin cookie del navegador o con un state desconocido, vuelve al frontend con error', async () => {
      const res = await ctx
        .http()
        .get('/api/auth/oauth/google/callback')
        .query({ code: 'x', state: 'desconocido' })
        .expect(302);
      expect(res.headers.location).toMatch(
        /\/auth\/callback#error=(expired|not_configured)/,
      );
    });
  });
});
