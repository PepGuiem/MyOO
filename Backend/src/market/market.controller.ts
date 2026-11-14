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
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  ContactListingDto,
  CreateListingDto,
  ListListingsQueryDto,
  UpdateListingDto,
} from './dto/market.dto';
import { MarketEnabledGuard } from './market-enabled.guard';
import { MarketService } from './market.service';

/** STREET MARKET: anuncios para vender o intercambiar. El trato se cierra por el chat; sin pagos en la app. */
@ApiTags('market')
@ApiBearerAuth()
@Controller('market')
@UseGuards(MarketEnabledGuard)
export class MarketController {
  constructor(private readonly market: MarketService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ListListingsQueryDto,
  ) {
    return this.market.list(user.id, q);
  }

  /** Tus anuncios por estado, tus guardados y el límite. */
  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.market.summary(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateListingDto,
  ) {
    return this.market.create(user.id, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.market.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateListingDto,
  ) {
    return this.market.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.market.remove(user.id, id);
  }

  @Post(':id/favorite')
  @HttpCode(HttpStatus.OK)
  favorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.market.setFavorite(user.id, id, true);
  }

  @Delete(':id/favorite')
  unfavorite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.market.setFavorite(user.id, id, false);
  }

  /** Escribe a quien vende (abre el chat 1 a 1 con un primer mensaje). */
  @Post(':id/contact')
  contact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContactListingDto,
  ) {
    return this.market.contact(user.id, id, dto.message);
  }

  @Get(':id/photos/:assetId')
  async photo(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { data, mimeType } = await this.market.photo(user.id, id, assetId);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; sandbox",
    );
    return new StreamableFile(data, {
      type: mimeType,
      length: data.length,
      disposition: 'inline',
    });
  }
}
