import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AblyService } from './ably.service';
import { RealtimeController } from './realtime.controller';
import { RealtimeGateway } from './realtime.gateway';
import { RealtimeService } from './realtime.service';

/** WebSocket, Ably (opcional) y envío de eventos en tiempo real (global: lo usan seguidores y chats). */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [RealtimeService, RealtimeGateway, AblyService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
