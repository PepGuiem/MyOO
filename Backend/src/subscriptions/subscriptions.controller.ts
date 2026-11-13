import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ChangePlanDto } from './dto/change-plan.dto';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  /** Historial de suscripciones del usuario autenticado. */
  @Get()
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptions.history(user.id);
  }

  /** Cambia de plan (simulado, sin pagos). */
  @Post('change-plan')
  changePlan(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePlanDto,
  ) {
    return this.subscriptions.changePlan(user.id, dto);
  }
}
