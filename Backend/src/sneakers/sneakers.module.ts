import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { GarmentTypesModule } from '../garment-types/garment-types.module';
import { PlansModule } from '../plans/plans.module';
import { WishlistModule } from '../wishlist/wishlist.module';
import { SneakersController } from './sneakers.controller';
import { SneakersService } from './sneakers.service';

@Module({
  imports: [PlansModule, GarmentTypesModule, AssetsModule, WishlistModule],
  controllers: [SneakersController],
  providers: [SneakersService],
})
export class SneakersModule {}
