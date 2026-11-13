import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { LimitedResource, Prisma } from '@prisma/client';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMannequinDto, UpdateMannequinDto } from './dto/mannequin.dto';
import { normalizeMeasures, type MannequinMeasures } from './mannequin-measures';

export const mannequinSelect = {
  id: true,
  name: true,
  sex: true,
  measures: true,
  isDefault: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MannequinSelect;

export type MannequinView = Prisma.MannequinGetPayload<{ select: typeof mannequinSelect }>;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const NAME_TAKEN = 'You already have a mannequin with this name';

/**
 * Maniquíes personalizados (medidas reales). Cada usuario solo ve y toca los
 * suyos (todas las consultas filtran por userId). Cuántos puede tener lo
 * decide su plan (MANNEQUINS), comprobado en la misma transacción que crea.
 */
@Injectable()
export class MannequinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  findAll(userId: string): Promise<MannequinView[]> {
    return this.prisma.mannequin.findMany({
      where: { userId },
      select: mannequinSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string): Promise<MannequinView> {
    const row = await this.prisma.mannequin.findFirst({ where: { id, userId }, select: mannequinSelect });
    if (!row) throw new NotFoundException('Mannequin not found');
    return row;
  }

  async create(userId: string, dto: CreateMannequinDto): Promise<MannequinView> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.plans.assertCanCreate(tx, userId, LimitedResource.MANNEQUINS);
        // El primero de la cuenta queda como predeterminado.
        const first = (await tx.mannequin.count({ where: { userId } })) === 0;
        const isDefault = first || dto.isDefault === true;
        if (isDefault) await tx.mannequin.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
        return tx.mannequin.create({
          data: {
            userId,
            name: dto.name,
            sex: dto.sex,
            measures: normalizeMeasures(dto.measures as MannequinMeasures),
            isDefault,
          },
          select: mannequinSelect,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(NAME_TAKEN);
      throw error;
    }
  }

  async update(userId: string, id: string, dto: UpdateMannequinDto): Promise<MannequinView> {
    await this.findOne(userId, id);
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isDefault === true) {
          await tx.mannequin.updateMany({ where: { userId, isDefault: true, NOT: { id } }, data: { isDefault: false } });
        }
        return tx.mannequin.update({
          where: { id },
          data: {
            name: dto.name ?? undefined,
            sex: dto.sex ?? undefined,
            measures: dto.measures ? normalizeMeasures(dto.measures as MannequinMeasures) : undefined,
            isDefault: dto.isDefault ?? undefined,
          },
          select: mannequinSelect,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(NAME_TAKEN);
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.mannequin.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Mannequin not found');
  }
}
