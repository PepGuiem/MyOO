import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';
import { AdminGuard } from '../admin/admin.guard';
import { RANGES, type RangeKey } from './metrics';
import { MonitoringService } from './monitoring.service';

class LiveQueryDto {
  @IsOptional()
  @IsIn(Object.keys(RANGES))
  range: RangeKey = '1h';
}

class ActivityQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30, 90])
  days = 30;
}

/** Monitor: solo cuentas con rol ADMIN. Las rutas /admin/monitor no se cuentan en las métricas. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin/monitor')
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  /** Estado, tráfico, proceso, tiempo real, rutas y errores (para refrescar cada pocos segundos). */
  @Get('live')
  live(@Query() q: LiveQueryDto) {
    return this.monitoring.live(q.range);
  }

  @Get('database')
  database() {
    return this.monitoring.database();
  }

  @Get('activity')
  activity(@Query() q: ActivityQueryDto) {
    return this.monitoring.activity(q.days);
  }

  @Get('feed')
  feed() {
    return this.monitoring.feed();
  }
}
