import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IdeaStatus, Prisma } from '@prisma/client';
import { paginate, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { toBrief, userBriefSelect } from '../social/user-brief';
import { CreateIdeaDto, ListIdeasDto } from './ideas.dto';

const PAGE_SIZE = 20;
/** Ideas por persona y día (frena el spam). */
const MAX_IDEAS_PER_DAY = 5;

export const ideaSelect = {
  id: true,
  title: true,
  body: true,
  category: true,
  status: true,
  adminReply: true,
  repliedAt: true,
  pinned: true,
  hidden: true,
  duplicateOfId: true,
  voteCount: true,
  createdAt: true,
  updatedAt: true,
  author: { select: userBriefSelect },
} satisfies Prisma.IdeaSelect;

type IdeaRow = Prisma.IdeaGetPayload<{ select: typeof ideaSelect }>;

export function toIdeaView(i: IdeaRow, viewerId: string, voted: boolean) {
  return {
    ...i,
    author: i.author ? toBrief(i.author) : null,
    mine: i.author?.id === viewerId,
    votedByMe: voted,
  };
}

/**
 * Tablón de ideas: cualquiera propone y vota (un voto por persona e idea).
 * El estado y la respuesta los pone un admin (módulo admin).
 */
@Injectable()
export class IdeasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(viewerId: string, q: ListIdeasDto, isAdmin = false) {
    const where: Prisma.IdeaWhereInput = {
      // Las ocultas solo las ven su autor y los admins.
      ...(isAdmin ? {} : { OR: [{ hidden: false }, { authorId: viewerId }] }),
      ...(q.sort === 'mine' ? { authorId: viewerId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.category ? { category: q.category } : {}),
      ...(q.search
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: q.search, mode: 'insensitive' } },
                  { body: { contains: q.search, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.IdeaOrderByWithRelationInput[] =
      q.sort === 'top'
        ? [{ pinned: 'desc' }, { voteCount: 'desc' }, { createdAt: 'desc' }]
        : [{ pinned: 'desc' }, { createdAt: 'desc' }];
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.idea.findMany({
        where,
        orderBy,
        select: ideaSelect,
        ...toSkipTake(q.page, PAGE_SIZE),
      }),
      this.prisma.idea.count({ where }),
    ]);
    const voted = await this.votedSet(
      viewerId,
      rows.map((r) => r.id),
    );
    return paginate(
      rows.map((r) => toIdeaView(r, viewerId, voted.has(r.id))),
      total,
      q.page,
      PAGE_SIZE,
    );
  }

  async get(viewerId: string, id: string, isAdmin = false) {
    const idea = await this.prisma.idea.findUnique({
      where: { id },
      select: ideaSelect,
    });
    if (!idea || (idea.hidden && !isAdmin && idea.author?.id !== viewerId))
      throw new NotFoundException('Idea not found');
    const voted = await this.votedSet(viewerId, [id]);
    return toIdeaView(idea, viewerId, voted.has(id));
  }

  async create(viewerId: string, dto: CreateIdeaDto) {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const today = await this.prisma.idea.count({
      where: { authorId: viewerId, createdAt: { gte: since } },
    });
    if (today >= MAX_IDEAS_PER_DAY) {
      throw new HttpException(
        {
          message: `You can post at most ${MAX_IDEAS_PER_DAY} ideas a day`,
          code: 'too_many_ideas',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    // Quien propone la idea la vota a la vez.
    const idea = await this.prisma.idea.create({
      data: {
        authorId: viewerId,
        title: dto.title,
        body: dto.body,
        category: dto.category,
        voteCount: 1,
        votes: { create: { userId: viewerId } },
      },
      select: ideaSelect,
    });
    return toIdeaView(idea, viewerId, true);
  }

  /** Borrar tu idea, solo mientras nadie del equipo la ha tocado (estado NEW). */
  async remove(viewerId: string, id: string): Promise<void> {
    const idea = await this.prisma.idea.findUnique({
      where: { id },
      select: { authorId: true, status: true, adminReply: true },
    });
    if (!idea || idea.authorId !== viewerId)
      throw new NotFoundException('Idea not found');
    if (idea.status !== IdeaStatus.NEW || idea.adminReply)
      throw new ForbiddenException('The team has already reviewed this idea');
    await this.prisma.idea.delete({ where: { id } });
  }

  /** Votar (idempotente). Devuelve el recuento actual. */
  async vote(
    viewerId: string,
    id: string,
    on: boolean,
  ): Promise<{ voteCount: number; votedByMe: boolean }> {
    await this.get(viewerId, id);
    return this.prisma.$transaction(async (tx) => {
      if (on) {
        const created = await tx.ideaVote.createMany({
          data: [{ ideaId: id, userId: viewerId }],
          skipDuplicates: true,
        });
        if (created.count)
          await tx.idea.update({
            where: { id },
            data: { voteCount: { increment: 1 } },
          });
      } else {
        const removed = await tx.ideaVote.deleteMany({
          where: { ideaId: id, userId: viewerId },
        });
        if (removed.count)
          await tx.idea.update({
            where: { id },
            data: { voteCount: { decrement: 1 } },
          });
      }
      const { voteCount } = await tx.idea.findUniqueOrThrow({
        where: { id },
        select: { voteCount: true },
      });
      return { voteCount, votedByMe: on };
    });
  }

  private async votedSet(userId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const votes = await this.prisma.ideaVote.findMany({
      where: { userId, ideaId: { in: ids } },
      select: { ideaId: true },
    });
    return new Set(votes.map((v) => v.ideaId));
  }
}
