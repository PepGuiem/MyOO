-- Pagos de suscripciones con Stripe (modo prueba)

-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('SIMULATED', 'STRIPE', 'ADMIN');
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" VARCHAR(64);

ALTER TABLE "Plan" ADD COLUMN "annualPriceCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stripeProductId" VARCHAR(64),
ADD COLUMN "customizedAt" TIMESTAMP(3);

ALTER TABLE "Subscription" ADD COLUMN "source" "SubscriptionSource" NOT NULL DEFAULT 'SIMULATED',
ADD COLUMN "interval" "BillingInterval",
ADD COLUMN "stripeSubscriptionId" VARCHAR(64),
ADD COLUMN "stripeStatus" VARCHAR(32),
ADD COLUMN "currentPeriodEnd" TIMESTAMP(3),
ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "subscriptionId" UUID,
    "planId" UUID,
    "interval" "BillingInterval",
    "amountCents" INTEGER NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "stripeInvoiceId" VARCHAR(64),
    "stripePaymentIntentId" VARCHAR(64),
    "stripeChargeId" VARCHAR(64),
    "failureReason" VARCHAR(300),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeEvent" (
    "id" VARCHAR(255) NOT NULL,
    "type" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
CREATE UNIQUE INDEX "Plan_stripeProductId_key" ON "Plan"("stripeProductId");
CREATE INDEX "Subscription_stripeSubscriptionId_idx" ON "Subscription"("stripeSubscriptionId");
CREATE UNIQUE INDEX "Payment_stripeInvoiceId_key" ON "Payment"("stripeInvoiceId");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
CREATE INDEX "Payment_stripeChargeId_idx" ON "Payment"("stripeChargeId");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Precio anual por defecto: 10 mensualidades (2 meses gratis).
UPDATE "Plan" SET "annualPriceCents" = "priceCents" * 10 WHERE "priceCents" > 0;
