-- Enlace a la factura de Stripe de cada pago (opcional)

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "invoiceUrl" VARCHAR(500);
