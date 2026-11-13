import { Module } from '@nestjs/common';
import { PlansModule } from '../plans/plans.module';
import { WardrobesController } from './wardrobes.controller';
import { WardrobesService } from './wardrobes.service';

@Module({
  imports: [PlansModule],
  controllers: [WardrobesController],
  providers: [WardrobesService],
})
export class WardrobesModule {}
