import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Locale, PaymentStatus } from '@prisma/client';
import { notBannedWhere } from '../common/ban';
import type { AppConfig } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { MailService } from './mail.service';
import {
  chatMessageMail,
  paymentFailedMail,
  paymentReceivedMail,
  subscriptionEndedMail,
  subscriptionEndingMail,
  type LayoutOptions,
} from './templates';
import { readUnsubscribeToken, unsubscribeToken, type NoticeKind } from './unsubscribe';

/** Sin leer la conversación ni usar la web en este tiempo = «lleva un rato sin entrar». */
export const CHAT_QUIET_MS = 30 * 60 * 1000;
/** Como mucho un correo de mensajes por conversación en este tiempo. */
export const CHAT_NOTICE_EVERY_MS = 4 * 60 * 60 * 1000;

/** Límites de tiempo para el aviso de mensajes (función pura, con test). */
export function chatNoticeCutoffs(now: Date): { quietSince: Date; notifiedBefore: Date } {
  return {
    quietSince: new Date(now.getTime() - CHAT_QUIET_MS),
    notifiedBefore: new Date(now.getTime() - CHAT_NOTICE_EVERY_MS),
  };
}

export interface EmailNotices {
  payments: boolean;
  chat: boolean;
}

const LOCALE_TAG: Record<Locale, string> = { ES: 'es-ES', EN: 'en-GB' };

export function formatMoney(cents: number, currency: string, locale: Locale): string {
  try {
    return new Intl.NumberFormat(LOCALE_TAG[locale], { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDay(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

const noticeUserSelect = {
  id: true,
  email: true,
  locale: true,
  emailPaymentNotices: true,
} as const;

/**
 * Avisos por correo opcionales: pagos (desde billing) y mensajes nuevos del
 * chat. Cada cuenta los apaga en «Cuenta» o con el enlace del pie del correo.
 * Nunca lanzan errores: un aviso que no sale no puede romper un pago ni un
 * mensaje (se apunta en el log).
 */
@Injectable()
export class MailNoticesService {
  private readonly logger = new Logger('MailNotices');
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService<AppConfig, true>,
    @Optional() private readonly realtime?: RealtimeService,
  ) {
    this.secret = config.get('JWT_SECRET', { infer: true });
  }

  // ------------------------------------------------------------ preferencias

  async getPreferences(userId: string): Promise<EmailNotices> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailPaymentNotices: true, emailChatNotices: true },
    });
    if (!u) throw new NotFoundException('User not found');
    return { payments: u.emailPaymentNotices, chat: u.emailChatNotices };
  }

  async setPreferences(userId: string, input: Partial<EmailNotices>): Promise<EmailNotices> {
    const u = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.payments !== undefined ? { emailPaymentNotices: input.payments } : {}),
        ...(input.chat !== undefined ? { emailChatNotices: input.chat } : {}),
      },
      select: { emailPaymentNotices: true, emailChatNotices: true },
    });
    return { payments: u.emailPaymentNotices, chat: u.emailChatNotices };
  }

  /** Enlace de baja del correo (sin sesión). Solo apaga; un enlace malo es un 400. */
  async unsubscribe(token: unknown): Promise<{ kind: NoticeKind } | null> {
    const t = readUnsubscribeToken(this.secret, token);
    if (!t) return null;
    const data = t.kind === 'payments' ? { emailPaymentNotices: false } : { emailChatNotices: false };
    // updateMany: si la cuenta ya no existe no falla (y no se revela).
    await this.prisma.user.updateMany({ where: { id: t.userId }, data });
    return { kind: t.kind };
  }

  private layout(userId: string, kind: NoticeKind): LayoutOptions & { oneClick: string } {
    const token = encodeURIComponent(unsubscribeToken(this.secret, userId, kind));
    return {
      frontendUrl: this.mail.frontendUrl,
      unsubscribeUrl: `${this.mail.frontendUrl}/email-preferences?token=${token}`,
      oneClick: `${this.mail.publicApiUrl}/mail/unsubscribe/one-click?token=${token}`,
    };
  }

  // ------------------------------------------------------------------ pagos

  /** Pago recibido (webhook invoice.paid). */
  async paymentReceived(stripeInvoiceId: string): Promise<void> {
    await this.safely('pago recibido', async () => {
      const p = await this.paymentFor(stripeInvoiceId);
      if (!p?.user || !p.user.emailPaymentNotices || p.status === PaymentStatus.FAILED) return;
      const user = p.user;
      const opts = this.layout(user.id, 'payments');
      const content = paymentReceivedMail(
        user.locale,
        {
          amount: formatMoney(p.amountCents, p.currency, user.locale),
          plan: p.plan?.name ?? null,
          accountUrl: `${this.mail.frontendUrl}/account`,
        },
        opts,
      );
      await this.mail.send({
        to: user.email,
        ...content,
        oneClickUnsubscribeUrl: opts.oneClick,
        idempotencyKey: `payment-paid/${stripeInvoiceId}`,
      });
    });
  }

  /** Cobro fallido (webhook invoice.payment_failed; uno por intento de Stripe). */
  async paymentFailed(stripeInvoiceId: string, eventId: string): Promise<void> {
    await this.safely('cobro fallido', async () => {
      const p = await this.paymentFor(stripeInvoiceId);
      if (!p?.user || !p.user.emailPaymentNotices || p.status !== PaymentStatus.FAILED) return;
      const user = p.user;
      const opts = this.layout(user.id, 'payments');
      const content = paymentFailedMail(
        user.locale,
        {
          amount: formatMoney(p.amountCents, p.currency, user.locale),
          plan: p.plan?.name ?? null,
          accountUrl: `${this.mail.frontendUrl}/account`,
        },
        opts,
      );
      await this.mail.send({
        to: user.email,
        ...content,
        oneClickUnsubscribeUrl: opts.oneClick,
        idempotencyKey: `payment-failed/${eventId}`,
      });
    });
  }

  /** Suscripción cancelada que termina al final del periodo. */
  async subscriptionEnding(stripeSubscriptionId: string, eventId: string): Promise<void> {
    await this.safely('suscripción terminando', async () => {
      const s = await this.subscriptionFor(stripeSubscriptionId);
      if (!s?.user.emailPaymentNotices) return;
      const { user } = s;
      const end = s.currentPeriodEnd ?? s.endsAt;
      const opts = this.layout(user.id, 'payments');
      const content = subscriptionEndingMail(
        user.locale,
        {
          plan: s.plan.name,
          date: end ? formatDay(end, user.locale) : null,
          accountUrl: `${this.mail.frontendUrl}/account`,
        },
        opts,
      );
      await this.mail.send({
        to: user.email,
        ...content,
        oneClickUnsubscribeUrl: opts.oneClick,
        idempotencyKey: `subscription-ending/${eventId}`,
      });
    });
  }

  /** Suscripción terminada (webhook customer.subscription.deleted). */
  async subscriptionEnded(stripeSubscriptionId: string): Promise<void> {
    await this.safely('suscripción terminada', async () => {
      const s = await this.subscriptionFor(stripeSubscriptionId);
      if (!s?.user.emailPaymentNotices) return;
      const { user } = s;
      const opts = this.layout(user.id, 'payments');
      const content = subscriptionEndedMail(
        user.locale,
        { plan: s.plan.name, accountUrl: `${this.mail.frontendUrl}/account` },
        opts,
      );
      await this.mail.send({
        to: user.email,
        ...content,
        oneClickUnsubscribeUrl: opts.oneClick,
        idempotencyKey: `subscription-ended/${stripeSubscriptionId}`,
      });
    });
  }

  private paymentFor(stripeInvoiceId: string) {
    return this.prisma.payment.findUnique({
      where: { stripeInvoiceId },
      select: {
        amountCents: true,
        currency: true,
        status: true,
        plan: { select: { name: true } },
        user: { select: noticeUserSelect },
      },
    });
  }

  private subscriptionFor(stripeSubscriptionId: string) {
    return this.prisma.subscription.findFirst({
      where: { stripeSubscriptionId },
      orderBy: { startedAt: 'desc' },
      select: {
        currentPeriodEnd: true,
        endsAt: true,
        plan: { select: { name: true } },
        user: { select: noticeUserSelect },
      },
    });
  }

  // ------------------------------------------------------------------- chat

  /**
   * Mensaje nuevo en una conversación: avisa por correo a los miembros que
   * llevan un rato sin entrar (ni leer esta conversación, ni usar la web, ni
   * conectados por WebSocket), con el email verificado y el aviso encendido.
   * Como mucho uno cada CHAT_NOTICE_EVERY_MS por conversación y persona: se
   * «reserva» con un updateMany condicional, así dos mensajes a la vez no
   * mandan dos correos.
   */
  async chatMessage(conversationId: string, senderId: string, now = new Date()): Promise<void> {
    if (!this.mail.enabled) return;
    await this.safely('mensaje nuevo', async () => {
      const { quietSince, notifiedBefore } = chatNoticeCutoffs(now);
      const notNotifiedRecently = {
        OR: [{ emailNotifiedAt: null }, { emailNotifiedAt: { lt: notifiedBefore } }],
      };
      const members = await this.prisma.conversationMember.findMany({
        where: {
          conversationId,
          userId: { not: senderId },
          AND: [
            { OR: [{ lastReadAt: null }, { lastReadAt: { lt: quietSince } }] },
            notNotifiedRecently,
          ],
          user: {
            emailChatNotices: true,
            emailVerifiedAt: { not: null },
            AND: [
              notBannedWhere(now),
              { OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: quietSince } }] },
            ],
          },
        },
        select: { userId: true, user: { select: { email: true, locale: true } } },
        take: 50,
      });
      const away = members.filter((m) => !this.realtime?.isOnline(m.userId));
      if (away.length === 0) return;

      const [conversation, sender] = await Promise.all([
        this.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { isGroup: true, title: true },
        }),
        this.prisma.user.findUnique({
          where: { id: senderId },
          select: { displayName: true, username: true },
        }),
      ]);
      if (!conversation) return;
      const from = sender?.displayName?.trim() || (sender?.username ? `@${sender.username}` : null);
      const url = `${this.mail.frontendUrl}/mensajes/${conversationId}`;

      for (const m of away) {
        const { count } = await this.prisma.conversationMember.updateMany({
          where: { conversationId, userId: m.userId, ...notNotifiedRecently },
          data: { emailNotifiedAt: now },
        });
        if (count !== 1) continue;
        const opts = this.layout(m.userId, 'chat');
        const content = chatMessageMail(
          m.user.locale,
          {
            from: conversation.isGroup ? null : from,
            group: conversation.isGroup ? (conversation.title ?? '') || null : null,
            url,
          },
          opts,
        );
        await this.mail.send({ to: m.user.email, ...content, oneClickUnsubscribeUrl: opts.oneClick });
      }
    });
  }

  private async safely(what: string, fn: () => Promise<void>): Promise<void> {
    if (!this.mail.enabled) return;
    try {
      await fn();
    } catch (err) {
      this.logger.warn(`Aviso por correo (${what}) no enviado: ${err instanceof Error ? err.name : 'error'}`);
    }
  }
}
