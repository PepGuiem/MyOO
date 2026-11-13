import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { LimitedResource, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitReachedException } from './plan-limit-reached.exception';
import { canCreate, resolveLimit } from './plan-limits';

/**
 * Cliente de base de datos: el PrismaService normal o el `tx` de una
 * transacción (PrismaService también cumple este tipo).
 */
type Db = Prisma.TransactionClient;

export const planWithLimitsInclude = {
  limits: {
    select: { resource: true, isUnlimited: true, maxCount: true },
    orderBy: { resource: 'asc' },
  },
} satisfies Prisma.PlanInclude;

export type PlanWithLimits = Prisma.PlanGetPayload<{
  include: typeof planWithLimitsInclude;
}>;

export interface UsageEntry {
  resource: LimitedResource;
  used: number;
  isUnlimited: boolean;
  max: number | null;
}

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** Planes que se ofrecen actualmente (público). */
  findActivePlans(): Promise<PlanWithLimits[]> {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      include: planWithLimitsInclude,
      orderBy: { priceCents: 'asc' },
    });
  }

  findActiveByCode(code: string, db: Db = this.prisma) {
    return db.plan.findFirst({
      where: { code, isActive: true },
      include: planWithLimitsInclude,
    });
  }

  /** Condición de "suscripción activa" en una fecha dada. */
  activeSubscriptionWhere(
    userId: string,
    now = new Date(),
  ): Prisma.SubscriptionWhereInput {
    return {
      userId,
      status: SubscriptionStatus.ACTIVE,
      startedAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    };
  }

  /**
   * Plan efectivo del usuario:
   * - el de su suscripción ACTIVA más reciente, o
   * - el plan por defecto (isDefault = true) si no tiene ninguna activa.
   */
  async getEffectivePlan(
    userId: string,
    db: Db = this.prisma,
  ): Promise<{
    plan: PlanWithLimits;
    subscriptionId: string | null;
  }> {
    const subscription = await db.subscription.findFirst({
      where: this.activeSubscriptionWhere(userId),
      orderBy: { startedAt: 'desc' },
      include: { plan: { include: planWithLimitsInclude } },
    });
    if (subscription) {
      return { plan: subscription.plan, subscriptionId: subscription.id };
    }
    return { plan: await this.getDefaultPlan(db), subscriptionId: null };
  }

  async getDefaultPlan(db: Db = this.prisma): Promise<PlanWithLimits> {
    const plan = await db.plan.findFirst({
      where: { isDefault: true },
      include: planWithLimitsInclude,
      orderBy: { createdAt: 'asc' },
    });
    if (!plan) {
      // Error de configuración (¿falta ejecutar el seed?).
      throw new InternalServerErrorException('No default plan configured');
    }
    return plan;
  }

  /** Cuántos recursos de cada tipo tiene el usuario (en total, no por armario). */
  countUsage(
    userId: string,
    resource: LimitedResource,
    db: Db = this.prisma,
  ): Promise<number> {
    switch (resource) {
      case LimitedResource.WARDROBES:
        return db.wardrobe.count({ where: { userId } });
      case LimitedResource.WARDROBE_ITEMS:
        // La wishlist no cuenta: tiene su propio tope (ver wishlist.service.ts).
        return db.wardrobeItem.count({
          where: { userId, wishlistStatus: null },
        });
      case LimitedResource.OUTFITS:
        return db.outfit.count({ where: { userId } });
      case LimitedResource.MANNEQUINS:
        return db.mannequin.count({ where: { userId } });
    }
  }

  async getUsage(userId: string) {
    const { plan, subscriptionId } = await this.getEffectivePlan(userId);
    const usage: UsageEntry[] = [];
    for (const resource of Object.values(LimitedResource)) {
      const limit = resolveLimit(plan.limits, resource);
      usage.push({
        resource,
        used: await this.countUsage(userId, resource),
        ...limit,
      });
    }
    return { plan, subscriptionId, usage };
  }

  /**
   * Comprueba el límite ANTES de crear un recurso. Debe llamarse DENTRO de
   * una transacción (`tx`) y crear el recurso en esa misma transacción.
   *
   * Concurrencia: `SELECT ... FOR UPDATE` bloquea la fila del usuario hasta
   * que termine la transacción. Si llegan dos peticiones a la vez, la segunda
   * espera a que la primera confirme y entonces cuenta ya el recurso nuevo.
   * Así no se puede superar el límite con peticiones simultáneas.
   */
  async assertCanCreate(
    tx: Prisma.TransactionClient,
    userId: string,
    resource: LimitedResource,
    amount = 1,
  ): Promise<void> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE
    `;
    if (locked.length === 0) {
      throw new NotFoundException('User not found');
    }

    const { plan } = await this.getEffectivePlan(userId, tx);
    const limit = resolveLimit(plan.limits, resource);
    if (limit.isUnlimited) return;

    const used = await this.countUsage(userId, resource, tx);
    if (!canCreate(limit, used, amount)) {
      throw new PlanLimitReachedException(resource, limit.max ?? 0, plan.code);
    }
  }
}
