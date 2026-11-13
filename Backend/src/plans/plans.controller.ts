import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PlansService } from './plans.service';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** Lista de planes disponibles con sus límites. */
  @Public()
  @Get()
  findAll() {
    return this.plans.findActivePlans();
  }

  /** Plan efectivo del usuario, sus límites y cuánto ha usado de cada uno. */
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.plans.getUsage(user.id);
  }
}
