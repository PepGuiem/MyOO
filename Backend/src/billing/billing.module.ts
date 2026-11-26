import { Module } from '@nestjs/common';
import { AdminGuard } from '../admin/admin.guard';
import { PlansModule } from '../plans/plans.module';
import { AdminBillingService } from './admin-billing.service';
import { BillingConfig } from './billing.config';
import { AdminBillingController, BillingController } from './billing.controller';
import { BillingService } from './billing.service';

/** Pagos de suscripciones con Stripe (modo prueba) y su panel de admin. */
@Module({
  imports: [PlansModule],
  controllers: [BillingController, AdminBillingController],
  providers: [BillingConfig, BillingService, AdminBillingService, AdminGuard],
  exports: [BillingService, BillingConfig],
})
export class BillingModule {}
