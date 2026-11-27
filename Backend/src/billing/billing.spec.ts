import { createHmac } from 'node:crypto';
import { BillingInterval, PaymentStatus, SubscriptionStatus } from '@prisma/client';
import { addMonths, keyProblem, planPrice, subscriptionState, toInterval } from './billing.config';
import { paymentStatus } from './billing.service';
import { encodeForm, safeInvoiceUrl, verifyStripeSignature } from './stripe.client';

describe('encodeForm', () => {
  it('codifica parámetros anidados como Stripe', () => {
    const body = encodeForm({
      mode: 'subscription',
      line_items: [{ quantity: 1, price_data: { unit_amount: 499, recurring: { interval: 'month' } } }],
      metadata: { userId: 'u 1' },
      skip: undefined,
      cancel_at_period_end: false,
    });
    expect(decodeURIComponent(body)).toBe(
      'mode=subscription&line_items[0][quantity]=1&line_items[0][price_data][unit_amount]=499' +
        '&line_items[0][price_data][recurring][interval]=month&metadata[userId]=u 1&cancel_at_period_end=false',
    );
  });
});

describe('verifyStripeSignature', () => {
  const secret = 'whsec_test123';
  const payload = '{"id":"evt_1"}';
  const sign = (t: number, body = payload) =>
    createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

  it('acepta una firma válida y reciente', () => {
    const t = 1_800_000_000;
    expect(verifyStripeSignature(Buffer.from(payload), `t=${t},v1=${sign(t)}`, secret, t + 10)).toBe(true);
  });

  it('acepta si alguna de varias firmas v1 coincide', () => {
    const t = 1_800_000_000;
    const header = `t=${t},v1=${'0'.repeat(64)},v1=${sign(t)}`;
    expect(verifyStripeSignature(payload, header, secret, t)).toBe(true);
  });

  it('rechaza cuerpo cambiado, secreto distinto, evento viejo o cabecera rota', () => {
    const t = 1_800_000_000;
    const header = `t=${t},v1=${sign(t)}`;
    expect(verifyStripeSignature('{"id":"evt_2"}', header, secret, t)).toBe(false);
    expect(verifyStripeSignature(payload, header, 'whsec_other', t)).toBe(false);
    expect(verifyStripeSignature(payload, header, secret, t + 301)).toBe(false);
    expect(verifyStripeSignature(payload, undefined, secret, t)).toBe(false);
    expect(verifyStripeSignature(payload, `v1=${sign(t)}`, secret, t)).toBe(false);
    expect(verifyStripeSignature(payload, `t=${t},v1=zz`, secret, t)).toBe(false);
  });
});

describe('keyProblem', () => {
  it('solo acepta claves de prueba', () => {
    expect(keyProblem(undefined)).toBe('missing');
    expect(keyProblem('sk_live_abc')).toBe('live');
    expect(keyProblem('rk_live_abc')).toBe('live');
    expect(keyProblem('pk_test_abc')).toBe('invalid');
    expect(keyProblem('sk_test_abc 123')).toBe('invalid');
    expect(keyProblem('sk_test_51Abc')).toBeNull();
    expect(keyProblem('rk_test_51Abc')).toBeNull();
  });
});

describe('subscriptionState', () => {
  const end = new Date('2026-12-26T00:00:00Z');
  const now = new Date('2026-11-26T00:00:00Z');

  it('activa y renovándose: sin fecha de fin', () => {
    expect(subscriptionState({ status: 'active', cancelAtPeriodEnd: false, currentPeriodEnd: end, endedAt: null }, now)).toEqual({
      status: SubscriptionStatus.ACTIVE,
      endsAt: null,
    });
  });

  it('cancelada al final del periodo: termina sola en esa fecha', () => {
    expect(subscriptionState({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: end, endedAt: null }, now)).toEqual({
      status: SubscriptionStatus.ACTIVE,
      endsAt: end,
    });
  });

  it('past_due conserva el plan (Stripe reintenta el cobro)', () => {
    expect(subscriptionState({ status: 'past_due', cancelAtPeriodEnd: false, currentPeriodEnd: end, endedAt: null }, now).status).toBe(
      SubscriptionStatus.ACTIVE,
    );
  });

  it('cancelada, impagada o incompleta: sin plan', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired']) {
      expect(subscriptionState({ status, cancelAtPeriodEnd: false, currentPeriodEnd: end, endedAt: null }, now)).toEqual({
        status: SubscriptionStatus.CANCELED,
        endsAt: now,
      });
    }
  });
});

describe('ayudas', () => {
  it('addMonths no se pasa de mes (31 ene + 1 = 28 feb)', () => {
    expect(addMonths(new Date('2027-01-31T10:00:00Z'), 1).toISOString()).toBe('2027-02-28T10:00:00.000Z');
    expect(addMonths(new Date('2026-11-26T00:00:00Z'), 12).toISOString()).toBe('2027-11-26T00:00:00.000Z');
  });

  it('planPrice y toInterval', () => {
    const plan = { priceCents: 499, annualPriceCents: 4990 };
    expect(planPrice(plan, BillingInterval.MONTH)).toBe(499);
    expect(planPrice(plan, BillingInterval.YEAR)).toBe(4990);
    expect(toInterval('month')).toBe(BillingInterval.MONTH);
    expect(toInterval('year')).toBe(BillingInterval.YEAR);
    expect(toInterval('week')).toBeNull();
  });

  it('paymentStatus según lo reembolsado', () => {
    expect(paymentStatus(499, 0)).toBe(PaymentStatus.PAID);
    expect(paymentStatus(499, 100)).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    expect(paymentStatus(499, 499)).toBe(PaymentStatus.REFUNDED);
  });
});

describe('safeInvoiceUrl', () => {
  it('acepta facturas de invoice.stripe.com y pay.stripe.com por https', () => {
    expect(safeInvoiceUrl('https://invoice.stripe.com/i/acct_123/test_abc?s=ap')).toBe(
      'https://invoice.stripe.com/i/acct_123/test_abc?s=ap',
    );
    expect(safeInvoiceUrl('https://pay.stripe.com/invoice/acct_123/test_abc')).toBe(
      'https://pay.stripe.com/invoice/acct_123/test_abc',
    );
  });

  it('rechaza vacíos, otros tipos, http, otros dominios y trucos con el host', () => {
    expect(safeInvoiceUrl(null)).toBeNull();
    expect(safeInvoiceUrl(undefined)).toBeNull();
    expect(safeInvoiceUrl('')).toBeNull();
    expect(safeInvoiceUrl(42)).toBeNull();
    expect(safeInvoiceUrl('no es una url')).toBeNull();
    expect(safeInvoiceUrl('http://invoice.stripe.com/i/x')).toBeNull();
    expect(safeInvoiceUrl('javascript:alert(1)')).toBeNull();
    expect(safeInvoiceUrl('https://stripe.com/i/x')).toBeNull();
    expect(safeInvoiceUrl('https://evil.com/invoice.stripe.com')).toBeNull();
    expect(safeInvoiceUrl('https://invoice.stripe.com.evil.com/i/x')).toBeNull();
    expect(safeInvoiceUrl('https://invoice.stripe.com@evil.com/i/x')).toBeNull();
    expect(safeInvoiceUrl('https://user:pass@invoice.stripe.com/i/x')).toBeNull();
    expect(safeInvoiceUrl('https://invoice.stripe.com:8443/i/x')).toBeNull();
    expect(safeInvoiceUrl(`https://invoice.stripe.com/${'a'.repeat(500)}`)).toBeNull();
  });
});
