import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ReportTarget } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RelationsService } from '../social/relations.service';
import { CreateReportDto } from './reports.dto';

/**
 * Denunciar un perfil, un mensaje, un outfit compartido o una idea. Solo se
 * puede denunciar lo que tú puedes ver (no sirve para husmear) y se guarda una
 * copia de lo denunciado para el admin.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relations: RelationsService,
  ) {}

  async create(
    reporterId: string,
    dto: CreateReportDto,
  ): Promise<{ id: string; status: string }> {
    const { targetUserId, snapshot } = await this.inspect(
      reporterId,
      dto.targetType,
      dto.targetId,
    );
    if (targetUserId === reporterId)
      throw new BadRequestException('You cannot report yourself');
    try {
      const r = await this.prisma.report.create({
        data: {
          reporterId,
          targetType: dto.targetType,
          targetId: dto.targetId,
          targetUserId,
          reason: dto.reason,
          details: dto.details || null,
          snapshot: snapshot as Prisma.InputJsonValue,
        },
        select: { id: true, status: true },
      });
      return r;
    } catch (err) {
      // Ya lo habías denunciado: no se duplica.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const r = await this.prisma.report.findFirstOrThrow({
          where: {
            reporterId,
            targetType: dto.targetType,
            targetId: dto.targetId,
          },
          select: { id: true, status: true },
        });
        return r;
      }
      throw err;
    }
  }

  /** Comprueba que existe y que quien denuncia lo puede ver; devuelve la copia. */
  private async inspect(
    viewerId: string,
    type: ReportTarget,
    id: string,
  ): Promise<{
    targetUserId: string | null;
    snapshot: Record<string, unknown>;
  }> {
    if (type === ReportTarget.USER) {
      const u = await this.prisma.user.findUnique({
        where: { id },
        select: { id: true, username: true, displayName: true, bio: true },
      });
      if (!u) throw new NotFoundException('Not found');
      return {
        targetUserId: u.id,
        snapshot: {
          username: u.username,
          displayName: u.displayName,
          bio: u.bio,
        },
      };
    }
    if (type === ReportTarget.MESSAGE) {
      const m = await this.prisma.message.findUnique({
        where: { id },
        select: {
          senderId: true,
          body: true,
          kind: true,
          outfit: true,
          createdAt: true,
          conversation: {
            select: {
              id: true,
              isGroup: true,
              members: {
                where: { userId: viewerId },
                select: { userId: true },
              },
            },
          },
        },
      });
      // Solo mensajes de conversaciones en las que estás.
      if (!m || m.conversation.members.length === 0)
        throw new NotFoundException('Not found');
      const outfitName =
        m.outfit && typeof m.outfit === 'object' && 'name' in m.outfit
          ? String((m.outfit as { name: unknown }).name)
          : null;
      return {
        targetUserId: m.senderId,
        snapshot: {
          body: m.body,
          kind: m.kind,
          outfitName,
          sentAt: m.createdAt,
          conversationId: m.conversation.id,
          isGroup: m.conversation.isGroup,
        },
      };
    }
    if (type === ReportTarget.OUTFIT) {
      const o = await this.prisma.outfit.findUnique({
        where: { id },
        select: {
          userId: true,
          name: true,
          description: true,
          isShared: true,
          user: { select: { id: true, isPrivate: true } },
        },
      });
      if (
        !o ||
        (o.userId !== viewerId &&
          (!o.isShared || !(await this.relations.canView(viewerId, o.user))))
      )
        throw new NotFoundException('Not found');
      return {
        targetUserId: o.userId,
        snapshot: { name: o.name, description: o.description },
      };
    }
    if (type === ReportTarget.LISTING) {
      const l = await this.prisma.listing.findUnique({
        where: { id },
        select: {
          userId: true,
          title: true,
          description: true,
          kind: true,
          price: true,
          currency: true,
          hiddenByAdmin: true,
        },
      });
      const mine = l?.userId === viewerId;
      if (
        !l ||
        (!mine &&
          (l.hiddenByAdmin ||
            (await this.relations.isBlockedEitherWay(viewerId, l.userId))))
      ) {
        throw new NotFoundException('Not found');
      }
      return {
        targetUserId: l.userId,
        snapshot: {
          title: l.title,
          description: l.description,
          kind: l.kind,
          price: l.price?.toString() ?? null,
          currency: l.currency,
        },
      };
    }
    const i = await this.prisma.idea.findUnique({
      where: { id },
      select: { authorId: true, title: true, body: true, hidden: true },
    });
    if (!i || (i.hidden && i.authorId !== viewerId))
      throw new NotFoundException('Not found');
    return {
      targetUserId: i.authorId,
      snapshot: { title: i.title, body: i.body },
    };
  }
}
