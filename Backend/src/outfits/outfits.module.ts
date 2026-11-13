import { Module } from '@nestjs/common';
import { PlansModule } from '../plans/plans.module';
import { OutfitsController } from './outfits.controller';
import { OutfitsService } from './outfits.service';
import { RatingController } from './rating/rating.controller';
import { RatingService } from './rating/rating.service';
import { OUTFIT_RATING_ENGINE } from './rating/rating.types';
import { RulesRatingEngine } from './rating/rules-engine';

@Module({
  imports: [PlansModule],
  // RatingController va primero: sus rutas fijas (/outfits/ratings/...) no
  // deben chocar con /outfits/:id.
  controllers: [RatingController, OutfitsController],
  providers: [
    OutfitsService,
    RatingService,
    // Motor de OUTFIT RATING. Para usar otro (p. ej. uno con IA que devuelva
    // el mismo RatingResult), basta con cambiar esta clase.
    { provide: OUTFIT_RATING_ENGINE, useClass: RulesRatingEngine },
  ],
  exports: [RatingService],
})
export class OutfitsModule {}
