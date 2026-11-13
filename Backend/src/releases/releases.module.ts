import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { paginate, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

export const releaseSelect = {
  id: true,
  title: true,
  version: true,
  body: true,
  tags: true,
  publishedAt: true,
} as const;

class ReleasesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  page = 1;
}

/** Página «Novedades»: solo lo publicado (los borradores los ve el admin). */
@ApiTags('releases')
@ApiBearerAuth()
@Controller('releases')
class ReleasesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() q: ReleasesQueryDto) {
    const where = { publishedAt: { not: null } };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.release.findMany({
        where,
        select: releaseSelect,
        orderBy: { publishedAt: 'desc' },
        ...toSkipTake(q.page, 20),
      }),
      this.prisma.release.count({ where }),
    ]);
    return paginate(rows, total, q.page, 20);
  }
}

@Module({ controllers: [ReleasesController] })
export class ReleasesModule {}
