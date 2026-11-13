import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { OAuthService } from './oauth.service';
import type { VerifiedIdentity } from './providers';

/** Base de datos en memoria con lo justo que usa el login con Google/Apple. */
function fakeDb() {
  const users: {
    id: string;
    email: string;
    passwordHash: string | null;
    emailVerifiedAt: Date | null;
  }[] = [];
  const accounts: {
    id: string;
    userId: string;
    provider: string;
    providerAccountId: string;
    email: string | null;
  }[] = [];
  let n = 0;
  const db = {
    users,
    accounts,
    authAccount: {
      findUnique: async ({
        where,
      }: {
        where: Record<string, Record<string, string>>;
      }) => {
        if (where.provider_providerAccountId) {
          const w = where.provider_providerAccountId;
          return (
            accounts.find(
              (a) =>
                a.provider === w.provider &&
                a.providerAccountId === w.providerAccountId,
            ) ?? null
          );
        }
        const w = where.userId_provider;
        return (
          accounts.find(
            (a) => a.userId === w.userId && a.provider === w.provider,
          ) ?? null
        );
      },
      create: async ({
        data,
      }: {
        data: {
          userId: string;
          provider: string;
          providerAccountId: string;
          email: string | null;
        };
      }) => {
        const a = { id: `a${++n}`, ...data };
        accounts.push(a);
        return a;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { email: string };
      }) => {
        const a = accounts.find((x) => x.id === where.id)!;
        Object.assign(a, data);
        return a;
      },
    },
    user: {
      findUnique: async ({
        where,
      }: {
        where: { email?: string; id?: string };
      }) =>
        users.find((u) =>
          where.email ? u.email === where.email : u.id === where.id,
        ) ?? null,
      create: async ({
        data,
      }: {
        data: {
          email: string;
          passwordHash: null;
          emailVerifiedAt: Date;
          authAccounts: {
            create: {
              provider: string;
              providerAccountId: string;
              email: string;
            };
          };
        };
      }) => {
        const u = {
          id: `u${++n}`,
          email: data.email,
          passwordHash: data.passwordHash,
          emailVerifiedAt: data.emailVerifiedAt,
        };
        users.push(u);
        accounts.push({
          id: `a${++n}`,
          userId: u.id,
          ...data.authAccounts.create,
        });
        return u;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const u = users.find((x) => x.id === where.id)!;
        Object.assign(u, data);
        return u;
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  return db;
}

function service(db: ReturnType<typeof fakeDb>) {
  const config = {
    google: null,
    apple: null,
    instagram: null,
    redirectUri: () => '',
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new OAuthService(db as any, config as any, {} as any, {} as any);
}

const google = (over: Partial<VerifiedIdentity> = {}): VerifiedIdentity => ({
  provider: 'GOOGLE',
  sub: 'g-1',
  email: 'ana@example.com',
  emailVerified: true,
  name: 'Ana',
  picture: null,
  ...over,
});

describe('OAuthService.resolveLogin', () => {
  it('crea la cuenta (sin contraseña y con el email verificado) la primera vez', async () => {
    const db = fakeDb();
    const r = await service(db).resolveLogin(google());
    expect(r).toMatchObject({ created: true, passwordRemoved: false });
    expect(db.users[0]).toMatchObject({
      email: 'ana@example.com',
      passwordHash: null,
    });
    expect(db.users[0].emailVerifiedAt).toBeInstanceOf(Date);
    expect(db.accounts[0]).toMatchObject({
      provider: 'GOOGLE',
      providerAccountId: 'g-1',
    });
  });

  it('la segunda vez entra en la misma cuenta (por el sub, no por el email)', async () => {
    const db = fakeDb();
    const s = service(db);
    const first = await s.resolveLogin(google());
    // Aunque cambie el email en Google, es la misma persona.
    const again = await s.resolveLogin(google({ email: 'nuevo@example.com' }));
    expect(again).toEqual({
      userId: first.userId,
      created: false,
      passwordRemoved: false,
    });
    expect(db.users).toHaveLength(1);
  });

  it('con un usuario existente y el email verificado, conecta la cuenta', async () => {
    const db = fakeDb();
    db.users.push({
      id: 'u-old',
      email: 'ana@example.com',
      passwordHash: 'hash',
      emailVerifiedAt: new Date(),
    });
    const r = await service(db).resolveLogin(google());
    expect(r).toEqual({
      userId: 'u-old',
      created: false,
      passwordRemoved: false,
    });
    expect(db.users[0].passwordHash).toBe('hash');
  });

  it('protección "pre-account takeover": quita la contraseña si el email nunca se verificó', async () => {
    const db = fakeDb();
    // Alguien registró la cuenta con contraseña y el email de Ana, sin verificarlo.
    db.users.push({
      id: 'u-old',
      email: 'ana@example.com',
      passwordHash: 'hash-del-atacante',
      emailVerifiedAt: null,
    });
    const r = await service(db).resolveLogin(google());
    expect(r).toEqual({
      userId: 'u-old',
      created: false,
      passwordRemoved: true,
    });
    expect(db.users[0].passwordHash).toBeNull();
    expect(db.users[0].emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('NO conecta por email si el proveedor no lo ha verificado', async () => {
    const db = fakeDb();
    db.users.push({
      id: 'u-old',
      email: 'ana@example.com',
      passwordHash: 'hash',
      emailVerifiedAt: null,
    });
    await expect(
      service(db).resolveLogin(google({ emailVerified: false })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.accounts).toHaveLength(0);
  });

  it('sin email no se puede crear la cuenta', async () => {
    const db = fakeDb();
    await expect(
      service(db).resolveLogin(google({ email: null })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('si tu cuenta ya tiene OTRA cuenta de Google conectada, no la mezcla', async () => {
    const db = fakeDb();
    db.users.push({
      id: 'u-old',
      email: 'ana@example.com',
      passwordHash: 'hash',
      emailVerifiedAt: new Date(),
    });
    db.accounts.push({
      id: 'a0',
      userId: 'u-old',
      provider: 'GOOGLE',
      providerAccountId: 'g-otra',
      email: 'ana@example.com',
    });
    await expect(service(db).resolveLogin(google())).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('OAuthService.exchangeForUser', () => {
  it('no conecta una cuenta si el flujo lo empezó otro usuario', async () => {
    const flow = {
      id: 'f1',
      intent: 'LINK',
      userId: 'atacante',
      provider: 'GOOGLE',
      outcome: google(),
      expiresAt: new Date(Date.now() + 60_000),
    };
    const db = { oAuthFlow: { delete: async () => flow } };
    const config = {
      google: null,
      apple: null,
      instagram: null,
      redirectUri: () => '',
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new OAuthService(db as any, config as any, {} as any, {} as any);
    await expect(
      s.exchangeForUser('victima', 'r'.repeat(40)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un resultado caducado no vale', async () => {
    const flow = {
      id: 'f1',
      intent: 'LOGIN',
      userId: null,
      provider: 'GOOGLE',
      outcome: google(),
      expiresAt: new Date(Date.now() - 1),
    };
    const db = { oAuthFlow: { delete: async () => flow } };
    const config = {
      google: null,
      apple: null,
      instagram: null,
      redirectUri: () => '',
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = new OAuthService(db as any, config as any, {} as any, {} as any);
    await expect(s.exchangeLogin('r'.repeat(40))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
