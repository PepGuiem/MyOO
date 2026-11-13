import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LimitedResource, Prisma } from '@prisma/client';
import { paginate, PaginatedResult, toSkipTake } from '../common/pagination';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PlansService } from '../plans/plans.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWardrobeDto } from './dto/create-wardrobe.dto';
import { UpdateWardrobeDto } from './dto/update-wardrobe.dto';

export const wardrobeSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  // Solo las prendas que tienes (las de la wishlist no cuentan).
  _count: { select: { items: { where: { wishlistStatus: null } } } },
} satisfies Prisma.WardrobeSelect;

type WardrobeRow = Prisma.WardrobeGetPayload<{ select: typeof wardrobeSelect }>;

/** Lo que devuelve la API: _count se convierte en itemCount. */
export type WardrobeView = Omit<WardrobeRow, '_count'> & { itemCount: number };

function toView({ _count, ...rest }: WardrobeRow): WardrobeView {
  return { ...rest, itemCount: _count.items };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class WardrobesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: PlansService,
  ) {}

  async findAll(
    userId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<WardrobeView>> {
    const where: Prisma.WardrobeWhereInput = { userId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.wardrobe.findMany({
        where,
        select: wardrobeSelect,
        orderBy: { createdAt: 'asc' },
        ...toSkipTake(query.page, query.pageSize),
      }),
      this.prisma.wardrobe.count({ where }),
    ]);
    return paginate(rows.map(toView), total, query.page, query.pageSize);
  }

  async findOne(userId: string, id: string): Promise<WardrobeView> {
    // Filtrar por id Y userId: si el armario es de otro usuario, para este
    // usuario "no existe" (404). No revelamos que existe.
    const row = await this.prisma.wardrobe.findFirst({
      where: { id, userId },
      select: wardrobeSelect,
    });
    if (!row) throw new NotFoundException('Wardrobe not found');
    return toView(row);
  }

  async create(userId: string, dto: CreateWardrobeDto): Promise<WardrobeView> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        await this.plans.assertCanCreate(tx, userId, LimitedResource.WARDROBES);
        return tx.wardrobe.create({
          data: {
            userId,
            name: dto.name,
            description: dto.description ?? null,
          },
          select: wardrobeSelect,
        });
      });
      return toView(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'You already have a wardrobe with this name',
        );
      }
      throw error;
    }
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateWardrobeDto,
  ): Promise<WardrobeView> {
    await this.findOne(userId, id);
    try {
      const row = await this.prisma.wardrobe.update({
        where: { id_userId: { id, userId } },
        data: {
          // `?? undefined`: si llega null en un campo obligatorio, se ignora.
          name: dto.name ?? undefined,
          description: dto.description,
        },
        select: wardrobeSelect,
      });
      return toView(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'You already have a wardrobe with this name',
        );
      }
      throw error;
    }
  }

  /** Borra el armario y, en cascada, sus prendas (y esas prendas de los outfits). */
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.wardrobe.deleteMany({
      where: { id, userId },
    });
    if (count === 0) throw new NotFoundException('Wardrobe not found');
  }
}
