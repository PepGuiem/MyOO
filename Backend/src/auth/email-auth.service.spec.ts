import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { EmailTokenPurpose } from '@prisma/client';
import { hashToken } from '../mail/email-tokens';
import { EmailAuthService, FORGOT_PASSWORD_RESPONSE } from './email-auth.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface FakeUser {
  id: string;
  email: string;
  locale: 'ES' | 'EN';
  passwordHash: string | null;
  emailVerifiedAt: Date | null;
  sessionVersion: number;
  providers: ('GOOGLE' | 'APPLE')[];
}

interface FakeToken {
  id: string;
  userId: string;
  purpose: EmailTokenPurpose;
  tokenHash: string;
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

/** Base de datos en memoria con lo justo que usa EmailAuthService. */
function setup(opts: { mailEnabled?: boolean; users?: Partial<FakeUser>[] } = {}) {
  const users: FakeUser[] = (opts.users ?? []).map((u, i) => ({
    id: `u${i + 1}`,
    email: `user${i + 1}@example.com`,
    locale: 'ES',
    passwordHash: 'old-hash',
    emailVerifiedAt: null,
    sessionVersion: 0,
    providers: [],
    ...u,
  }));
  const tokens: FakeToken[] = [];
  const sent: { to: string; subject: string; text: string }[] = [];
  const clock = { now: new Date('2026-11-27T10:00:00Z') };
  let seq = 0;

  const matches = (t: FakeToken, where: any) =>
    (where.id === undefined || t.id === where.id) &&
    (where.userId === undefined || t.userId === where.userId) &&
    (where.purpose === undefined || t.purpose === where.purpose) &&
    (where.usedAt !== null || t.usedAt === null) &&
    (where.createdAt?.gt === undefined || t.createdAt > where.createdAt.gt) &&
    (where.expiresAt?.lt === undefined || t.expiresAt < where.expiresAt.lt);

  const db: any = {
    user: {
      findUnique: async ({ where }: any) => {
        const u = users.find((x) => (where.id ? x.id === where.id : x.email === where.email));
        if (!u) return null;
        return {
          ...u,
          authAccounts: u.providers.map((provider) => ({ provider })),
        };
      },
      update: async ({ where, data }: any) => {
        const u = users.find((x) => x.id === where.id)!;
        if (data.passwordHash) u.passwordHash = data.passwordHash;
        if (data.sessionVersion?.increment) u.sessionVersion += data.sessionVersion.increment;
        if (data.emailVerifiedAt) u.emailVerifiedAt = data.emailVerifiedAt;
        return u;
      },
    },
    emailToken: {
      findFirst: async ({ where }: any) => tokens.find((t) => matches(t, where)) ?? null,
      create: async ({ data }: any) => {
        const t: FakeToken = { id: `t${++seq}`, usedAt: null, createdAt: clock.now, ...data };
        tokens.push(t);
        return t;
      },
      deleteMany: async ({ where }: any) => {
        const keep = tokens.filter((t) => !matches(t, where));
        const count = tokens.length - keep.length;
        tokens.splice(0, tokens.length, ...keep);
        return { count };
      },
      findUnique: async ({ where }: any) => {
        const t = tokens.find((x) => x.tokenHash === where.tokenHash);
        if (!t) return null;
        const u = users.find((x) => x.id === t.userId)!;
        return { ...t, user: { email: u.email, emailVerifiedAt: u.emailVerifiedAt } };
      },
      updateMany: async ({ where, data }: any) => {
        const hit = tokens.filter((t) => matches(t, where));
        for (const t of hit) t.usedAt = data.usedAt;
        return { count: hit.length };
      },
    },
    $transaction: async (fn: (tx: any) => Promise<unknown>) => fn(db),
  };
  const mail = {
    enabled: opts.mailEnabled ?? true,
    frontendUrl: 'https://myout.vercel.app',
    send: async (m: any) => {
      sent.push(m);
      return true;
    },
  };
  const passwords = { hash: async (p: string) => `argon2(${p})` };
  const service = new EmailAuthService(db, mail as any, passwords as any);
  service.minForgotMs = 0;
  /** Saca el token del enlace del último correo. */
  const lastLinkToken = () => {
    const m = /token=([A-Za-z0-9_-]+)/.exec(sent[sent.length - 1]?.text ?? '');
    return m ? decodeURIComponent(m[1]) : null;
  };
  return { service, users, tokens, sent, clock, lastLinkToken };
}

describe('EmailAuthService · contraseña olvidada', () => {
  it('la respuesta es idéntica exista la cuenta o no (y sin contraseña)', async () => {
    const { service, sent, clock } = setup({
      users: [{ email: 'ana@example.com' }, { email: 'g@example.com', passwordHash: null, providers: ['GOOGLE'] }],
    });
    const existing = await service.forgotPassword('ana@example.com', clock.now);
    const missing = await service.forgotPassword('nadie@example.com', clock.now);
    const oauthOnly = await service.forgotPassword('g@example.com', clock.now);
    expect(existing).toEqual(FORGOT_PASSWORD_RESPONSE);
    expect(missing).toEqual(existing);
    expect(oauthOnly).toEqual(existing);
    // Solo se escribe a las cuentas que existen.
    expect(sent.map((m) => m.to)).toEqual(['ana@example.com', 'g@example.com']);
  });

  it('aunque falle la base de datos la respuesta no cambia', async () => {
    const { service, clock } = setup({ users: [{ email: 'ana@example.com' }] });
    (service as any).prisma.user.findUnique = async () => {
      throw new Error('db down');
    };
    await expect(service.forgotPassword('ana@example.com', clock.now)).resolves.toEqual(FORGOT_PASSWORD_RESPONSE);
  });

  it('tarda al menos minForgotMs, haya cuenta o no', async () => {
    const { service, clock } = setup();
    service.minForgotMs = 40;
    const start = Date.now();
    await service.forgotPassword('nadie@example.com', clock.now);
    expect(Date.now() - start).toBeGreaterThanOrEqual(35);
  });

  it('sin correo configurado: 503 para todos', async () => {
    const { service } = setup({ mailEnabled: false, users: [{ email: 'ana@example.com' }] });
    await expect(service.forgotPassword('ana@example.com')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.forgotPassword('nadie@example.com')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('guarda solo el hash del token; el enlace lleva el token', async () => {
    const { service, tokens, clock, lastLinkToken } = setup({ users: [{ email: 'ana@example.com' }] });
    await service.forgotPassword('ana@example.com', clock.now);
    const token = lastLinkToken()!;
    expect(token).toBeTruthy();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(tokens)).not.toContain(token);
    expect(tokens[0].expiresAt.getTime() - clock.now.getTime()).toBe(60 * 60 * 1000);
  });

  it('cuenta solo con Google/Apple: correo explicando cómo entrar, sin enlace', async () => {
    const { service, sent, clock, lastLinkToken } = setup({
      users: [{ email: 'g@example.com', passwordHash: null, providers: ['APPLE'] }],
    });
    await service.forgotPassword('g@example.com', clock.now);
    expect(sent[0].text).toContain('Apple');
    expect(lastLinkToken()).toBeNull();
  });

  it('como mucho un correo por minuto a la misma cuenta', async () => {
    const { service, sent, clock } = setup({ users: [{ email: 'ana@example.com' }] });
    await service.forgotPassword('ana@example.com', clock.now);
    await service.forgotPassword('ana@example.com', new Date(clock.now.getTime() + 30_000));
    expect(sent).toHaveLength(1);
    clock.now = new Date(clock.now.getTime() + 61_000);
    await service.forgotPassword('ana@example.com', clock.now);
    expect(sent).toHaveLength(2);
  });
});

describe('EmailAuthService · nueva contraseña', () => {
  async function withToken() {
    const ctx = setup({ users: [{ email: 'ana@example.com' }] });
    await ctx.service.forgotPassword('ana@example.com', ctx.clock.now);
    return { ...ctx, token: ctx.lastLinkToken()! };
  }

  it('cambia la contraseña (hash), cierra las sesiones y verifica el email', async () => {
    const { service, users, token, clock } = await withToken();
    await service.resetPassword(token, 'Nueva1234', new Date(clock.now.getTime() + 1000));
    expect(users[0].passwordHash).toBe('argon2(Nueva1234)');
    expect(users[0].sessionVersion).toBe(1);
    expect(users[0].emailVerifiedAt).toBeInstanceOf(Date);
  });

  it('un solo uso', async () => {
    const { service, token, clock } = await withToken();
    await service.resetPassword(token, 'Nueva1234', clock.now);
    await expect(service.resetPassword(token, 'Otra12345', clock.now)).rejects.toMatchObject({
      response: { code: 'token_used' },
    });
  });

  it('caduca a la hora', async () => {
    const { service, users, token, clock } = await withToken();
    const later = new Date(clock.now.getTime() + 60 * 60 * 1000 + 1);
    await expect(service.resetPassword(token, 'Nueva1234', later)).rejects.toMatchObject({
      response: { code: 'token_expired' },
    });
    expect(users[0].passwordHash).toBe('old-hash');
  });

  it('un token inventado o de verificar email no sirve', async () => {
    const { service, clock } = await withToken();
    await expect(service.resetPassword('x'.repeat(43), 'Nueva1234', clock.now)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resetPassword('corto', 'Nueva1234', clock.now)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('usar un enlace anula los demás enlaces de contraseña pendientes', async () => {
    const ctx = setup({ users: [{ email: 'ana@example.com' }] });
    await ctx.service.forgotPassword('ana@example.com', ctx.clock.now);
    const first = ctx.lastLinkToken()!;
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 61_000);
    await ctx.service.forgotPassword('ana@example.com', ctx.clock.now);
    const second = ctx.lastLinkToken()!;
    await ctx.service.resetPassword(second, 'Nueva1234', ctx.clock.now);
    await expect(ctx.service.resetPassword(first, 'Otra12345', ctx.clock.now)).rejects.toMatchObject({
      response: { code: 'token_used' },
    });
  });
});

describe('EmailAuthService · verificar email', () => {
  it('manda el enlace (24 h), lo confirma una vez y no reenvía si ya está verificado', async () => {
    const { service, users, tokens, clock, lastLinkToken } = setup({ users: [{ email: 'ana@example.com' }] });
    expect(await service.sendVerification('u1', clock.now)).toBe('sent');
    const token = lastLinkToken()!;
    expect(tokens[0].purpose).toBe(EmailTokenPurpose.VERIFY_EMAIL);
    expect(tokens[0].expiresAt.getTime() - clock.now.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(await service.verifyEmail(token, clock.now)).toEqual({ verified: true });
    expect(users[0].emailVerifiedAt).toBeInstanceOf(Date);
    // Abrir otra vez el mismo enlace no da error (ya está verificado).
    expect(await service.verifyEmail(token, clock.now)).toEqual({ verified: true });
    expect(await service.sendVerification('u1', clock.now)).toBe('already_verified');
  });

  it('caducado a las 24 h', async () => {
    const { service, users, clock, lastLinkToken } = setup({ users: [{ email: 'ana@example.com' }] });
    await service.sendVerification('u1', clock.now);
    const later = new Date(clock.now.getTime() + 24 * 60 * 60 * 1000);
    await expect(service.verifyEmail(lastLinkToken()!, later)).rejects.toMatchObject({
      response: { code: 'token_expired' },
    });
    expect(users[0].emailVerifiedAt).toBeNull();
  });

  it('un enlace de contraseña no verifica el email', async () => {
    const { service, users, clock, lastLinkToken } = setup({ users: [{ email: 'ana@example.com' }] });
    await service.forgotPassword('ana@example.com', clock.now);
    await expect(service.verifyEmail(lastLinkToken()!, clock.now)).rejects.toBeInstanceOf(BadRequestException);
    expect(users[0].emailVerifiedAt).toBeNull();
  });

  it('reenviar: como mucho uno por minuto', async () => {
    const { service, sent, clock } = setup({ users: [{ email: 'ana@example.com' }] });
    expect(await service.sendVerification('u1', clock.now)).toBe('sent');
    expect(await service.sendVerification('u1', new Date(clock.now.getTime() + 10_000))).toBe('wait');
    expect(sent).toHaveLength(1);
  });
});
