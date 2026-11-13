import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AdminService, WS_CLOSE_BANNED } from './admin.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function setup(
  users: Record<string, { role: 'USER' | 'ADMIN' }>,
  extra: Record<string, unknown> = {},
) {
  const actions: any[] = [];
  const updates: any[] = [];
  const prisma: any = {
    user: {
      findUnique: ({ where }: any) =>
        Promise.resolve(
          users[where.id] ? { id: where.id, ...users[where.id] } : null,
        ),
      update: ({ where, data }: any) => {
        updates.push({ id: where.id, data });
        return Promise.resolve({
          id: where.id,
          username: 'u',
          displayName: null,
          avatarAssetId: null,
          isPrivate: false,
          email: 'u@x.com',
          role: users[where.id].role,
          createdAt: new Date(),
          bannedAt: data.bannedAt ?? null,
          bannedUntil: data.bannedUntil ?? null,
          banReason: data.banReason ?? null,
        });
      },
    },
    adminAction: {
      create: ({ data }: any) => (actions.push(data), Promise.resolve(data)),
    },
    ...extra,
  };
  prisma.$transaction = (fn: any) =>
    typeof fn === 'function' ? fn(prisma) : Promise.all(fn);
  const realtime = { disconnect: jest.fn(), emit: jest.fn() };
  const notifications = {
    notify: jest.fn(() => Promise.resolve()),
    notifyEveryone: jest.fn(() => Promise.resolve(3)),
  };
  const service = new AdminService(
    prisma,
    realtime as any,
    notifications as any,
  );
  return { service, actions, updates, realtime, notifications, prisma };
}

describe('AdminService', () => {
  describe('ban', () => {
    it('suspende, apunta la acción y cierra sus WebSockets', async () => {
      const { service, actions, realtime } = setup({
        me: { role: 'ADMIN' },
        bob: { role: 'USER' },
      });
      const before = Date.now();
      const res = await service.ban('me', 'bob', { reason: 'spam', days: 7 });
      expect(res.banned).toBe(true);
      expect(res.bannedUntil!.getTime()).toBeGreaterThanOrEqual(
        before + 7 * 24 * 3600 * 1000,
      );
      expect(actions).toEqual([
        expect.objectContaining({
          adminId: 'me',
          action: 'user.ban',
          targetUserId: 'bob',
        }),
      ]);
      expect(realtime.disconnect).toHaveBeenCalledWith(
        'bob',
        WS_CLOSE_BANNED,
        'banned',
      );
    });

    it('sin días: indefinido', async () => {
      const { service } = setup({
        me: { role: 'ADMIN' },
        bob: { role: 'USER' },
      });
      const res = await service.ban('me', 'bob', { reason: 'acoso' });
      expect(res.bannedUntil).toBeNull();
      expect(res.banned).toBe(true);
    });

    it('no puedes suspenderte a ti ni a otro admin', async () => {
      const { service, updates } = setup({
        me: { role: 'ADMIN' },
        other: { role: 'ADMIN' },
      });
      await expect(
        service.ban('me', 'me', { reason: 'x x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.ban('me', 'other', { reason: 'x x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(updates).toEqual([]);
    });
  });

  describe('deleteMessage', () => {
    it('solo mensajes denunciados', async () => {
      const update = jest.fn();
      const { service } = setup(
        {},
        {
          report: { findFirst: () => Promise.resolve(null) },
          message: { update },
        },
      );
      await expect(service.deleteMessage('me', 'm1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('borra el denunciado y avisa a la conversación', async () => {
      const update = jest.fn(() => Promise.resolve({}));
      const { service, realtime } = setup(
        {},
        {
          report: { findFirst: () => Promise.resolve({ id: 'r1' }) },
          message: {
            findUnique: () =>
              Promise.resolve({
                conversationId: 'c1',
                senderId: 'bob',
                deletedAt: null,
                kind: 'TEXT',
              }),
            update,
          },
          conversationMember: {
            findMany: () =>
              Promise.resolve([{ userId: 'bob' }, { userId: 'ana' }]),
          },
        },
      );
      await service.deleteMessage('me', 'm1');
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm1' } }),
      );
      expect(realtime.emit).toHaveBeenCalledWith(['bob', 'ana'], {
        type: 'message_deleted',
        conversationId: 'c1',
        messageId: 'm1',
      });
    });
  });

  describe('updateIdea: avisos', () => {
    const ideaRow = {
      id: 'i1',
      title: 'Modo oscuro',
      body: 'b',
      category: 'FEATURE',
      status: 'PLANNED',
      adminReply: 'Lo hacemos',
      repliedAt: new Date(),
      pinned: false,
      hidden: false,
      duplicateOfId: null,
      voteCount: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
      author: {
        id: 'ana',
        username: 'ana',
        displayName: null,
        avatarAssetId: null,
        isPrivate: false,
      },
    };

    function ideaSetup() {
      return setup(
        {},
        {
          idea: {
            findUnique: () =>
              Promise.resolve({
                title: 'Modo oscuro',
                status: 'NEW',
                adminReply: null,
                authorId: 'ana',
              }),
            update: () => Promise.resolve(ideaRow),
          },
          ideaVote: {
            findMany: () =>
              Promise.resolve([
                { userId: 'ana' },
                { userId: 'bob' },
                { userId: 'eva' },
              ]),
          },
        },
      );
    }

    it('respuesta → aviso a la autora; cambio de estado → al resto de votantes', async () => {
      const { service, notifications } = ideaSetup();
      await service.updateIdea('me', 'i1', {
        status: 'PLANNED' as any,
        adminReply: 'Lo hacemos',
      });
      expect(notifications.notify).toHaveBeenCalledTimes(2);
      expect(notifications.notify).toHaveBeenNthCalledWith(
        1,
        ['ana'],
        expect.objectContaining({ type: 'IDEA_REPLY', link: '/ideas?idea=i1' }),
      );
      expect(notifications.notify).toHaveBeenNthCalledWith(
        2,
        ['bob', 'eva'],
        expect.objectContaining({
          type: 'IDEA_STATUS',
          title: '«Modo oscuro» ahora está: Planificada',
        }),
      );
    });

    it('solo cambia el estado → avisa a todos los votantes, autora incluida', async () => {
      const { service, notifications } = ideaSetup();
      await service.updateIdea('me', 'i1', { status: 'PLANNED' as any });
      expect(notifications.notify).toHaveBeenCalledTimes(1);
      expect(notifications.notify).toHaveBeenCalledWith(
        ['ana', 'bob', 'eva'],
        expect.objectContaining({ type: 'IDEA_STATUS' }),
      );
    });

    it('fijar o cambiar nada que importe → sin avisos', async () => {
      const { service, notifications } = ideaSetup();
      await service.updateIdea('me', 'i1', { pinned: true });
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('no puede ser duplicada de sí misma', async () => {
      const { service } = ideaSetup();
      await expect(
        service.updateIdea('me', 'i1', { duplicateOfId: 'i1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('publishRelease', () => {
    const rel = (publishedAt: Date | null) => ({
      id: 'r1',
      title: 'Chats',
      version: '1.4',
      body: 'x',
      tags: [],
      publishedAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    it('la primera vez avisa a todo el mundo', async () => {
      const { service, notifications } = setup(
        {},
        {
          release: {
            findUnique: () => Promise.resolve(rel(null)),
            update: () => Promise.resolve(rel(new Date())),
          },
          adminAction: {
            count: () => Promise.resolve(0),
            create: () => Promise.resolve({}),
          },
        },
      );
      const res = await service.publishRelease('me', 'r1');
      expect(res.notified).toBe(3);
      expect(notifications.notifyEveryone).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'RELEASE',
          title: 'Novedad 1.4: Chats',
          link: '/novedades',
        }),
      );
    });

    it('volver a publicar no repite el aviso', async () => {
      const { service, notifications } = setup(
        {},
        {
          release: {
            findUnique: () => Promise.resolve(rel(null)),
            update: () => Promise.resolve(rel(new Date())),
          },
          adminAction: {
            count: () => Promise.resolve(1),
            create: () => Promise.resolve({}),
          },
        },
      );
      expect((await service.publishRelease('me', 'r1')).notified).toBe(0);
      expect(notifications.notifyEveryone).not.toHaveBeenCalled();
    });
  });
});
