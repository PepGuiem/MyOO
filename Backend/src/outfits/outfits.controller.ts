import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateOutfitDto } from './dto/create-outfit.dto';
import { ListOutfitsQueryDto } from './dto/list-outfits-query.dto';
import { UpdateOutfitDto } from './dto/update-outfit.dto';
import { OutfitsService } from './outfits.service';

@ApiTags('outfits')
@ApiBearerAuth()
@Controller('outfits')
export class OutfitsController {
  constructor(private readonly outfits: OutfitsService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOutfitsQueryDto,
  ) {
    return this.outfits.findAll(user.id, query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOutfitDto) {
    return this.outfits.create(user.id, dto);
  }

  /** Total, favoritos y cuántos hay de cada estilo (para los filtros). */
  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.outfits.summary(user.id);
  }

  /** Copia del outfit (cuenta para el límite del plan). */
  @Post(':id/duplicate')
  duplicate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.outfits.duplicate(user.id, id);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.outfits.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOutfitDto,
  ) {
    return this.outfits.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.outfits.remove(user.id, id);
  }
}
