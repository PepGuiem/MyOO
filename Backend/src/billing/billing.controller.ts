import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { AdminGuard } from '../admin/admin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AdminBillingService } from './admin-billing.service';
import {
  AdminCancelDto,
  AdminPaymentsQueryDto,
  AssignPlanDto,
  CheckoutDto,
  ConfirmCheckoutDto,
  GiftMonthsDto,
  RefundDto,
  UpdatePlanDto,
} from './billing.dto';
import { BillingService } from './billing.service';

const uuid = new ParseUUIDPipe();

/** Pagos de la suscripción del usuario (Stripe, modo prueba). */
@ApiTags('billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Si los pagos están activos (para enseñar o no los botones). */
  @Public()
  @Get('config')
  config() {
    return this.billing.publicConfig();
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.me(user.id);
  }

  /** Devuelve la URL de Stripe Checkout a la que hay que ir. */
  @ApiBearerAuth()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    return this.billing.checkout(user.id, dto);
  }

  @ApiBearerAuth()
  @Post('checkout/confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConfirmCheckoutDto) {
    return this.billing.confirmCheckout(user.id, dto.sessionId);
  }

  /** Cambia de plan o de periodo (prorrateado); al gratis = cancelar al final del periodo. */
  @ApiBearerAuth()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('change')
  @HttpCode(HttpStatus.OK)
  change(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckoutDto) {
    return this.billing.changePlan(user.id, dto);
  }

  @ApiBearerAuth()
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.setCancelAtPeriodEnd(user.id, true);
  }

  @ApiBearerAuth()
  @Post('resume')
  @HttpCode(HttpStatus.OK)
  resume(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.setCancelAtPeriodEnd(user.id, false);
  }

  /** Webhook de Stripe: público, pero solo acepta eventos firmados con STRIPE_WEBHOOK_SECRET. */
  @Public()
  @ApiExcludeEndpoint()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    return this.billing.handleWebhook(req.rawBody, signature);
  }
}

/** Pagos y suscripciones en el panel de admin. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/billing')
export class AdminBillingController {
  constructor(private readonly admin: AdminBillingService) {}

  @Get('summary')
  summary() {
    return this.admin.summary();
  }

  @Get('payments')
  payments(@Query() q: AdminPaymentsQueryDto) {
    return this.admin.payments(q);
  }

  @Post('payments/:id/refund')
  @HttpCode(HttpStatus.OK)
  refund(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: RefundDto,
  ) {
    return this.admin.refund(me.id, id, dto);
  }

  @Get('users/:id')
  user(@Param('id', uuid) id: string) {
    return this.admin.user(id);
  }

  @Post('users/:id/plan')
  @HttpCode(HttpStatus.OK)
  assignPlan(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: AssignPlanDto,
  ) {
    return this.admin.assignPlan(me.id, id, dto);
  }

  @Post('users/:id/gift')
  @HttpCode(HttpStatus.OK)
  gift(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: GiftMonthsDto,
  ) {
    return this.admin.giftMonths(me.id, id, dto);
  }

  @Post('subscriptions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: AdminCancelDto,
  ) {
    return this.admin.cancelSubscription(me.id, id, dto);
  }

  @Get('plans')
  plans() {
    return this.admin.listPlans();
  }

  @Patch('plans/:id')
  updatePlan(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.admin.updatePlan(me.id, id, dto);
  }
}
