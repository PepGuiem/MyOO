import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentStatus,
  Prisma,
  SubscriptionSource,
  SubscriptionStatus,
} from '@prisma/client';
import type { AppConfig } from '../config/env.validation';
import { MailNoticesService } from '../mail/mail-notices.service';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  BillingConfig,
  fromUnix,
  planPrice,
  stripeInterval,
  subscriptionState,
  toInterval,
} from './billing.config';
import { CheckoutDto } from './billing.dto';
import {
  StripeApiError,
  StripeCharge,
  StripeCheckoutSession,
  StripeClient,
  StripeEventPayload,
  StripeInvoice,
  StripeSubscription,
  safeInvoiceUrl,
  verifyStripeSignature,
} from './stripe.client';

type Db = Prisma.TransactionClient;

export const billingSubscriptionSelect = {
  id: true,
  status: true,
  source: true,
  interval: true,
  startedAt: true,
  endsAt: true,
  canceledAt: true,
  stripeStatus: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  plan: { select: { id: true, code: true, name: true } },
} satisfies Prisma.SubscriptionSelect;

export const paymentSelect = {
  id: true,
  amountCents: true,
  refundedCents: true,
  currency: true,
  status: true,
  interval: true,
  failureReason: true,
  periodStart: true,
  periodEnd: true,
  paidAt: true,
  invoiceUrl: true,
  createdAt: true,
  plan: { select: { id: true, code: true, name: true } },
} satisfies Prisma.PaymentSelect;

/**
 * Pagos de suscripciones con Stripe (modo prueba).
 *
 * - El usuario paga en Stripe Checkout: la tarjeta nunca pasa por MyOO.
 * - Stripe avisa por webhook (firmado) y volvemos a pedir el objeto a la API
 *   para guardar el estado: suscripción (plan, renovación, cancelación) y
 *   cada factura pagada o fallida (tabla Payment).
 * - Al volver de Checkout la web llama a /billing/checkout/confirm, que hace
 *   la misma sincronización: funciona aunque el webhook tarde o falte.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    readonly billing: BillingConfig,
    private readonly config: ConfigService<AppConfig, true>,
    @Optional() private readonly notices?: MailNoticesService,
  ) {}

  // ------------------------------------------------------------ usuario

  /** Lo que la web necesita saber para enseñar los botones de pago. */
  publicConfig() {
    const enabled = this.billing.status.enabled;
    return {
      enabled,
      testMode: true as const,
      // Sin Stripe se mantiene el cambio simulado (si está permitido).
      simulated:
        !enabled && this.config.get('ALLOW_SIMULATED_PLAN_CHANGE', { infer: true }),
    };
  }

  async me(userId: string) {
    const [subscription, payments] = await Promise.all([
      this.prisma.subscription.findFirst({
        where: this.plans.activeSubscriptionWhere(userId),
        orderBy: { startedAt: 'desc' },
        select: billingSubscriptionSelect,
      }),
      this.prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 24,
        select: paymentSelect,
      }),
    ]);
    return { config: this.publicConfig(), subscription, payments };
  }

  /** Crea la sesión de Stripe Checkout para empezar a pagar un plan. */
  async checkout(userId: string, dto: CheckoutDto): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const plan = await this.plans.findActiveByCode(dto.planCode);
    if (!plan) throw new NotFoundException('Plan not found');
    const amount = planPrice(plan, dto.interval);
    if (plan.isDefault || amount <= 0) {
      throw new BadRequestException('This plan is not available for that billing period');
    }
    const current = await this.activeStripeRow(userId);
    if (current) {
      // Ya paga: se cambia el plan de su suscripción (sin un segundo cobro).
      throw new ConflictException('You already have a paid subscription; change plan instead');
    }

    const customer = await this.ensureCustomer(userId);
    const product = await this.ensureProduct(plan);
    const front = this.config.get('FRONTEND_URL', { infer: true });
    const session = await stripe.post<StripeCheckoutSession>('/checkout/sessions', {
      mode: 'subscription',
      customer,
      client_reference_id: userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: plan.currency.toLowerCase(),
            product,
            unit_amount: amount,
            recurring: { interval: stripeInterval(dto.interval) },
          },
        },
      ],
      subscription_data: { metadata: { userId, planId: plan.id } },
      metadata: { userId, planId: plan.id },
      allow_promotion_codes: false,
      success_url: `${front}/account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${front}/account?checkout=cancel`,
    });
    if (!session.url) throw new ServiceUnavailableException('Stripe did not return a checkout URL');
    return { url: session.url };
  }

  /** Vuelta de Checkout: sincroniza ya (sin esperar al webhook). */
  async confirmCheckout(userId: string, sessionId: string) {
    const stripe = this.requireStripe();
    const session = await this.stripeCall(() =>
      stripe.get<StripeCheckoutSession>(`/checkout/sessions/${encodeURIComponent(sessionId)}`),
    );
    // La sesión tiene que ser de este usuario.
    if (session.client_reference_id !== userId) throw new NotFoundException('Checkout not found');
    if (session.subscription) await this.syncSubscription(session.subscription);
    if (session.invoice) await this.syncInvoice(session.invoice);
    return this.me(userId);
  }

  /** Cambia el plan (o el periodo) de una suscripción ya pagada, con prorrateo. */
  async changePlan(userId: string, dto: CheckoutDto) {
    const stripe = this.requireStripe();
    const row = await this.activeStripeRow(userId);
    if (!row?.stripeSubscriptionId) throw new ConflictException('No paid subscription to change');
    const plan = await this.plans.findActiveByCode(dto.planCode);
    if (!plan) throw new NotFoundException('Plan not found');

    // Pasar al plan gratis = cancelar al final del periodo pagado.
    if (plan.isDefault) return this.setCancelAtPeriodEnd(userId, true);

    const amount = planPrice(plan, dto.interval);
    if (amount <= 0) throw new BadRequestException('This plan is not available for that billing period');
    if (row.plan.id === plan.id && row.interval === dto.interval) {
      throw new ConflictException('You are already on this plan');
    }
    const sub = await this.stripeCall(() =>
      stripe.get<StripeSubscription>(`/subscriptions/${row.stripeSubscriptionId}`),
    );
    const product = await this.ensureProduct(plan);
    await this.stripeCall(() =>
      stripe.post<StripeSubscription>(`/subscriptions/${sub.id}`, {
        items: [
          {
            id: sub.items.data[0]?.id,
            price_data: {
              currency: plan.currency.toLowerCase(),
              product,
              unit_amount: amount,
              recurring: { interval: stripeInterval(dto.interval) },
            },
          },
        ],
        // Se cobra (o se abona) la diferencia al momento.
        proration_behavior: 'always_invoice',
        cancel_at_period_end: false,
        metadata: { userId, planId: plan.id },
      }),
    );
    const synced = await this.syncSubscription(sub.id);
    if (synced?.latestInvoice) await this.syncInvoice(synced.latestInvoice);
    return this.me(userId);
  }

  /** Cancelar (al final del periodo pagado) o deshacer la cancelación. */
  async setCancelAtPeriodEnd(userId: string, cancel: boolean) {
    const stripe = this.requireStripe();
    const row = await this.activeStripeRow(userId);
    if (!row?.stripeSubscriptionId) throw new ConflictException('No paid subscription');
    await this.stripeCall(() =>
      stripe.post(`/subscriptions/${row.stripeSubscriptionId}`, { cancel_at_period_end: cancel }),
    );
    await this.syncSubscription(row.stripeSubscriptionId);
    return this.me(userId);
  }

  /**
   * Antes de borrar una cuenta: corta su suscripción en Stripe para que no se
   * le siga cobrando. Si Stripe no responde, NO se borra la cuenta.
   */
  async cancelForDeletedUser(userId: string): Promise<void> {
    const rows = await this.prisma.subscription.findMany({
      where: { userId, source: SubscriptionSource.STRIPE, status: SubscriptionStatus.ACTIVE },
      select: { stripeSubscriptionId: true },
    });
    const ids = [...new Set(rows.map((r) => r.stripeSubscriptionId).filter((x): x is string => !!x))];
    if (!ids.length) return;
    const stripe = this.billing.stripe;
    if (!stripe) {
      this.logger.warn('Cuenta con suscripción de Stripe borrada sin claves de Stripe configuradas');
      return;
    }
    for (const id of ids) {
      try {
        await stripe.delete(`/subscriptions/${id}`);
      } catch (err) {
        // Ya cancelada o inexistente: nada que cortar.
        if (err instanceof StripeApiError && err.status === 404) continue;
        throw new ServiceUnavailableException(
          'Could not cancel your subscription right now; please try again',
        );
      }
    }
  }

  // ------------------------------------------------------------ webhook

  async handleWebhook(raw: Buffer | undefined, signature: string | undefined) {
    const secret = this.billing.webhookSecret;
    if (!secret || !this.billing.stripe) throw new NotFoundException();
    if (!raw || !verifyStripeSignature(raw, signature, secret)) {
      throw new BadRequestException('Invalid signature');
    }
    const event = JSON.parse(raw.toString('utf8')) as StripeEventPayload;
    if (event.livemode) {
      this.logger.warn(`Evento real de Stripe ignorado (${event.type})`);
      return { received: true };
    }

    // El mismo evento puede llegar varias veces: se procesa una.
    try {
      await this.prisma.stripeEvent.create({ data: { id: event.id, type: event.type.slice(0, 80) } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { received: true, duplicate: true };
      }
      throw err;
    }

    try {
      const id = event.data.object.id;
      switch (event.type) {
        case 'checkout.session.completed': {
          const s = event.data.object as Partial<StripeCheckoutSession>;
          if (s.subscription) await this.syncSubscription(s.subscription);
          if (s.invoice) await this.syncInvoice(s.invoice);
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          if (id) await this.syncSubscription(id);
          break;
        case 'invoice.paid':
        case 'invoice.payment_succeeded':
        case 'invoice.payment_failed':
          if (id) await this.syncInvoice(id, event.type === 'invoice.payment_failed');
          break;
        case 'charge.refunded':
          if (id) await this.syncCharge(id);
          break;
        default:
          break;
      }
    } catch (err) {
      // Se borra la marca para que Stripe reintente el evento.
      await this.prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => undefined);
      throw err;
    }
    // Avisos por correo (opcionales): después de sincronizar, con los datos ya
    // guardados. Nunca fallan, así un correo no hace que Stripe repita el evento.
    await this.emailNotice(event);
    return { received: true };
  }

  /**
   * Qué aviso por correo toca para cada evento (uno por hecho: de las dos
   * señales de pago de Stripe, solo invoice.paid).
   */
  private async emailNotice(event: StripeEventPayload): Promise<void> {
    if (!this.notices) return;
    const obj = event.data.object as { id?: string; cancel_at_period_end?: unknown };
    if (!obj.id) return;
    switch (event.type) {
      case 'invoice.paid':
        return this.notices.paymentReceived(obj.id);
      case 'invoice.payment_failed':
        return this.notices.paymentFailed(obj.id, event.id);
      case 'customer.subscription.updated':
        // Solo cuando se acaba de pedir la cancelación al final del periodo.
        if (obj.cancel_at_period_end === true && event.data.previous_attributes?.cancel_at_period_end === false) {
          return this.notices.subscriptionEnding(obj.id, event.id);
        }
        return;
      case 'customer.subscription.deleted':
        return this.notices.subscriptionEnded(obj.id);
      default:
        return;
    }
  }

  // ------------------------------------------------------- sincronización

  /** Lee la suscripción de Stripe y deja nuestra fila igual. */
  async syncSubscription(stripeSubscriptionId: string): Promise<{ latestInvoice: string | null } | null> {
    const stripe = this.requireStripe();
    const sub = await this.stripeCall(() =>
      stripe.get<StripeSubscription>(`/subscriptions/${encodeURIComponent(stripeSubscriptionId)}`),
    );
    const price = sub.items.data[0]?.price;
    const user = await this.prisma.user.findUnique({
      where: { stripeCustomerId: sub.customer },
      select: { id: true },
    });
    if (!user) {
      this.logger.warn(`Suscripción ${sub.id} de un cliente desconocido`);
      return null;
    }
    const plan =
      (price && (await this.prisma.plan.findUnique({ where: { stripeProductId: price.product }, select: { id: true } }))) ||
      (sub.metadata.planId &&
        (await this.prisma.plan.findUnique({ where: { id: sub.metadata.planId }, select: { id: true } }).catch(() => null)));
    if (!plan) {
      this.logger.warn(`Suscripción ${sub.id} sin plan reconocible`);
      return null;
    }
    const interval = toInterval(price?.recurring?.interval);
    const currentPeriodEnd = fromUnix(sub.current_period_end);
    const state = subscriptionState({
      status: sub.status,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      currentPeriodEnd,
      endedAt: fromUnix(sub.ended_at),
    });

    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, user.id);
      const now = new Date();
      const latest = await tx.subscription.findFirst({
        where: { stripeSubscriptionId: sub.id },
        orderBy: { startedAt: 'desc' },
        select: { id: true, status: true, planId: true, interval: true },
      });
      const fields = {
        stripeStatus: sub.status.slice(0, 32),
        currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
      };
      const active = state.status === SubscriptionStatus.ACTIVE;

      if (latest?.status === SubscriptionStatus.ACTIVE && latest.planId === plan.id && latest.interval === interval) {
        await tx.subscription.update({
          where: { id: latest.id },
          data: {
            ...fields,
            status: state.status,
            endsAt: state.endsAt,
            canceledAt: active ? null : (fromUnix(sub.canceled_at) ?? now),
          },
        });
        return;
      }
      if (latest?.status === SubscriptionStatus.ACTIVE) {
        // Cambio de plan o de periodo: la fila anterior queda en el historial.
        await tx.subscription.update({
          where: { id: latest.id },
          data: { ...fields, status: SubscriptionStatus.CANCELED, endsAt: now, canceledAt: now },
        });
      }
      if (!active) return;
      // Empieza a pagar: se cierra cualquier otra suscripción activa (simulada, regalada…).
      await tx.subscription.updateMany({
        where: { ...this.plans.activeSubscriptionWhere(user.id, now) },
        data: { status: SubscriptionStatus.CANCELED, endsAt: now, canceledAt: now },
      });
      await tx.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          source: SubscriptionSource.STRIPE,
          interval,
          startedAt: now,
          endsAt: state.endsAt,
          stripeSubscriptionId: sub.id,
          ...fields,
        },
      });
    });
    return { latestInvoice: sub.latest_invoice };
  }

  /** Guarda (o actualiza) el pago de una factura. */
  async syncInvoice(invoiceId: string, failed = false): Promise<void> {
    const stripe = this.requireStripe();
    const inv = await this.stripeCall(() =>
      stripe.get<StripeInvoice>(`/invoices/${encodeURIComponent(invoiceId)}`),
    );
    const paid = inv.status === 'paid';
    // Facturas de 0 € (meses regalados) o aún sin intento de cobro: no son pagos.
    if (paid && inv.amount_paid <= 0) return;
    if (!paid && !(failed || inv.attempt_count > 0)) return;

    const user = await this.prisma.user.findUnique({
      where: { stripeCustomerId: inv.customer },
      select: { id: true },
    });
    const line = inv.lines.data.find((l) => l.price) ?? inv.lines.data[0];
    const plan = line?.price
      ? await this.prisma.plan.findUnique({ where: { stripeProductId: line.price.product }, select: { id: true } })
      : null;
    const subscription = inv.subscription
      ? await this.prisma.subscription.findFirst({
          where: { stripeSubscriptionId: inv.subscription },
          orderBy: { startedAt: 'desc' },
          select: { id: true },
        })
      : null;

    let refunded = 0;
    let failureReason: string | null = null;
    if (inv.charge) {
      const charge = await this.stripeCall(() => stripe.get<StripeCharge>(`/charges/${inv.charge}`));
      refunded = charge.amount_refunded;
      failureReason = paid ? null : (charge.failure_message?.slice(0, 300) ?? null);
    }
    const amount = paid ? inv.amount_paid : inv.amount_due;
    const data = {
      userId: user?.id ?? null,
      subscriptionId: subscription?.id ?? null,
      planId: plan?.id ?? null,
      interval: toInterval(line?.price?.recurring?.interval),
      amountCents: amount,
      refundedCents: refunded,
      currency: inv.currency.toUpperCase().slice(0, 3),
      status: paid ? paymentStatus(amount, refunded) : PaymentStatus.FAILED,
      stripePaymentIntentId: inv.payment_intent,
      stripeChargeId: inv.charge,
      failureReason: paid ? null : (failureReason ?? 'payment_failed'),
      periodStart: fromUnix(line?.period.start),
      periodEnd: fromUnix(line?.period.end),
      paidAt: paid ? (fromUnix(inv.status_transitions.paid_at) ?? new Date()) : null,
      // Enlace a la factura de Stripe (solo si es de un dominio de facturas de Stripe).
      invoiceUrl: safeInvoiceUrl(inv.hosted_invoice_url),
    };
    await this.prisma.payment.upsert({
      where: { stripeInvoiceId: inv.id },
      create: { stripeInvoiceId: inv.id, ...data },
      update: data,
    });
  }

  /** Reembolsos: actualiza lo devuelto de un pago. */
  async syncCharge(chargeId: string): Promise<void> {
    const stripe = this.requireStripe();
    const charge = await this.stripeCall(() =>
      stripe.get<StripeCharge>(`/charges/${encodeURIComponent(chargeId)}`),
    );
    const payment = await this.prisma.payment.findFirst({
      where: {
        OR: [
          { stripeChargeId: charge.id },
          ...(charge.payment_intent ? [{ stripePaymentIntentId: charge.payment_intent }] : []),
        ],
      },
      select: { id: true, amountCents: true, status: true },
    });
    if (!payment) {
      if (charge.invoice) await this.syncInvoice(charge.invoice);
      return;
    }
    if (payment.status === PaymentStatus.FAILED) return;
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        refundedCents: charge.amount_refunded,
        stripeChargeId: charge.id,
        status: paymentStatus(payment.amountCents, charge.amount_refunded),
      },
    });
  }

  // ------------------------------------------------------------ ayudas

  requireStripe(): StripeClient {
    if (!this.billing.stripe) throw new ServiceUnavailableException('Payments are not configured');
    return this.billing.stripe;
  }

  /** Errores de Stripe como 502/400 sin filtrar detalles internos. */
  async stripeCall<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof StripeApiError) {
        this.logger.warn(`Stripe ${err.status}${err.code ? ` ${err.code}` : ''}: ${err.message}`);
        if (err.status === 404) throw new NotFoundException('Not found in Stripe');
        if (err.status === 400 || err.status === 402) throw new BadRequestException('Stripe rejected the request');
        throw new ServiceUnavailableException('Stripe is not available right now');
      }
      throw err;
    }
  }

  activeStripeRow(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { ...this.plans.activeSubscriptionWhere(userId), source: SubscriptionSource.STRIPE },
      orderBy: { startedAt: 'desc' },
      select: { id: true, stripeSubscriptionId: true, interval: true, plan: { select: { id: true } } },
    });
  }

  async lockUser(tx: Db, userId: string) {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  }

  /** Cliente de Stripe del usuario (se crea la primera vez). */
  private async ensureCustomer(userId: string): Promise<string> {
    const stripe = this.requireStripe();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, stripeCustomerId: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.stripeCustomerId) return user.stripeCustomerId;
    const customer = await this.stripeCall(() =>
      stripe.post<{ id: string }>(
        '/customers',
        { email: user.email, name: user.displayName ?? undefined, metadata: { userId } },
        `customer-${userId}`,
      ),
    );
    // Si otra petición lo creó a la vez, gana la primera (la clave de idempotencia ya evita duplicados).
    await this.prisma.user.updateMany({
      where: { id: userId, stripeCustomerId: null },
      data: { stripeCustomerId: customer.id },
    });
    const fresh = await this.prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
    return fresh?.stripeCustomerId ?? customer.id;
  }

  /** Producto de Stripe de un plan (se crea la primera vez). */
  async ensureProduct(plan: { id: string; name: string; code: string; stripeProductId: string | null }): Promise<string> {
    if (plan.stripeProductId) return plan.stripeProductId;
    const stripe = this.requireStripe();
    const product = await this.stripeCall(() =>
      stripe.post<{ id: string }>(
        '/products',
        { name: `MyOO ${plan.name}`, metadata: { planId: plan.id, planCode: plan.code } },
        `product-${plan.id}`,
      ),
    );
    await this.prisma.plan.updateMany({
      where: { id: plan.id, stripeProductId: null },
      data: { stripeProductId: product.id },
    });
    const fresh = await this.prisma.plan.findUnique({ where: { id: plan.id }, select: { stripeProductId: true } });
    return fresh?.stripeProductId ?? product.id;
  }
}

export function paymentStatus(amount: number, refunded: number): PaymentStatus {
  if (refunded <= 0) return PaymentStatus.PAID;
  return refunded >= amount ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;
}

