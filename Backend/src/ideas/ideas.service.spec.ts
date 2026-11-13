import {
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { IdeasService } from './ideas.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Base de datos de mentira con una idea y sus votos. */
function setup(
  opts: {
    hidden?: boolean;
    authorId?: string;
    status?: string;
    adminReply?: string | null;
    todayCount?: number;
  } = {},
) {
  const votes = new Set<string>(['ana']);
  const idea = {
    id: 'i1',
    title: 'Modo oscuro',
    body: 'Por favor',
    category: 'FEATURE',
    status: opts.status ?? 'NEW',
    adminReply: opts.adminReply ?? null,
    repliedAt: null,
    pinned: false,
    hidden: opts.hidden ?? false,
    duplicateOfId: null,
    voteCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    authorId: opts.authorId ?? 'ana',
    author: {
      id: opts.authorId ?? 'ana',
      username: 'ana',
      displayName: null,
      avatarAssetId: null,
      isPrivate: false,
    },
  };
  const deleted: string[] = [];
  const prisma: any = {
    idea: {
      findUnique: () => Promise.resolve(idea),
      findUniqueOrThrow: () => Promise.resolve({ voteCount: idea.voteCount }),
      update: ({ data }: any) => {
        if (data.voteCount?.increment)
          idea.voteCount += data.voteCount.increment;
        if (data.voteCount?.decrement)
          idea.voteCount -= data.voteCount.decrement;
        return Promise.resolve(idea);
      },
      count: () => Promise.resolve(opts.todayCount ?? 0),
      create: ({ data }: any) =>
        Promise.resolve({ ...idea, ...data, author: idea.author }),
      delete: ({ where }: any) => (deleted.push(where.id), Promise.resolve({})),
    },
    ideaVote: {
      createMany: ({ data }: any) => {
        const has = votes.has(data[0].userId);
        votes.add(data[0].userId);
        return Promise.resolve({ count: has ? 0 : 1 });
      },
      deleteMany: ({ where }: any) =>
        Promise.resolve({ count: votes.delete(where.userId) ? 1 : 0 }),
      findMany: ({ where }: any) =>
        Promise.resolve(votes.has(where.userId) ? [{ ideaId: 'i1' }] : []),
    },
  };
  prisma.$transaction = (fn: any) => fn(prisma);
  return { service: new IdeasService(prisma), idea, votes, deleted };
}

describe('IdeasService', () => {
  describe('vote', () => {
    it('votar suma uno; votar otra vez no suma', async () => {
      const { service } = setup();
      expect(await service.vote('bob', 'i1', true)).toEqual({
        voteCount: 2,
        votedByMe: true,
      });
      expect(await service.vote('bob', 'i1', true)).toEqual({
        voteCount: 2,
        votedByMe: true,
      });
    });

    it('quitar el voto resta uno; si no habías votado no cambia', async () => {
      const { service } = setup();
      expect(await service.vote('ana', 'i1', false)).toEqual({
        voteCount: 0,
        votedByMe: false,
      });
      expect(await service.vote('ana', 'i1', false)).toEqual({
        voteCount: 0,
        votedByMe: false,
      });
    });

    it('una idea oculta no se puede votar (404), salvo su autora', async () => {
      await expect(
        setup({ hidden: true }).service.vote('bob', 'i1', true),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        setup({ hidden: true }).service.vote('ana', 'i1', true),
      ).resolves.toMatchObject({ votedByMe: true });
    });
  });

  describe('get', () => {
    it('marca si es tuya y si la has votado', async () => {
      const { service } = setup();
      expect(await service.get('ana', 'i1')).toMatchObject({
        mine: true,
        votedByMe: true,
        author: { id: 'ana', avatar: null },
      });
      expect(await service.get('bob', 'i1')).toMatchObject({
        mine: false,
        votedByMe: false,
      });
    });
    it('un admin ve las ocultas', async () => {
      await expect(
        setup({ hidden: true }).service.get('bob', 'i1', true),
      ).resolves.toMatchObject({ hidden: true });
    });
  });

  describe('create', () => {
    it('quien propone la vota a la vez', async () => {
      const r = await setup().service.create('bob', {
        title: 'Otra idea',
        body: 'Más detalles aquí',
      });
      expect(r).toMatchObject({ voteCount: 1, votedByMe: true });
    });
    it('máximo 5 al día (429)', async () => {
      const err = await setup({ todayCount: 5 })
        .service.create('bob', {
          title: 'Otra idea',
          body: 'Más detalles aquí',
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(429);
    });
  });

  describe('remove', () => {
    it('la autora puede borrarla mientras está NEW y sin respuesta', async () => {
      const { service, deleted } = setup();
      await service.remove('ana', 'i1');
      expect(deleted).toEqual(['i1']);
    });
    it('otra persona: 404; ya revisada: 403', async () => {
      await expect(setup().service.remove('bob', 'i1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        setup({ status: 'PLANNED' }).service.remove('ana', 'i1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        setup({ adminReply: 'Gracias' }).service.remove('ana', 'i1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
