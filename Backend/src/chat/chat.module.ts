import { Module } from '@nestjs/common';
import { SocialModule } from '../social/social.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

/** Chats 1 a 1 y de grupo (los avisos en tiempo real van por RealtimeModule). */
@Module({
  imports: [SocialModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
