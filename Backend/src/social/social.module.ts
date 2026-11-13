import { Module } from '@nestjs/common';
import { RelationsService } from './relations.service';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

/** Perfiles de otras personas, seguidores, solicitudes y bloqueos. */
@Module({
  controllers: [SocialController],
  providers: [SocialService, RelationsService],
  exports: [RelationsService],
})
export class SocialModule {}
