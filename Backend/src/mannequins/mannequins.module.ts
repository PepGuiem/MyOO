import { Module } from '@nestjs/common';
import { PlansModule } from '../plans/plans.module';
import { MannequinsController } from './mannequins.controller';
import { MannequinsService } from './mannequins.service';

@Module({
  imports: [PlansModule],
  controllers: [MannequinsController],
  providers: [MannequinsService],
})
export class MannequinsModule {}
