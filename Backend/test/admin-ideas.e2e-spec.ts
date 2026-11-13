import { bearer, createTestApp, registerUser, TestContext } from './utils';

type U = { token: string; userId: string; email: string };

describe('Ideas, denuncias, admin y novedades (e2e)', () => {
  let ctx: TestContext;
  let admin: U;

  beforeAll(async () => {
    ctx = await createTestApp();
    admin = await registerUser(ctx, 'admin');
    // En la app real esto lo hace `npm run admin:grant`.
    await ctx.prisma.user.update({
      where: { id: admin.userId },
      data: { role: 'ADMIN' },
    });
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  const as = (u: U) => ({
    get: (url: string) =>
      ctx
        .http()
        .get(`/api${url}`)
        .set(...bearer(u.token)),
    post: (url: string, body?: object) =>
      ctx
        .http()
        .post(`/api${url}`)
        .set(...bearer(u.token))
        .send(body ?? {}),
    patch: (url: string, body: object) =>
      ctx
        .http()
        .patch(`/api${url}`)
        .set(...bearer(u.token))
        .send(body),
    put: (url: string, body: object) =>
      ctx
        .http()
        .put(`/api${url}`)
        .set(...bearer(u.token))
        .send(body),
    del: (url: string) =>
      ctx
        .http()
        .delete(`/api${url}`)
        .set(...bearer(u.token)),
  });

  describe('tablón de ideas', () => {
    it('proponer, votar y ordenar por votos', async () => {
      const ana = await registerUser(ctx, 'idea-ana');
      const bob = await registerUser(ctx, 'idea-bob');
      const a = await as(ana)
        .post('/ideas', {
          title: 'Modo claro opcional',
          body: 'Para usarla de día al sol',
          category: 'FEATURE',
        })
        .expect(201);
      expect(a.body).toMatchObject({
        voteCount: 1,
        votedByMe: true,
        mine: true,
        status: 'NEW',
      });
      const b = await as(bob)
        .post('/ideas', {
          title: 'Exportar outfits',
          body: 'Como imagen para compartir',
        })
        .expect(201);

      expect(
        (await as(bob).post(`/ideas/${a.body.id}/vote`).expect(200)).body,
      ).toEqual({ voteCount: 2, votedByMe: true });
      // Votar dos veces no suma.
      expect(
        (await as(bob).post(`/ideas/${a.body.id}/vote`).expect(200)).body
          .voteCount,
      ).toBe(2);

      const list = await as(bob).get('/ideas?sort=top').expect(200);
      const ids = list.body.data.map((i: { id: string }) => i.id);
      expect(ids.indexOf(a.body.id)).toBeLessThan(ids.indexOf(b.body.id));

      expect(
        (await as(bob).del(`/ideas/${a.body.id}/vote`).expect(200)).body,
      ).toEqual({ voteCount: 1, votedByMe: false });
    });

    it('el admin responde y cambia el estado; llegan los avisos', async () => {
      const ana = await registerUser(ctx, 'reply-ana');
      const bob = await registerUser(ctx, 'reply-bob');
      const idea = await as(ana)
        .post('/ideas', {
          title: 'Calendario de outfits',
          body: 'Planificar la semana',
        })
        .expect(201);
      await as(bob).post(`/ideas/${idea.body.id}/vote`).expect(200);

      // Una cuenta normal no puede.
      await as(bob)
        .patch(`/admin/ideas/${idea.body.id}`, { status: 'PLANNED' })
        .expect(403);

      await as(admin)
        .patch(`/admin/ideas/${idea.body.id}`, {
          status: 'PLANNED',
          adminReply: 'Nos encanta, va en la próxima',
        })
        .expect(200);

      const anaN = await as(ana).get('/notifications').expect(200);
      expect(anaN.body[0]).toMatchObject({
        type: 'IDEA_REPLY',
        link: `/ideas?idea=${idea.body.id}`,
      });
      const bobN = await as(bob).get('/notifications').expect(200);
      expect(bobN.body[0]).toMatchObject({ type: 'IDEA_STATUS' });
      expect(
        (await as(bob).get('/notifications/unread').expect(200)).body,
      ).toEqual({ unread: 1 });
      expect(
        (await as(bob).post('/notifications/read').expect(200)).body,
      ).toEqual({ unread: 0 });

      // Ya revisada: la autora no la puede borrar.
      await as(ana).del(`/ideas/${idea.body.id}`).expect(403);
    });

    it('las ocultas solo las ven su autora y los admins', async () => {
      const ana = await registerUser(ctx, 'hid-ana');
      const bob = await registerUser(ctx, 'hid-bob');
      const idea = await as(ana)
        .post('/ideas', {
          title: 'Idea a ocultar',
          body: 'Contenido no apropiado',
        })
        .expect(201);
      await as(admin)
        .patch(`/admin/ideas/${idea.body.id}`, { hidden: true })
        .expect(200);
      await as(bob).get(`/ideas/${idea.body.id}`).expect(404);
      await as(ana).get(`/ideas/${idea.body.id}`).expect(200);
      await as(admin).get(`/ideas/${idea.body.id}`).expect(200);
    });
  });

  describe('denuncias y moderación', () => {
    it('denunciar un mensaje: solo si estás en la conversación; el admin lo borra', async () => {
      const ana = await registerUser(ctx, 'rep-ana');
      const bob = await registerUser(ctx, 'rep-bob');
      const eve = await registerUser(ctx, 'rep-eve');
      await ctx.prisma.user.updateMany({
        where: { id: { in: [ana.userId, bob.userId] } },
        data: { messagePolicy: 'EVERYONE' },
      });
      const conv = await as(ana)
        .post('/conversations/direct', { userId: bob.userId })
        .expect(200);
      const msg = await as(bob)
        .post(`/conversations/${conv.body.id}/messages`, {
          body: 'mensaje feo',
        })
        .expect(201);

      // Alguien de fuera no lo puede denunciar (ni saber que existe).
      await as(eve)
        .post('/reports', {
          targetType: 'MESSAGE',
          targetId: msg.body.id,
          reason: 'HARASSMENT',
        })
        .expect(404);
      // El admin tampoco puede borrar mensajes no denunciados.
      await as(admin).del(`/admin/messages/${msg.body.id}`).expect(403);

      const r1 = await as(ana)
        .post('/reports', {
          targetType: 'MESSAGE',
          targetId: msg.body.id,
          reason: 'HARASSMENT',
          details: 'insultos',
        })
        .expect(201);
      // Denunciar otra vez devuelve la misma denuncia.
      const r2 = await as(ana)
        .post('/reports', {
          targetType: 'MESSAGE',
          targetId: msg.body.id,
          reason: 'HARASSMENT',
        })
        .expect(201);
      expect(r2.body.id).toBe(r1.body.id);

      const open = await as(admin)
        .get('/admin/reports?status=OPEN')
        .expect(200);
      const rep = open.body.data.find(
        (r: { id: string }) => r.id === r1.body.id,
      );
      expect(rep).toMatchObject({
        targetType: 'MESSAGE',
        snapshot: { body: 'mensaje feo' },
        targetUser: { id: bob.userId },
        targetState: 'visible',
      });

      await as(admin).del(`/admin/messages/${msg.body.id}`).expect(204);
      await as(admin)
        .patch(`/admin/reports/${r1.body.id}`, {
          status: 'RESOLVED',
          resolution: 'Mensaje borrado',
        })
        .expect(200);
      const n = await as(ana).get('/notifications').expect(200);
      expect(n.body[0]).toMatchObject({ type: 'REPORT_UPDATE' });
    });

    it('no puedes denunciarte a ti', async () => {
      const ana = await registerUser(ctx, 'self-ana');
      await as(ana)
        .post('/reports', {
          targetType: 'USER',
          targetId: ana.userId,
          reason: 'SPAM',
        })
        .expect(400);
    });
  });

  describe('suspender cuentas', () => {
    it('una cuenta suspendida no puede usar la API ni entrar; al levantarlo, sí', async () => {
      const bob = await registerUser(ctx, 'ban-bob');
      await as(admin)
        .post(`/admin/users/${bob.userId}/ban`, {
          reason: 'spam repetido',
          days: 3,
        })
        .expect(200);

      const res = await as(bob).get('/users/me').expect(403);
      expect(res.body).toMatchObject({
        code: 'banned',
        reason: 'spam repetido',
      });
      const login = await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: bob.email, password: 'Password123' })
        .expect(403);
      expect(login.body.code).toBe('banned');

      // No sale en las búsquedas de personas ni se ve su perfil.
      const ana = await registerUser(ctx, 'ban-ana');
      await as(ana).get(`/people/${bob.userId}`).expect(404);

      const detail = await as(admin)
        .get(`/admin/users/${bob.userId}`)
        .expect(200);
      expect(detail.body).toMatchObject({
        banned: true,
        actions: [{ action: 'user.ban' }],
      });

      await as(admin).del(`/admin/users/${bob.userId}/ban`).expect(200);
      await ctx
        .http()
        .post('/api/auth/login')
        .send({ email: bob.email, password: 'Password123' })
        .expect(200);
    });

    it('no se puede suspender a un admin ni a uno mismo', async () => {
      await as(admin)
        .post(`/admin/users/${admin.userId}/ban`, { reason: 'prueba' })
        .expect(400);
    });

    it('una cuenta normal no entra al panel', async () => {
      const bob = await registerUser(ctx, 'noadmin');
      await as(bob).get('/admin/stats').expect(403);
      await as(bob).get('/admin/users').expect(403);
    });
  });

  describe('novedades', () => {
    it('los borradores no se ven; al publicar llega el aviso a todos', async () => {
      const ana = await registerUser(ctx, 'rel-ana');
      const draft = await as(admin)
        .post('/admin/releases', {
          title: 'Chats en tiempo real',
          version: '1.4',
          body: 'Ya puedes hablar con tus amigos.',
          tags: ['NEW'],
        })
        .expect(201);
      expect(draft.body.publishedAt).toBeNull();
      const before = await as(ana).get('/releases').expect(200);
      expect(
        before.body.data.find((r: { id: string }) => r.id === draft.body.id),
      ).toBeUndefined();

      const pub = await as(admin)
        .post(`/admin/releases/${draft.body.id}/publish`)
        .expect(200);
      expect(pub.body.notified).toBeGreaterThan(0);
      const after = await as(ana).get('/releases').expect(200);
      expect(after.body.data[0]).toMatchObject({
        id: draft.body.id,
        title: 'Chats en tiempo real',
        tags: ['NEW'],
      });
      const n = await as(ana).get('/notifications').expect(200);
      expect(n.body[0]).toMatchObject({
        type: 'RELEASE',
        link: '/novedades',
        title: 'Novedad 1.4: Chats en tiempo real',
      });

      // Retirar y volver a publicar no repite el aviso.
      await as(admin)
        .post(`/admin/releases/${draft.body.id}/unpublish`)
        .expect(200);
      expect(
        (
          await as(admin)
            .post(`/admin/releases/${draft.body.id}/publish`)
            .expect(200)
        ).body.notified,
      ).toBe(0);
    });
  });
});
