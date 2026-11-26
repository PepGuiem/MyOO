import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  SubscriptionSource,
  SubscriptionStatus,
} from '@prisma/client';
import { paginate, toSkipTake } from '../common/pagination';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { addMonths } from './billing.config';
import {
  AdminCancelDto,
  AdminPaymentsQueryDto,
  AssignPlanDto,
  GiftMonthsDto,
  RefundDto,
  UpdatePlanDto,
} from './billing.dto';
import { billingSubscriptionSelect, BillingService, paymentSelect } from './billing.service';
import type { StripeSubscription } from './stripe.client';

const PAGE = 25;
const userSelect = { id: true, email: true, username: true, displayName: true } as const;

/** Pagos y suscripciones desde el panel de admin. Todo queda en el registro (AdminAction). */
@Injectable()
export class AdminBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly billing: BillingService,
  ) {}

  /** Resumen: configuración, suscripciones activas por plan e ingresos del mes. */
  async summary() {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const since30 = new Date(now.getTime() - 30 * 86_400_000);
    const collected = [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED];
    const activeWhere: Prisma.SubscriptionWhereInput = {
      status: SubscriptionStatus.ACTIVE,
      startedAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    };

    const [groups, plans, month, prev, failed, pastDue, cancelling] = await Promise.all([
      this.prisma.subscription.groupBy({ by: ['planId', 'source'], where: activeWhere, _count: { _all: true } }),
      this.prisma.plan.findMany({ select: { id: true, code: true, name: true, isDefault: true } }),
      this.prisma.payment.aggregate({
        where: { status: { in: collected }, paidAt: { gte: monthStart } },
        _sum: { amountCents: true, refundedCents: true },
        _count: { _all: true },
      }),
      this.prisma.payment.aggregate({
        where: { status: { in: collected }, paidAt: { gte: prevStart, lt: monthStart } },
        _sum: { amountCents: true, refundedCents: true },
      }),
      this.prisma.payment.count({ where: { status: PaymentStatus.FAILED, createdAt: { gte: since30 } } }),
      this.prisma.subscription.count({ where: { ...activeWhere, stripeStatus: 'past_due' } }),
      this.prisma.subscription.count({ where: { ...activeWhere, cancelAtPeriodEnd: true } }),
    ]);

    const byPlan = plans
      .filter((p) => !p.isDefault)
      .map((p) => {
        const count = (source: SubscriptionSource) =>
          groups.find((g) => g.planId === p.id && g.source === source)?._count._all ?? 0;
        return {
          plan: { id: p.id, code: p.code, name: p.name },
          stripe: count(SubscriptionSource.STRIPE),
          admin: count(SubscriptionSource.ADMIN),
          simulated: count(SubscriptionSource.SIMULATED),
        };
      });

    return {
      config: this.billing.billing.status,
      currency: 'EUR',
      month: {
        grossCents: month._sum.amountCents ?? 0,
        refundedCents: month._sum.refundedCents ?? 0,
        payments: month._count._all,
      },
      previousMonth: {
        grossCents: prev._sum.amountCents ?? 0,
        refundedCents: prev._sum.refundedCents ?? 0,
      },
      failedLast30Days: failed,
      pastDue,
      cancelling,
      byPlan,
    };
  }

  async payments(q: AdminPaymentsQueryDto) {
    const where: Prisma.PaymentWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            user: {
              OR: [
                { email: { contains: q.search, mode: 'insensitive' } },
                { username: { contains: q.search, mode: 'insensitive' } },
                { displayName: { contains: q.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(q.page, PAGE),
        select: { ...paymentSelect, stripePaymentIntentId: true, user: { select: userSelect } },
      }),
      this.prisma.payment.count({ where }),
    ]);
    return paginate(rows.map(withRefundable), total, q.page, PAGE);
  }

  /** Suscripción actual, historial y pagos de un usuario. */
  async user(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...userSelect, stripeCustomerId: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const [effective, subscriptions, payments] = await Promise.all([
      this.plans.getEffectivePlan(userId),
      this.prisma.subscription.findMany({
        where: { userId },
        orderBy: { startedAt: 'desc' },
        take: 20,
        select: billingSubscriptionSelect,
      }),
      this.prisma.payment.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { ...paymentSelect, stripePaymentIntentId: true },
      }),
    ]);
    const { stripeCustomerId, ...rest } = user;
    return {
      user: { ...rest, hasStripeCustomer: !!stripeCustomerId },
      plan: { id: effective.plan.id, code: effective.plan.code, name: effective.plan.name },
      activeSubscriptionId: effective.subscriptionId,
      subscriptions,
      payments: payments.map(withRefundable),
    };
  }

  /** Pone a un usuario en un plan sin cobro (o lo devuelve al gratis). */
  async assignPlan(adminId: string, userId: string, dto: AssignPlanDto) {
    const plan = await this.prisma.plan.findUnique({ where: { code: dto.planCode } });
    if (!plan) throw new NotFoundException('Plan not found');
    await this.userOr404(userId);
    if (await this.billing.activeStripeRow(userId)) {
      throw new ConflictException('The user pays with Stripe: cancel that subscription first');
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await this.billing.lockUser(tx, userId);
      await tx.subscription.updateMany({
        where: this.plans.activeSubscriptionWhere(userId, now),
        data: { status: SubscriptionStatus.CANCELED, endsAt: now, canceledAt: now },
      });
      // El plan gratis no necesita fila: es el que se aplica sin suscripción.
      if (plan.isDefault) return;
      await tx.subscription.create({
        data: {
          userId,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          source: SubscriptionSource.ADMIN,
          startedAt: now,
          endsAt: dto.months ? addMonths(now, dto.months) : null,
        },
      });
    });
    await this.log(adminId, 'billing.assign_plan', userId, plan.id, {
      plan: plan.code,
      months: dto.months ?? null,
    });
    return this.user(userId);
  }

  /** Regala meses: en Stripe, sin cobro hasta esa fecha; si no, alarga la fecha de fin. */
  async giftMonths(adminId: string, userId: string, dto: GiftMonthsDto) {
    const row = await this.prisma.subscription.findFirst({
      where: this.plans.activeSubscriptionWhere(userId),
      orderBy: { startedAt: 'desc' },
      select: { id: true, source: true, endsAt: true, stripeSubscriptionId: true },
    });
    if (!row) throw new ConflictException('The user is on the free plan: assign a plan instead');

    if (row.source === SubscriptionSource.STRIPE && row.stripeSubscriptionId) {
      const stripe = this.billing.requireStripe();
      const sub = await this.billing.stripeCall(() =>
        stripe.get<StripeSubscription>(`/subscriptions/${row.stripeSubscriptionId}`),
      );
      const base = Math.max(sub.current_period_end ?? 0, sub.trial_end ?? 0, Math.floor(Date.now() / 1000));
      const until = Math.floor(addMonths(new Date(base * 1000), dto.months).getTime() / 1000);
      // Periodo de prueba hasta esa fecha: Stripe no cobra hasta entonces.
      await this.billing.stripeCall(() =>
        stripe.post(`/subscriptions/${sub.id}`, { trial_end: until, proration_behavior: 'none' }),
      );
      await this.billing.syncSubscription(sub.id);
    } else {
      if (!row.endsAt) throw new ConflictException('This subscription has no end date');
      await this.prisma.subscription.update({
        where: { id: row.id },
        data: { endsAt: addMonths(row.endsAt, dto.months) },
      });
    }
    await this.log(adminId, 'billing.gift_months', userId, row.id, { months: dto.months });
    return this.user(userId);
  }

  async cancelSubscription(adminId: string, subscriptionId: string, dto: AdminCancelDto) {
    const row = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { id: true, userId: true, status: true, source: true, stripeSubscriptionId: true },
    });
    if (!row) throw new NotFoundException('Subscription not found');
    if (row.status !== SubscriptionStatus.ACTIVE) throw new ConflictException('Subscription is not active');

    if (row.source === SubscriptionSource.STRIPE && row.stripeSubscriptionId) {
      const stripe = this.billing.requireStripe();
      const id = row.stripeSubscriptionId;
      await this.billing.stripeCall(() =>
        dto.immediate
          ? stripe.delete(`/subscriptions/${id}`)
          : stripe.post(`/subscriptions/${id}`, { cancel_at_period_end: true }),
      );
      await this.billing.syncSubscription(id);
    } else {
      const now = new Date();
      await this.prisma.subscription.update({
        where: { id: row.id },
        data: { status: SubscriptionStatus.CANCELED, endsAt: now, canceledAt: now },
      });
    }
    await this.log(adminId, 'billing.cancel', row.userId, row.id, { immediate: dto.immediate });
    return this.user(row.userId);
  }

  /** Reembolso total o parcial en Stripe (no cancela la suscripción). */
  async refund(adminId: string, paymentId: string, dto: RefundDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        userId: true,
        status: true,
        amountCents: true,
        refundedCents: true,
        stripePaymentIntentId: true,
        stripeChargeId: true,
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const remaining = payment.amountCents - payment.refundedCents;
    if (!payment.stripePaymentIntentId || payment.status === PaymentStatus.FAILED || remaining <= 0) {
      throw new ConflictException('This payment cannot be refunded');
    }
    const amount = dto.amountCents ?? remaining;
    if (amount > remaining) throw new BadRequestException('Amount is more than what is left to refund');

    const stripe = this.billing.requireStripe();
    await this.billing.stripeCall(() =>
      stripe.post(
        '/refunds',
        { payment_intent: payment.stripePaymentIntentId, amount, metadata: { paymentId, adminId } },
        `refund-${paymentId}-${payment.refundedCents}-${amount}`,
      ),
    );
    if (payment.stripeChargeId) await this.billing.syncCharge(payment.stripeChargeId);
    else {
      const refunded = payment.refundedCents + amount;
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          refundedCents: refunded,
          status: refunded >= payment.amountCents ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });
    }
    await this.log(adminId, 'billing.refund', payment.userId, payment.id, { amountCents: amount });
    return this.prisma.payment.findUnique({
      where: { id: payment.id },
      select: { ...paymentSelect, stripePaymentIntentId: true, user: { select: userSelect } },
    }).then((p) => (p ? withRefundable(p) : p));
  }

  /** Todos los planes (también los desactivados) con cuántos los usan. */
  async listPlans() {
    const now = new Date();
    const plans = await this.prisma.plan.findMany({
      orderBy: { priceCents: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        priceCents: true,
        annualPriceCents: true,
        currency: true,
        isDefault: true,
        isActive: true,
        customizedAt: true,
        _count: {
          select: {
            subscriptions: {
              where: {
                status: SubscriptionStatus.ACTIVE,
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              },
            },
          },
        },
      },
    });
    return plans.map(({ _count, ...p }) => ({ ...p, activeSubscriptions: _count.subscriptions }));
  }

  /**
   * Cambia nombre, descripción, precios o si se ofrece. Los precios nuevos
   * valen para los pagos nuevos: quien ya paga en Stripe sigue con su precio.
   */
  async updatePlan(adminId: string, planId: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (plan.isDefault) {
      if (dto.isActive === false) throw new BadRequestException('The free plan cannot be deactivated');
      if ((dto.priceCents ?? 0) > 0 || (dto.annualPriceCents ?? 0) > 0) {
        throw new BadRequestException('The free plan must stay at 0');
      }
    }
    const data: Prisma.PlanUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description || null } : {}),
      ...(dto.priceCents !== undefined ? { priceCents: dto.priceCents } : {}),
      ...(dto.annualPriceCents !== undefined ? { annualPriceCents: dto.annualPriceCents } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      customizedAt: new Date(),
    };
    if (!plan.isDefault && dto.priceCents === 0 && dto.isActive !== false && plan.isActive) {
      throw new BadRequestException('A paid plan needs a monthly price (or deactivate it)');
    }
    await this.prisma.plan.update({ where: { id: planId }, data });

    // El nombre del producto en Stripe (lo que ve el cliente en Checkout y facturas).
    if (dto.name && dto.name !== plan.name && plan.stripeProductId && this.billing.billing.stripe) {
      const stripe = this.billing.billing.stripe;
      const productId = plan.stripeProductId;
      await this.billing
        .stripeCall(() => stripe.post(`/products/${productId}`, { name: `MyOO ${dto.name}` }))
        .catch(() => undefined);
    }
    await this.log(adminId, 'billing.update_plan', null, planId, {
      code: plan.code,
      changes: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
    });
    return this.listPlans();
  }

  // ------------------------------------------------------------ ayudas

  private async userOr404(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!u) throw new NotFoundException('User not found');
  }

  private async log(
    adminId: string,
    action: string,
    targetUserId: string | null,
    targetId: string | null,
    details?: Prisma.InputJsonValue,
  ) {
    await this.prisma.adminAction.create({
      data: { adminId, action, targetUserId, targetId, details },
    });
  }
}

/** Añade si se puede reembolsar (y cuánto queda). */
function withRefundable<
  T extends { status: PaymentStatus; amountCents: number; refundedCents: number; stripePaymentIntentId?: string | null },
>(p: T) {
  const { stripePaymentIntentId, ...rest } = p;
  const remaining = p.amountCents - p.refundedCents;
  return {
    ...rest,
    refundableCents: p.status !== PaymentStatus.FAILED && remaining > 0 && !!stripePaymentIntentId ? remaining : 0,
  };
}
