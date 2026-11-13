import { Module } from '@nestjs/common';
import { SocialModule } from '../social/social.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [SocialModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
