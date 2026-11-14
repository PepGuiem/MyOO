import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { ChatModule } from '../chat/chat.module';
import { MarketEnabledGuard } from './market-enabled.guard';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';

@Module({
  imports: [AssetsModule, ChatModule],
  controllers: [MarketController],
  providers: [MarketService, MarketEnabledGuard],
})
export class MarketModule {}
