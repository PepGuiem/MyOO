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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateWardrobeItemDto } from './dto/create-wardrobe-item.dto';
import {
  ListWardrobeItemsQueryDto,
  WardrobeFacetsQueryDto,
} from './dto/list-wardrobe-items-query.dto';
import { UpdateWardrobeItemDto } from './dto/update-wardrobe-item.dto';
import { WardrobeItemsService } from './wardrobe-items.service';

@ApiTags('wardrobe-items')
@ApiBearerAuth()
@Controller('wardrobe-items')
export class WardrobeItemsController {
  constructor(private readonly items: WardrobeItemsService) {}

  /** Prendas del usuario (de todos sus armarios), con filtros y paginación. */
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListWardrobeItemsQueryDto,
  ) {
    return this.items.findAll(user.id, query);
  }

  /** Resumen para la barra de información y los filtros del armario. */
  @Get('facets')
  facets(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WardrobeFacetsQueryDto,
  ) {
    return this.items.facets(user.id, query.wardrobeId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWardrobeItemDto,
  ) {
    return this.items.create(user.id, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.items.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWardrobeItemDto,
  ) {
    return this.items.update(user.id, id, dto);
  }

  /** Marca la prenda como favorita (idempotente). */
  @Put(':id/favorite')
  favorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.items.setFavorite(user.id, id, true);
  }

  /** Quita la prenda de favoritas (idempotente). */
  @Delete(':id/favorite')
  unfavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.items.setFavorite(user.id, id, false);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.items.remove(user.id, id);
  }
}
