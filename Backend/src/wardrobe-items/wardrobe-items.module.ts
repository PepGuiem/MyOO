import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { GarmentTypesModule } from '../garment-types/garment-types.module';
import { PlansModule } from '../plans/plans.module';
import { WardrobeItemsController } from './wardrobe-items.controller';
import { WardrobeItemsService } from './wardrobe-items.service';

@Module({
  imports: [PlansModule, GarmentTypesModule, AssetsModule],
  controllers: [WardrobeItemsController],
  providers: [WardrobeItemsService],
})
export class WardrobeItemsModule {}
