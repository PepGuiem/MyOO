import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AssetsModule } from './assets/assets.module';
import { AuthModule } from './auth/auth.module';
import { MannequinsModule } from './mannequins/mannequins.module';
import { OAuthModule } from './oauth/oauth.module';
import { AdminModule } from './admin/admin.module';
import { BillingModule } from './billing/billing.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ChatModule } from './chat/chat.module';
import { IdeasModule } from './ideas/ideas.module';
import { MailModule } from './mail/mail.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReleasesModule } from './releases/releases.module';
import { ReportsModule } from './reports/reports.module';
import { RealtimeModule } from './realtime/realtime.module';
import { SocialModule } from './social/social.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { AppConfig, validateEnv } from './config/env.validation';
import { GarmentTypesModule } from './garment-types/garment-types.module';
import { HealthController } from './health/health.controller';
import { AnalyticsModule } from './analytics/analytics.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { SneakersModule } from './sneakers/sneakers.module';
import { BattlesModule } from './battles/battles.module';
import { MarketModule } from './market/market.module';
import { CalendarModule } from './calendar/calendar.module';
import { OutfitsModule } from './outfits/outfits.module';
import { PlansModule } from './plans/plans.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { StylistModule } from './stylist/stylist.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UsersModule } from './users/users.module';
import { WardrobeItemsModule } from './wardrobe-items/wardrobe-items.module';
import { WardrobesModule } from './wardrobes/wardrobes.module';

@Module({
  imports: [
    // Lee .env, valida las variables y las deja disponibles en ConfigService.
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Límite de peticiones (se aplica en los endpoints de auth).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 10 }],
        // En los tests e2e hacemos muchos registros seguidos.
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),
    PrismaModule,
    StorageModule,
    // Correo (Resend, opcional): global, lo usan auth, billing y chat.
    MailModule,
    AuthModule,
    OAuthModule,
    UsersModule,
    PlansModule,
    SubscriptionsModule,
    BillingModule,
    GarmentTypesModule,
    WardrobesModule,
    WardrobeItemsModule,
    OutfitsModule,
    CalendarModule,
    AnalyticsModule,
    WishlistModule,
    SneakersModule,
    BattlesModule,
    MarketModule,
    MannequinsModule,
    AssetsModule,
    StylistModule,
    RealtimeModule,
    SocialModule,
    ChatModule,
    NotificationsModule,
    IdeasModule,
    ReportsModule,
    ReleasesModule,
    AdminModule,
    MonitoringModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true, // elimina campos que no estén en el DTO...
        forbidNonWhitelisted: true, // ...y además devuelve 400 si llegan
        transform: true, // convierte el JSON en instancias de los DTOs
      }),
    },
  ],
})
export class AppModule {}
