import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { AlternativesDto, GenerateOutfitsDto, InsightsQueryDto, StylistFeedbackDto } from './dto/stylist.dto';
import { StylistService } from './stylist.service';

/**
 * Estilista: outfits con tus prendas, cambios de una prenda, consejos y lo que
 * le falta a tu armario. Motor propio de reglas (sin servicios de IA externos).
 */
@ApiTags('stylist')
@ApiBearerAuth()
@Controller('stylist')
export class StylistController {
  constructor(private readonly stylist: StylistService) {}

  /** Estilos, ocasiones, tiempo y plataformas de compra. */
  @Get('vocabulary')
  vocabulary() {
    return this.stylist.vocabulary();
  }

  /**
   * Genera outfits completos con tus prendas, con por qué funcionan y consejos
   * («notas») que se pueden aceptar. Devuelve también las prendas usadas.
   */
  @Post('outfits')
  @HttpCode(HttpStatus.OK)
  generate(@CurrentUser() user: AuthenticatedUser, @Body() dto: GenerateOutfitsDto) {
    return this.stylist.generate(user.id, dto);
  }

  /** Prendas que pueden sustituir a una del outfit, de mejor a peor. */
  @Post('alternatives')
  @HttpCode(HttpStatus.OK)
  alternatives(@CurrentUser() user: AuthenticatedUser, @Body() dto: AlternativesDto) {
    return this.stylist.alternatives(user.id, dto);
  }

  /** Lo que le falta al armario y cifras (colores, estilos, prendas sin usar). */
  @Get('insights')
  insights(@CurrentUser() user: AuthenticatedUser, @Query() query: InsightsQueryDto) {
    return this.stylist.insights(user.id, query.wardrobeId);
  }

  /** Lo que haces con una propuesta (me gusta, guardar, rechazar, consejo aceptado...). Con esto aprende. */
  @Post('feedback')
  @HttpCode(HttpStatus.NO_CONTENT)
  feedback(@CurrentUser() user: AuthenticatedUser, @Body() dto: StylistFeedbackDto) {
    return this.stylist.feedback(user.id, dto);
  }
}
