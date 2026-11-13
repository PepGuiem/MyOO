import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { bearer, createTestApp, registerUser, TestContext } from './utils';

type U = { token: string; userId: string; email: string };

describe('Seguidores, privacidad y chats (e2e)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  async function user(
    prefix: string,
    profile: Record<string, unknown> = {},
  ): Promise<U> {
    const u = await registerUser(ctx, prefix);
    const username = `${prefix.replace(/[^a-z0-9]/g, '')}${Math.floor(Math.random() * 1e6)}`;
    await ctx
      .http()
      .patch('/api/users/me')
      .set(...bearer(u.token))
      .send({ username, ...profile })
      .expect(200);
    return u;
  }

  const follow = (a: U, b: U) =>
    ctx
      .http()
      .post(`/api/people/${b.userId}/follow`)
      .set(...bearer(a.token));

  describe('seguir y privacidad', () => {
    it('cuenta pública: seguir es inmediato', async () => {
      const a = await user('pub-a');
      const b = await user('pub-b');
      const res = await follow(a, b).expect(200);
      expect(res.body).toEqual({ status: 'accepted' });
      const p = await ctx
        .http()
        .get(`/api/people/${b.userId}`)
        .set(...bearer(a.token))
        .expect(200);
      expect(p.body).toMatchObject({
        canView: true,
        counts: { followers: 1 },
        relationship: { following: 'accepted' },
      });
    });

    it('cuenta privada: solicitud, no se ve el contenido hasta aceptarla', async () => {
      const a = await user('priv-a');
      const b = await user('priv-b', { isPrivate: true, location: 'Madrid' });
      expect((await follow(a, b).expect(200)).body).toEqual({
        status: 'pending',
      });

      const before = await ctx
        .http()
        .get(`/api/people/${b.userId}`)
        .set(...bearer(a.token))
        .expect(200);
      expect(before.body).toMatchObject({
        canView: false,
        location: null,
        relationship: { following: 'pending' },
      });
      await ctx
        .http()
        .get(`/api/people/${b.userId}/outfits`)
        .set(...bearer(a.token))
        .expect(403);
      await ctx
        .http()
        .get(`/api/people/${b.userId}/followers`)
        .set(...bearer(a.token))
        .expect(403);

      const reqs = await ctx
        .http()
        .get('/api/follow-requests')
        .set(...bearer(b.token))
        .expect(200);
      expect(reqs.body.map((r: { id: string }) => r.id)).toEqual([a.userId]);
      await ctx
        .http()
        .post(`/api/follow-requests/${a.userId}/accept`)
        .set(...bearer(b.token))
        .expect(204);

      const after = await ctx
        .http()
        .get(`/api/people/${b.userId}`)
        .set(...bearer(a.token))
        .expect(200);
      expect(after.body).toMatchObject({ canView: true, location: 'Madrid' });
    });

    it('al pasar a pública, las solicitudes pendientes quedan aceptadas', async () => {
      const a = await user('flip-a');
      const b = await user('flip-b', { isPrivate: true });
      await follow(a, b).expect(200);
      await ctx
        .http()
        .patch('/api/users/me')
        .set(...bearer(b.token))
        .send({ isPrivate: false })
        .expect(200);
      const p = await ctx
        .http()
        .get(`/api/people/${b.userId}`)
        .set(...bearer(a.token))
        .expect(200);
      expect(p.body.relationship.following).toBe('accepted');
    });

    it('outfits compartidos: solo los marcados', async () => {
      const a = await user('share-a');
      const b = await user('share-b');
      const types = await ctx
        .http()
        .get('/api/garment-types')
        .set(...bearer(b.token))
        .expect(200);
      const wardrobe = await ctx
        .http()
        .post('/api/wardrobes')
        .set(...bearer(b.token))
        .send({ name: 'Mío' })
        .expect(201);
      const item = await ctx
        .http()
        .post('/api/wardrobe-items')
        .set(...bearer(b.token))
        .send({
          wardrobeId: wardrobe.body.id,
          garmentTypeId: types.body[0].id,
          name: 'Prenda',
          color: '#222222',
        })
        .expect(201);
      const items = [{ wardrobeItemId: item.body.id }];
      await ctx
        .http()
        .post('/api/outfits')
        .set(...bearer(b.token))
        .send({ name: 'Privado', items })
        .expect(201);
      await ctx
        .http()
        .post('/api/outfits')
        .set(...bearer(b.token))
        .send({ name: 'Compartido', items, isShared: true })
        .expect(201);
      const res = await ctx
        .http()
        .get(`/api/people/${b.userId}/outfits`)
        .set(...bearer(a.token))
        .expect(200);
      expect(res.body.data.map((o: { name: string }) => o.name)).toEqual([
        'Compartido',
      ]);
      // Sin datos de compra ni modelos externos.
      expect(JSON.stringify(res.body)).not.toMatch(/purchase|modelUrl|price/);
    });

    it('bloquear: deja de seguirse y el bloqueado no ve el perfil (404)', async () => {
      const a = await user('blk-a');
      const b = await user('blk-b');
      await follow(a, b).expect(200);
      await ctx
        .http()
        .post(`/api/people/${a.userId}/block`)
        .set(...bearer(b.token))
        .expect(204);
      await ctx
        .http()
        .get(`/api/people/${b.userId}`)
        .set(...bearer(a.token))
        .expect(404);
      await follow(a, b).expect(404);
      const search = await ctx
        .http()
        .get('/api/people/search')
        .query({ q: 'blk' })
        .set(...bearer(a.token))
        .expect(200);
      expect(search.body.map((x: { id: string }) => x.id)).not.toContain(
        b.userId,
      );
    });
  });

  describe('chats', () => {
    it('por defecto solo te escribe quien sigues', async () => {
      const a = await user('msg-a');
      const b = await user('msg-b');
      const denied = await ctx
        .http()
        .post('/api/conversations/direct')
        .set(...bearer(a.token))
        .send({ userId: b.userId })
        .expect(403);
      expect(denied.body.code).toBe('cannot_message');
      await follow(b, a).expect(200); // B sigue a A: A ya puede escribir a B
      const conv = await ctx
        .http()
        .post('/api/conversations/direct')
        .set(...bearer(a.token))
        .send({ userId: b.userId })
        .expect(200);
      // La misma conversación si se vuelve a abrir (también desde el otro lado).
      const again = await ctx
        .http()
        .post('/api/conversations/direct')
        .set(...bearer(b.token))
        .send({ userId: a.userId })
        .expect(200);
      expect(again.body.id).toBe(conv.body.id);
    });

    it('enviar, no leídos, leer y contestar', async () => {
      const a = await user('chat-a');
      const b = await user('chat-b', { messagePolicy: 'EVERYONE' });
      const conv = await ctx
        .http()
        .post('/api/conversations/direct')
        .set(...bearer(a.token))
        .send({ userId: b.userId })
        .expect(200);
      const id = conv.body.id as string;
      await ctx
        .http()
        .post(`/api/conversations/${id}/messages`)
        .set(...bearer(a.token))
        .send({ body: 'hola' })
        .expect(201);

      expect(
        (
          await ctx
            .http()
            .get('/api/conversations/unread')
            .set(...bearer(b.token))
            .expect(200)
        ).body,
      ).toEqual({ unread: 1 });
      const msgs = await ctx
        .http()
        .get(`/api/conversations/${id}/messages`)
        .set(...bearer(b.token))
        .expect(200);
      expect(msgs.body.map((m: { body: string }) => m.body)).toEqual(['hola']);
      await ctx
        .http()
        .post(`/api/conversations/${id}/read`)
        .set(...bearer(b.token))
        .expect(200);
      expect(
        (
          await ctx
            .http()
            .get('/api/conversations/unread')
            .set(...bearer(b.token))
            .expect(200)
        ).body,
      ).toEqual({ unread: 0 });

      // A tiene "solo quien sigo" y no sigue a B, pero B puede contestar porque A le escribió.
      await ctx
        .http()
        .post(`/api/conversations/${id}/messages`)
        .set(...bearer(b.token))
        .send({ body: 'buenas' })
        .expect(201);
    });

    it('nadie de fuera lee una conversación (404)', async () => {
      const a = await user('priv-chat-a');
      const b = await user('priv-chat-b', { messagePolicy: 'EVERYONE' });
      const c = await user('priv-chat-c');
      const conv = await ctx
        .http()
        .post('/api/conversations/direct')
        .set(...bearer(a.token))
        .send({ userId: b.userId })
        .expect(200);
      await ctx
        .http()
        .get(`/api/conversations/${conv.body.id}/messages`)
        .set(...bearer(c.token))
        .expect(404);
      await ctx
        .http()
        .post(`/api/conversations/${conv.body.id}/messages`)
        .set(...bearer(c.token))
        .send({ body: 'x' })
        .expect(404);
    });

    it('con un bloqueo no se puede escribir', async () => {
      const a = await user('bchat-a');
      const b = await user('bchat-b', { messagePolicy: 'EVERYONE' });
      const conv = await ctx
        .http()
        .post('/api/conversations/direct')
        .set(...bearer(a.token))
        .send({ userId: b.userId })
        .expect(200);
      await ctx
        .http()
        .post(`/api/people/${a.userId}/block`)
        .set(...bearer(b.token))
        .expect(204);
      await ctx
        .http()
        .post(`/api/conversations/${conv.body.id}/messages`)
        .set(...bearer(a.token))
        .send({ body: 'hola' })
        .expect(403);
    });

    it('grupos: crear, solo quien acepta mensajes, salir y pasar la propiedad', async () => {
      const a = await user('grp-a');
      const b = await user('grp-b', { messagePolicy: 'EVERYONE' });
      const c = await user('grp-c', { messagePolicy: 'NOBODY' });
      const refused = await ctx
        .http()
        .post('/api/conversations/groups')
        .set(...bearer(a.token))
        .send({ title: 'Looks', memberIds: [b.userId, c.userId] })
        .expect(403);
      expect(refused.body.code).toBe('cannot_add');

      const g = await ctx
        .http()
        .post('/api/conversations/groups')
        .set(...bearer(a.token))
        .send({ title: 'Looks', memberIds: [b.userId] })
        .expect(201);
      expect(
        g.body.members.find((m: { id: string }) => m.id === a.userId).role,
      ).toBe('OWNER');
      await ctx
        .http()
        .patch(`/api/conversations/${g.body.id}`)
        .set(...bearer(b.token))
        .send({ title: 'Mío' })
        .expect(403);
      await ctx
        .http()
        .delete(`/api/conversations/${g.body.id}/members/${a.userId}`)
        .set(...bearer(a.token))
        .expect(204);
      const after = await ctx
        .http()
        .get(`/api/conversations/${g.body.id}`)
        .set(...bearer(b.token))
        .expect(200);
      expect(after.body.members).toEqual([
        expect.objectContaining({ id: b.userId, role: 'OWNER' }),
      ]);
    });

    it('enviar un outfit: solo los tuyos', async () => {
      const a = await user('of-a');
      const b = await user('of-b', { messagePolicy: 'EVERYONE' });
      const conv = await ctx
        .http()
        .post('/api/conversations/direct')
        .set(...bearer(a.token))
        .send({ userId: b.userId })
        .expect(200);
      await ctx
        .http()
        .post(`/api/conversations/${conv.body.id}/messages`)
        .set(...bearer(a.token))
        .send({ outfitId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);
    });
  });

  describe('tiempo real', () => {
    it('el mensaje llega por el WebSocket al otro', async () => {
      const a = await user('ws-a');
      const b = await user('ws-b', { messagePolicy: 'EVERYONE' });
      const { body: t } = await ctx
        .http()
        .post('/api/realtime/ticket')
        .set(...bearer(b.token))
        .expect(200);
      const port = (
        (ctx.app.getHttpServer() as unknown as Server).address() as AddressInfo
      ).port;
      const ws = new WebSocket(
        `ws://127.0.0.1:${port}/api/ws?ticket=${t.ticket}`,
      );
      const events: { type: string; message?: { body: string } }[] = [];
      await new Promise<void>((resolve) => {
        ws.on('message', (d: Buffer) => {
          events.push(JSON.parse(d.toString()) as { type: string });
          if (events[0]?.type === 'ready') resolve();
        });
      });
      const conv = await ctx
        .http()
        .post('/api/conversations/direct')
        .set(...bearer(a.token))
        .send({ userId: b.userId })
        .expect(200);
      await ctx
        .http()
        .post(`/api/conversations/${conv.body.id}/messages`)
        .set(...bearer(a.token))
        .send({ body: 'en directo' })
        .expect(201);
      await new Promise((r) => setTimeout(r, 200));
      expect(events.find((e) => e.type === 'message')?.message?.body).toBe(
        'en directo',
      );
      ws.close();
    });
  });
});
