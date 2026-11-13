import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

/** STYLE ANALYTICS: tus hábitos de vestir (solo tus datos). */
@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  overview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: AnalyticsQueryDto,
  ) {
    return this.analytics.overview(user.id, q.tz);
  }
}
