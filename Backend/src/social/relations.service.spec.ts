import { MessagePolicy } from '@prisma/client';
import { RelationsService } from './relations.service';

/** Base de datos de mentira: seguidores y bloqueos en listas. */
function setup(state: {
  follows?: [string, string, 'PENDING' | 'ACCEPTED'][];
  blocks?: [string, string][];
}) {
  const follows = state.follows ?? [];
  const blocks = state.blocks ?? [];
  const prisma = {
    block: {
      count: ({
        where,
      }: {
        where: { OR: { blockerId: string; blockedId: string }[] };
      }) =>
        Promise.resolve(
          blocks.filter(([a, b]) =>
            where.OR.some((w) => w.blockerId === a && w.blockedId === b),
          ).length,
        ),
    },
    follow: {
      findUnique: ({
        where,
      }: {
        where: {
          followerId_followingId: { followerId: string; followingId: string };
        };
      }) => {
        const k = where.followerId_followingId;
        const f = follows.find(
          ([a, b]) => a === k.followerId && b === k.followingId,
        );
        return Promise.resolve(f ? { status: f[2] } : null);
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new RelationsService(prisma as any);
}

describe('RelationsService', () => {
  describe('canView', () => {
    it('tu propio perfil siempre', async () => {
      expect(await setup({}).canView('a', { id: 'a', isPrivate: true })).toBe(
        true,
      );
    });
    it('una cuenta pública sí; una privada solo si te ha aceptado', async () => {
      expect(await setup({}).canView('a', { id: 'b', isPrivate: false })).toBe(
        true,
      );
      expect(await setup({}).canView('a', { id: 'b', isPrivate: true })).toBe(
        false,
      );
      expect(
        await setup({ follows: [['a', 'b', 'PENDING']] }).canView('a', {
          id: 'b',
          isPrivate: true,
        }),
      ).toBe(false);
      expect(
        await setup({ follows: [['a', 'b', 'ACCEPTED']] }).canView('a', {
          id: 'b',
          isPrivate: true,
        }),
      ).toBe(true);
    });
    it('con un bloqueo en cualquier dirección, no', async () => {
      expect(
        await setup({ blocks: [['b', 'a']] }).canView('a', {
          id: 'b',
          isPrivate: false,
        }),
      ).toBe(false);
      expect(
        await setup({ blocks: [['a', 'b']] }).canView('a', {
          id: 'b',
          isPrivate: false,
        }),
      ).toBe(false);
    });
  });

  describe('canMessage (depende del ajuste de quien recibe)', () => {
    const b = (messagePolicy: MessagePolicy) => ({ id: 'b', messagePolicy });
    it('EVERYONE: cualquiera, salvo bloqueo', async () => {
      expect(await setup({}).canMessage('a', b(MessagePolicy.EVERYONE))).toBe(
        true,
      );
      expect(
        await setup({ blocks: [['b', 'a']] }).canMessage(
          'a',
          b(MessagePolicy.EVERYONE),
        ),
      ).toBe(false);
    });
    it('FOLLOWING: solo si quien recibe te sigue (aceptado)', async () => {
      expect(await setup({}).canMessage('a', b(MessagePolicy.FOLLOWING))).toBe(
        false,
      );
      // Que TÚ le sigas no basta.
      expect(
        await setup({ follows: [['a', 'b', 'ACCEPTED']] }).canMessage(
          'a',
          b(MessagePolicy.FOLLOWING),
        ),
      ).toBe(false);
      expect(
        await setup({ follows: [['b', 'a', 'PENDING']] }).canMessage(
          'a',
          b(MessagePolicy.FOLLOWING),
        ),
      ).toBe(false);
      expect(
        await setup({ follows: [['b', 'a', 'ACCEPTED']] }).canMessage(
          'a',
          b(MessagePolicy.FOLLOWING),
        ),
      ).toBe(true);
    });
    it('NOBODY: nadie', async () => {
      expect(
        await setup({ follows: [['b', 'a', 'ACCEPTED']] }).canMessage(
          'a',
          b(MessagePolicy.NOBODY),
        ),
      ).toBe(false);
    });
    it('a uno mismo, no', async () => {
      expect(await setup({}).canMessage('b', b(MessagePolicy.EVERYONE))).toBe(
        false,
      );
    });
  });
});
