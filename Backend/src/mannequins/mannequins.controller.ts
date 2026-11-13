import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateMannequinDto, UpdateMannequinDto } from './dto/mannequin.dto';
import { MannequinsService } from './mannequins.service';

@ApiTags('mannequins')
@ApiBearerAuth()
@Controller('mannequins')
export class MannequinsController {
  constructor(private readonly mannequins: MannequinsService) {}

  /** Los maniquíes de la cuenta (pocos: sin paginar). */
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.mannequins.findAll(user.id);
  }

  /** Crea un maniquí con medidas reales. 403 PlanLimitReached si el plan no da para más. */
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMannequinDto) {
    return this.mannequins.create(user.id, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.mannequins.findOne(user.id, id);
  }

  /** Cambia nombre, sexo, medidas o lo marca como predeterminado (isDefault: true). */
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMannequinDto,
  ) {
    return this.mannequins.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.mannequins.remove(user.id, id);
  }
}
