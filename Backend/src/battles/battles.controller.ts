import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { BattlesService } from './battles.service';
import {
  AcceptBattleDto,
  CreateBattleDto,
  ListBattlesQueryDto,
  VoteBattleDto,
} from './dto/battles.dto';

/** STREETWEAR BATTLES: retos 1 vs 1 entre outfits, votados por la comunidad. */
@ApiTags('battles')
@ApiBearerAuth()
@Controller('battles')
export class BattlesController {
  constructor(private readonly battles: BattlesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ListBattlesQueryDto,
  ) {
    return this.battles.list(user.id, q);
  }

  /** Retos recibidos, batallas en juego y tu récord. */
  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.battles.summary(user.id);
  }

  /** Ranking de ganadores. */
  @Get('leaderboard')
  leaderboard(@CurrentUser() user: AuthenticatedUser) {
    return this.battles.leaderboard(user.id);
  }

  /** Reta a alguien (opponentId) o deja el reto abierto. */
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBattleDto) {
    return this.battles.create(user.id, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.battles.findOne(user.id, id);
  }

  /** Acepta el reto con uno de tus outfits: empieza la votación (48 h). */
  @Post(':id/accept')
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptBattleDto,
  ) {
    return this.battles.accept(user.id, id, dto.outfitId);
  }

  @Post(':id/decline')
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.battles.decline(user.id, id);
  }

  /** Retira tu reto mientras nadie lo haya aceptado. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.battles.cancel(user.id, id);
  }

  /** Un voto por persona; nunca en tu propia batalla. */
  @Post(':id/vote')
  vote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoteBattleDto,
  ) {
    return this.battles.vote(user.id, id, dto.side);
  }
}
