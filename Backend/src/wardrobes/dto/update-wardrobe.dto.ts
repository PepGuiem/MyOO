import { PartialType } from '@nestjs/swagger';
import { CreateWardrobeDto } from './create-wardrobe.dto';

/** Todos los campos de CreateWardrobeDto pasan a ser opcionales. */
export class UpdateWardrobeDto extends PartialType(CreateWardrobeDto) {}
