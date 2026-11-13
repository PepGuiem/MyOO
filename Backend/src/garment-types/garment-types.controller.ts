import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { GarmentTypesService } from './garment-types.service';

@ApiTags('garment-types')
@Public()
@Controller('garment-types')
export class GarmentTypesController {
  constructor(private readonly garmentTypes: GarmentTypesService) {}

  /** Tipos de prenda con su esquema de atributos (para pintar formularios). */
  @Get()
  findAll() {
    return this.garmentTypes.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.garmentTypes.findOne(id);
  }
}
