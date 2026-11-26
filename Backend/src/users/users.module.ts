import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { OAuthModule } from '../oauth/oauth.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // AuthModule exporta PasswordService (confirmar con la contraseña);
  // OAuthModule, las cuentas conectadas y la prueba de identidad.
  imports: [AuthModule, AssetsModule, OAuthModule, BillingModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
