import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { GarmentTypesModule } from '../garment-types/garment-types.module';
import { PlansModule } from '../plans/plans.module';
import { PRICE_TRACKERS, PriceTracker } from './price-tracking';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [PlansModule, GarmentTypesModule, AssetsModule],
  controllers: [WishlistController],
  providers: [
    WishlistService,
    // Servicios de seguimiento de precios: ninguno todavía (ver price-tracking.ts).
    { provide: PRICE_TRACKERS, useValue: [] as PriceTracker[] },
  ],
  exports: [WishlistService],
})
export class WishlistModule {}
