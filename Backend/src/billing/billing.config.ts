import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingInterval, SubscriptionStatus } from '@prisma/client';
import type { AppConfig } from '../config/env.validation';
import { StripeClient } from './stripe.client';

export type KeyProblem = 'missing' | 'live' | 'invalid';

/** Estado de la configuración de pagos (lo ve el admin; sin secretos). */
export interface BillingStatus {
  enabled: boolean;
  testMode: true;
  keyProblem: KeyProblem | null;
  webhookConfigured: boolean;
}

/**
 * Lee las claves de Stripe. Solo acepta claves de PRUEBA: con una real o mal
 * copiada los pagos quedan apagados (la app sigue funcionando) y el panel
 * de admin lo indica.
 */
@Injectable()
export class BillingConfig {
  private readonly logger = new Logger('Billing');
  readonly stripe: StripeClient | null;
  readonly webhookSecret: string | null;
  readonly status: BillingStatus;

  constructor(config: ConfigService<AppConfig, true>) {
    const key = config.get('STRIPE_SECRET_KEY', { infer: true })?.trim();
    const whsec = config.get('STRIPE_WEBHOOK_SECRET', { infer: true })?.trim();
    const problem = keyProblem(key);
    if (problem && problem !== 'missing') {
      this.logger.warn(`STRIPE_SECRET_KEY ignorada (${problem}): pagos apagados`);
    }
    this.stripe = problem ? null : new StripeClient(key!);
    this.webhookSecret = whsec && /^whsec_\w+$/.test(whsec) ? whsec : null;
    this.status = {
      enabled: !problem,
      testMode: true,
      keyProblem: problem,
      webhookConfigured: this.webhookSecret !== null,
    };
  }
}

export function keyProblem(key: string | undefined): KeyProblem | null {
  if (!key) return 'missing';
  if (/^(sk|rk)_live_/.test(key)) return 'live';
  if (!/^(sk|rk)_test_\w+$/.test(key)) return 'invalid';
  return null;
}

// ---------------------------------------------------------------------------
// Traducción de Stripe a nuestro modelo (funciones puras, con tests).
// ---------------------------------------------------------------------------

/** Estados de Stripe en los que el usuario conserva el plan. past_due = periodo de gracia mientras Stripe reintenta el cobro. */
export function isStripeActive(status: string): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

export function fromUnix(seconds: number | null | undefined): Date | null {
  return typeof seconds === 'number' && seconds > 0 ? new Date(seconds * 1000) : null;
}

export function toInterval(interval: string | null | undefined): BillingInterval | null {
  if (interval === 'month') return BillingInterval.MONTH;
  if (interval === 'year') return BillingInterval.YEAR;
  return null;
}

export function stripeInterval(interval: BillingInterval): 'month' | 'year' {
  return interval === BillingInterval.YEAR ? 'year' : 'month';
}

/**
 * Cómo debe quedar nuestra fila de una suscripción de Stripe:
 * - activa y renovándose: endsAt null;
 * - cancelada al final del periodo: endsAt = fin del periodo (caduca sola
 *   aunque se pierda el webhook);
 * - terminada: CANCELED con su fecha de fin.
 */
export function subscriptionState(
  sub: {
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: Date | null;
    endedAt: Date | null;
  },
  now = new Date(),
): { status: SubscriptionStatus; endsAt: Date | null } {
  if (isStripeActive(sub.status)) {
    return {
      status: SubscriptionStatus.ACTIVE,
      endsAt: sub.cancelAtPeriodEnd ? sub.currentPeriodEnd : null,
    };
  }
  return { status: SubscriptionStatus.CANCELED, endsAt: sub.endedAt ?? now };
}

/** Suma meses a una fecha (31 ene + 1 mes = 28/29 feb, como Stripe). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Precio de un plan para un periodo (0 = no se ofrece). */
export function planPrice(
  plan: { priceCents: number; annualPriceCents: number },
  interval: BillingInterval,
): number {
  return interval === BillingInterval.YEAR ? plan.annualPriceCents : plan.priceCents;
}
