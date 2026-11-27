import {
  CHAT_NOTICE_EVERY_MS,
  CHAT_QUIET_MS,
  chatNoticeCutoffs,
  formatMoney,
  MailNoticesService,
} from './mail-notices.service';
import { unsubscribeToken } from './unsubscribe';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SECRET = 's'.repeat(40);
const USER = '3f1b2c4d-5e6f-4a1b-8c9d-0e1f2a3b4c5d';

function setup(opts: { enabled?: boolean; online?: string[] } = {}) {
  const sent: any[] = [];
  const updates: any[] = [];
  let notifiedAt: Date | null = null;
  const prisma: any = {
    user: {
      updateMany: async (args: any) => {
        updates.push(args);
        return { count: 1 };
      },
      findUnique: async () => ({ displayName: 'Ana', username: 'ana' }),
    },
    conversation: { findUnique: async () => ({ isGroup: false, title: null }) },
    conversationMember: {
      findMany: async () => [
        { userId: 'u2', user: { email: 'luis@example.com', locale: 'ES' } },
        { userId: 'u3', user: { email: 'eva@example.com', locale: 'EN' } },
      ],
      // Solo el primero que reserva gana (como el updateMany condicional real).
      updateMany: async ({ where, data }: any) => {
        if (where.userId !== 'u2' || notifiedAt) return { count: 0 };
        notifiedAt = data.emailNotifiedAt;
        return { count: 1 };
      },
    },
  };
  const mail = {
    enabled: opts.enabled ?? true,
    frontendUrl: 'https://myout.vercel.app',
    publicApiUrl: 'https://myout.vercel.app/api',
    send: async (m: any) => {
      sent.push(m);
      return true;
    },
  };
  const config = { get: () => SECRET };
  const realtime = { isOnline: (id: string) => (opts.online ?? []).includes(id) };
  const service = new MailNoticesService(prisma, mail as any, config as any, realtime as any);
  return { service, sent, updates };
}

describe('avisos por correo', () => {
  it('ventanas del aviso de mensajes: 30 min sin entrar, uno cada 4 h', () => {
    const now = new Date('2026-11-27T10:00:00Z');
    const c = chatNoticeCutoffs(now);
    expect(now.getTime() - c.quietSince.getTime()).toBe(CHAT_QUIET_MS);
    expect(now.getTime() - c.notifiedBefore.getTime()).toBe(CHAT_NOTICE_EVERY_MS);
    expect(CHAT_NOTICE_EVERY_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  it('formatMoney según el idioma', () => {
    expect(formatMoney(499, 'EUR', 'EN')).toContain('4.99');
    expect(formatMoney(499, 'EUR', 'ES')).toContain('4,99');
  });

  it('mensaje nuevo: un correo por conversación (reservado), sin el texto y con enlace de baja', async () => {
    const { service, sent } = setup();
    await service.chatMessage('c1', 'u1');
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('luis@example.com');
    expect(sent[0].subject).toContain('Ana');
    expect(sent[0].html).toContain('https://myout.vercel.app/mensajes/c1');
    expect(sent[0].html).toContain('/email-preferences?token=');
    expect(sent[0].oneClickUnsubscribeUrl).toContain('/api/mail/unsubscribe/one-click?token=');
    // Un segundo mensaje enseguida no manda otro correo.
    await service.chatMessage('c1', 'u1');
    expect(sent).toHaveLength(1);
  });

  it('no avisa a quien está conectado ni sin correo configurado', async () => {
    const online = setup({ online: ['u2', 'u3'] });
    await online.service.chatMessage('c1', 'u1');
    expect(online.sent).toHaveLength(0);
    const off = setup({ enabled: false });
    await off.service.chatMessage('c1', 'u1');
    expect(off.sent).toHaveLength(0);
  });

  it('enlace de baja: apaga solo ese aviso; un enlace falso no hace nada', async () => {
    const { service, updates } = setup();
    expect(await service.unsubscribe(unsubscribeToken(SECRET, USER, 'chat'))).toEqual({ kind: 'chat' });
    expect(updates[0]).toEqual({ where: { id: USER }, data: { emailChatNotices: false } });
    expect(await service.unsubscribe(unsubscribeToken('otro'.repeat(10), USER, 'payments'))).toBeNull();
    expect(updates).toHaveLength(1);
  });
});
