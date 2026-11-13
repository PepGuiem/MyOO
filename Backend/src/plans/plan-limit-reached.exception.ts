import { ForbiddenException } from '@nestjs/common';
import { LimitedResource } from '@prisma/client';
import { RESOURCE_LABEL } from './plan-limits';

/**
 * 403 con información extra para que el frontend pueda mostrar
 * "Has alcanzado el límite de tu plan" y sugerir un cambio de plan.
 */
export class PlanLimitReachedException extends ForbiddenException {
  constructor(resource: LimitedResource, limit: number, planCode: string) {
    super({
      error: 'PlanLimitReached',
      message: `Your plan (${planCode}) allows up to ${limit} ${RESOURCE_LABEL[resource]}`,
      resource,
      limit,
      planCode,
    });
  }
}
