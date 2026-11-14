import { Module } from '@nestjs/common';
import { SocialModule } from '../social/social.module';
import { BattlesController } from './battles.controller';
import { BattlesService } from './battles.service';

@Module({
  imports: [SocialModule],
  controllers: [BattlesController],
  providers: [BattlesService],
})
export class BattlesModule {}
