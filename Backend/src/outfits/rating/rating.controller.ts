import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RatingTrigger } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  RatingCompareQueryDto,
  RatingHistoryQueryDto,
  RatingPreviewDto,
} from '../dto/rating.dto';
import { RatingService } from './rating.service';

/** OUTFIT RATING: nota automática de 0 a 100 de tus outfits. */
@ApiTags('outfits')
@ApiBearerAuth()
@Controller('outfits')
export class RatingController {
  constructor(private readonly ratings: RatingService) {}

  /** Nota de lo que tienes puesto en el vestidor, sin guardar nada. */
  @Post('ratings/preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RatingPreviewDto,
  ) {
    return this.ratings.preview(user.id, dto);
  }

  /** Compara de 2 a 4 outfits (`?ids=a,b`). */
  @Get('ratings/compare')
  compare(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: RatingCompareQueryDto,
  ) {
    return this.ratings.compare(user.id, query.ids);
  }

  /** Última nota del outfit (con `stale` si ha cambiado algo desde entonces). */
  @Get(':id/rating')
  current(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.ratings.current(user.id, id);
  }

  /** Vuelve a calcular la nota (botón «Recalcular»). */
  @Post(':id/rating')
  @HttpCode(HttpStatus.OK)
  recalc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.ratings.rate(user.id, id, RatingTrigger.MANUAL);
  }

  /** Historial de notas (la más reciente primero). */
  @Get(':id/ratings')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: RatingHistoryQueryDto,
  ) {
    return this.ratings.history(user.id, id, query.limit);
  }
}
