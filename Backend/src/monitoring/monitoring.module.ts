import { Global, Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { MetricsService } from './metrics.service';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';

/**
 * Monitor para admins. Global porque el AuthGuard (actividad diaria) y la
 * configuración HTTP (métricas de cada petición) usan sus servicios.
 */
@Global()
@Module({
  controllers: [MonitoringController],
  providers: [MetricsService, ActivityService, MonitoringService],
  exports: [MetricsService, ActivityService],
})
export class MonitoringModule {}
