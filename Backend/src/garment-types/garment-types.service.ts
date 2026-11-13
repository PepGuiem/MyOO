import { STYLING_FIELDS, stylingKeysFor, type StylingKey } from '../outfits/styling';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { optionsFor, type ModelCustomizationOptions } from '../customization/customization-options';
import { PrismaService } from '../prisma/prisma.service';
import { AttributeSchema, parseAttributeSchema } from './attribute-schema';

export const garmentTypeSelect = {
  id: true,
  code: true,
  name: true,
  category: true,
  modelKey: true,
  attributeSchema: true,
  sortOrder: true,
} satisfies Prisma.GarmentTypeSelect;

/** Versión reducida para incluir dentro de prendas y outfits. */
export const garmentTypeSummarySelect = {
  id: true,
  code: true,
  name: true,
  category: true,
  modelKey: true,
} satisfies Prisma.GarmentTypeSelect;

/** Añade las opciones de personalización (salen del código, no de la BD). */
function withCustomizationOptions<T extends { modelKey: string }>(
  type: T,
): T & { customizationOptions: ModelCustomizationOptions; stylingOptions: StylingOption[] } {
  return { ...type, customizationOptions: optionsFor(type.modelKey), stylingOptions: stylingOptionsFor(type.modelKey) };
}

/** Cómo se puede llevar la prenda en un outfit (por dentro, remangada...). */
export interface StylingOption {
  key: StylingKey;
  label: string;
  values: { value: string; label: string }[];
}

function stylingOptionsFor(modelKey: string): StylingOption[] {
  return stylingKeysFor(modelKey).map((key) => ({
    key,
    label: STYLING_FIELDS[key].label,
    values: Object.entries(STYLING_FIELDS[key].values).map(([value, label]) => ({ value, label })),
  }));
}

@Injectable()
export class GarmentTypesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const types = await this.prisma.garmentType.findMany({
      select: garmentTypeSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return types.map(withCustomizationOptions);
  }

  async findOne(id: string) {
    const type = await this.prisma.garmentType.findUnique({
      where: { id },
      select: garmentTypeSelect,
    });
    if (!type) throw new NotFoundException('Garment type not found');
    return withCustomizationOptions(type);
  }

  /** modelKey del tipo (para validar la personalización). 400 si no existe. */
  async getModelKeyOrThrow(id: string, db: Prisma.TransactionClient = this.prisma): Promise<string> {
    const type = await db.garmentType.findUnique({ where: { id }, select: { modelKey: true } });
    if (!type) throw new BadRequestException('garmentTypeId does not exist');
    return type.modelKey;
  }

  /**
   * Devuelve el esquema de atributos ya comprobado.
   * Lanza 400 si el tipo no existe (es un dato del cuerpo de la petición).
   */
  async getSchemaOrThrow(
    id: string,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<AttributeSchema> {
    const type = await db.garmentType.findUnique({
      where: { id },
      select: { attributeSchema: true },
    });
    if (!type) throw new BadRequestException('garmentTypeId does not exist');
    return parseAttributeSchema(type.attributeSchema);
  }
}
