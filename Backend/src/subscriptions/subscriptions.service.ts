import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import type { AppConfig } from '../config/env.validation';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePlanDto } from './dto/change-plan.dto';

const subscriptionSelect = {
  id: true,
  status: true,
  startedAt: true,
  endsAt: true,
  canceledAt: true,
  plan: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** Historial completo de suscripciones del usuario (la más reciente primero). */
  history(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      select: subscriptionSelect,
    });
  }

  /**
   * Cambio de plan SIMULADO (no hay pagos reales).
   * - Cancela la suscripción activa actual (se conserva en el historial).
   * - Crea una nueva suscripción ACTIVE con el plan elegido.
   * - Bajar de plan NO borra datos: solo impedirá crear recursos nuevos
   *   mientras se supere el límite.
   */
  async changePlan(userId: string, dto: ChangePlanDto) {
    if (!this.config.get('ALLOW_SIMULATED_PLAN_CHANGE', { infer: true })) {
      throw new ForbiddenException('Plan changes are disabled');
    }

    return this.prisma.$transaction(async (tx) => {
      // Bloqueo de la fila del usuario: evita dos cambios de plan simultáneos.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;

      const target = await this.plans.findActiveByCode(dto.planCode, tx);
      if (!target) {
        throw new NotFoundException('Plan not found');
      }

      const current = await this.plans.getEffectivePlan(userId, tx);
      if (current.plan.id === target.id) {
        throw new ConflictException('You are already on this plan');
      }

      const now = new Date();
      await tx.subscription.updateMany({
        where: this.plans.activeSubscriptionWhere(userId, now),
        data: {
          status: SubscriptionStatus.CANCELED,
          canceledAt: now,
          endsAt: now,
        },
      });

      return tx.subscription.create({
        data: {
          userId,
          planId: target.id,
          status: SubscriptionStatus.ACTIVE,
          startedAt: now,
        },
        select: subscriptionSelect,
      });
    });
  }
}
