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
import {
  CreateSneakerDto,
  ListSneakersQueryDto,
  SneakerCardDto,
  UpdateSneakerDto,
  WearDto,
} from './dto/sneakers.dto';
import { SneakersService } from './sneakers.service';

/** SNEAKER COLLECTION: tus zapatillas (y las que quieres), con ficha y estadísticas. */
@ApiTags('sneakers')
@ApiBearerAuth()
@Controller('sneakers')
export class SneakersController {
  constructor(private readonly sneakers: SneakersService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: ListSneakersQueryDto,
  ) {
    return this.sneakers.list(user.id, q);
  }

  /** Dashboard de la colección. */
  @Get('stats')
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.sneakers.stats(user.id);
  }

  /** Zapatillas del armario sin ficha (para añadirlas sin duplicarlas). */
  @Get('candidates')
  candidates(@CurrentUser() user: AuthenticatedUser) {
    return this.sneakers.candidates(user.id);
  }

  /** Añade la ficha a unas zapatillas que ya están en tu armario. */
  @Post('adopt/:itemId')
  adopt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: SneakerCardDto,
  ) {
    return this.sneakers.adopt(user.id, itemId, dto);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSneakerDto,
  ) {
    return this.sneakers.create(user.id, dto);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.sneakers.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSneakerDto,
  ) {
    return this.sneakers.update(user.id, id, dto);
  }

  /** `?keepItem=true`: solo quita la ficha (la prenda sigue en tu armario). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('keepItem') keepItem?: string,
  ): Promise<void> {
    await this.sneakers.remove(user.id, id, keepItem === 'true');
  }

  /** +1 / -1 uso apuntado a mano. */
  @Post(':id/wear')
  @HttpCode(HttpStatus.OK)
  wear(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WearDto,
  ) {
    return this.sneakers.wear(user.id, id, dto.delta);
  }
}
