import { PartialType } from '@nestjs/swagger';
import { CreateOutfitDto } from './create-outfit.dto';

/** Si se envía `items`, REEMPLAZA la lista completa de prendas del outfit. */
export class UpdateOutfitDto extends PartialType(CreateOutfitDto) {}
