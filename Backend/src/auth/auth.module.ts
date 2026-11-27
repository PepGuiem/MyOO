import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import type { AppConfig } from '../config/env.validation';
import { AuthController } from './auth.controller';
import { AuthSessionController } from './auth-session.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { EmailAuthService } from './email-auth.service';
import { PasswordService } from './password.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN_SECONDS', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController, AuthSessionController],
  providers: [
    AuthService,
    PasswordService,
    // Contraseña olvidada y verificar el email (usa MailService, global).
    EmailAuthService,
    // Todos los endpoints de la app quedan protegidos salvo los @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  // El login con Google/Apple (módulo oauth) emite los tokens con AuthService.
  // JwtModule: el ticket del WebSocket lee cuándo caduca el token.
  exports: [AuthService, PasswordService, JwtModule],
})
export class AuthModule {}
