import { LimitedResource } from '@prisma/client';

/**
 * Lógica PURA (sin base de datos) de los límites de plan.
 * Al no depender de Prisma ni de NestJS, es muy fácil de probar con tests unitarios.
 */

export interface LimitRule {
  resource: LimitedResource;
  isUnlimited: boolean;
  maxCount: number;
}

export interface ResolvedLimit {
  isUnlimited: boolean;
  /** null cuando es ilimitado. */
  max: number | null;
}

/**
 * Devuelve el límite de `resource` según las reglas del plan.
 * Regla explícita: si el plan NO define el recurso, el límite es 0.
 */
export function resolveLimit(
  rules: LimitRule[],
  resource: LimitedResource,
): ResolvedLimit {
  const rule = rules.find((r) => r.resource === resource);
  if (!rule) return { isUnlimited: false, max: 0 };
  if (rule.isUnlimited) return { isUnlimited: true, max: null };
  return { isUnlimited: false, max: Math.max(0, rule.maxCount) };
}

/** ¿Se pueden crear `amount` recursos más si ya hay `used`? */
export function canCreate(
  limit: ResolvedLimit,
  used: number,
  amount = 1,
): boolean {
  if (limit.isUnlimited) return true;
  return used + amount <= (limit.max ?? 0);
}

/** Nombre legible del recurso para los mensajes de error. */
export const RESOURCE_LABEL: Record<LimitedResource, string> = {
  WARDROBES: 'wardrobes',
  WARDROBE_ITEMS: 'wardrobe items',
  OUTFITS: 'outfits',
  MANNEQUINS: 'mannequins',
};
