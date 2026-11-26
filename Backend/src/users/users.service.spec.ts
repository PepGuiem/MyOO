import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

/** Pruebas del borrado de cuenta con dobles de Prisma, contraseñas, almacenamiento y OAuth. */
function setup(
  opts: {
    exists?: boolean;
    valid?: boolean;
    keys?: string[];
    failKey?: string;
    noPassword?: boolean;
    proofOk?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const prisma = {
    user: {
      findUnique: async () =>
        opts.exists === false
          ? null
          : {
              passwordHash: opts.noPassword ? null : 'hash',
              assets: (opts.keys ?? []).map((storageKey) => ({ storageKey })),
            },
      delete: async ({ where }: { where: { id: string } }) => {
        calls.push(`db:${where.id}`);
        return {};
      },
    },
  };
  const passwords = {
    verify: async (_h: string, p: string) => opts.valid ?? p === 'Password123',
  };
  const storage = {
    delete: async (key: string) => {
      calls.push(`file:${key}`);
      if (key === opts.failKey) throw new Error('disco');
    },
  };
  const oauth = {
    consumeReauthProof: async (_u: string, token: string) => {
      calls.push(`proof:${token}`);
      return opts.proofOk ?? false;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new UsersService(
    prisma as any,
    passwords as any,
    storage as any,
    {} as any,
    oauth as any,
    { cancelForDeletedUser: async () => undefined } as any,
  );
  return { service, calls };
}

describe('UsersService.deleteAccount', () => {
  it('borra el usuario y después sus archivos', async () => {
    const { service, calls } = setup({ keys: ['assets/a', 'assets/b'] });
    await service.deleteAccount('u1', { password: 'Password123' });
    expect(calls).toEqual(['db:u1', 'file:assets/a', 'file:assets/b']);
  });

  it('con la contraseña incorrecta lanza 403 y no borra nada', async () => {
    const { service, calls } = setup({ keys: ['assets/a'] });
    await expect(
      service.deleteAccount('u1', { password: 'mala' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(calls).toEqual([]);
  });

  it('con contraseña, una prueba de Google/Apple NO basta', async () => {
    const { service, calls } = setup({ proofOk: true });
    await expect(
      service.deleteAccount('u1', { reauthToken: 'x'.repeat(30) }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(calls).toEqual([]);
  });

  it('si el usuario no existe lanza 404', async () => {
    const { service } = setup({ exists: false });
    await expect(
      service.deleteAccount('u1', { password: 'Password123' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un archivo que no se puede borrar no impide el borrado de la cuenta', async () => {
    const { service, calls } = setup({
      keys: ['assets/a', 'assets/b'],
      failKey: 'assets/a',
    });
    await service.deleteAccount('u1', { password: 'Password123' });
    expect(calls).toEqual(['db:u1', 'file:assets/a', 'file:assets/b']);
  });

  describe('cuenta sin contraseña (Google/Apple)', () => {
    it('se borra con una prueba de identidad válida', async () => {
      const proof = 'p'.repeat(30);
      const { service, calls } = setup({ noPassword: true, proofOk: true });
      await service.deleteAccount('u1', { reauthToken: proof });
      expect(calls).toEqual([`proof:${proof}`, 'db:u1']);
    });

    it('sin prueba, o con una prueba no válida, lanza 403 y no borra nada', async () => {
      const { service, calls } = setup({ noPassword: true, proofOk: false });
      await expect(service.deleteAccount('u1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.deleteAccount('u1', { reauthToken: 'q'.repeat(30) }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(calls).toEqual([`proof:${'q'.repeat(30)}`]);
    });
  });
});
