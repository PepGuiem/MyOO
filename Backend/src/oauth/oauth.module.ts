import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuthModule } from '../auth/auth.module';
import { InstagramService } from './instagram.service';
import { OAuthConfig } from './oauth.config';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';

/** Login con Google y Apple, y cuentas conectadas (Instagram). */
@Module({
  imports: [AuthModule, AssetsModule],
  controllers: [OAuthController],
  providers: [OAuthConfig, OAuthService, InstagramService],
  exports: [OAuthService, InstagramService],
})
export class OAuthModule {}
