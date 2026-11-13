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
import {
  CreateWishlistItemDto,
  ListWishlistQueryDto,
  MoveToWardrobeDto,
  RecordPriceDto,
  UpdateBudgetDto,
  UpdateWishlistItemDto,
} from './dto/wishlist.dto';
import { WishlistService } from './wishlist.service';

/** WISHLIST: lo que quieres comprar, con precios y presupuesto. */
@ApiTags('wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ListWishlistQueryDto,
  ) {
    return this.wishlist.list(user.id, q);
  }

  /** Presupuesto y cifras. */
  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.wishlist.summary(user.id);
  }

  @Put('budget')
  budget(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateBudgetDto) {
    return this.wishlist.updateBudget(user.id, dto);
  }

  /** Pide precios a los servicios de seguimiento (hoy no hay ninguno configurado). */
  @Post('prices/refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@CurrentUser() user: AuthenticatedUser) {
    return this.wishlist.refreshTracked(user.id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWishlistItemDto,
  ) {
    return this.wishlist.create(user.id, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.wishlist.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWishlistItemDto,
  ) {
    return this.wishlist.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.wishlist.remove(user.id, id);
  }

  /** Historial de precios completo. */
  @Get(':id/prices')
  prices(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.wishlist.prices(user.id, id);
  }

  /** Apunta un precio nuevo (pasa a ser el actual). */
  @Post(':id/prices')
  recordPrice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RecordPriceDto,
  ) {
    return this.wishlist.recordPrice(user.id, id, dto);
  }

  @Delete(':id/prices/:priceId')
  removePrice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('priceId', new ParseUUIDPipe()) priceId: string,
  ) {
    return this.wishlist.removePrice(user.id, id, priceId);
  }

  /** Comprado: pasa al armario. */
  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: MoveToWardrobeDto,
  ) {
    return this.wishlist.moveToWardrobe(user.id, id, dto);
  }
}
