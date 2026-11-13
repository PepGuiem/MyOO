import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IdeaStatus,
  MessageKind,
  NotificationType,
  Prisma,
  ReportStatus,
  ReportTarget,
  UserRole,
} from '@prisma/client';
import { banSelect, isBanned } from '../common/ban';
import { paginate, toSkipTake } from '../common/pagination';
import { ideaSelect, toIdeaView } from '../ideas/ideas.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { releaseSelect } from '../releases/releases.module';
import { toBrief, userBriefSelect } from '../social/user-brief';
import {
  AdminReportsQueryDto,
  AdminUsersQueryDto,
  BanUserDto,
  ReleaseDto,
  UpdateIdeaAdminDto,
  UpdateReportDto,
} from './admin.dto';

const PAGE = 25;

/** Código de cierre del WebSocket cuando se suspende una cuenta. */
export const WS_CLOSE_BANNED = 4004;

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  NEW: 'Nueva',
  UNDER_REVIEW: 'En revisión',
  PLANNED: 'Planificada',
  IN_PROGRESS: 'En marcha',
  DONE: 'Hecha',
  DECLINED: 'Descartada',
};

const adminUserSelect = {
  ...userBriefSelect,
  email: true,
  role: true,
  createdAt: true,
  ...banSelect,
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

function toAdminUser(u: AdminUserRow, openReports = 0) {
  return {
    ...toBrief(u),
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
    bannedAt: u.bannedAt,
    bannedUntil: u.bannedUntil,
    banReason: u.banReason,
    banned: isBanned(u),
    openReports,
  };
}

/**
 * Panel de administración. Todo lo que cambia algo queda apuntado en
 * AdminAction (quién, qué y sobre quién) para poder revisarlo.
 *
 * Privacidad: el admin NO puede leer chats. Solo ve la copia de un mensaje
 * cuando alguien de esa conversación lo denuncia, y solo puede borrar
 * mensajes denunciados.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
  ) {}

  // --------------------------------------------------------------- resumen

  async stats() {
    const now = new Date();
    const week = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const [
      users,
      newUsers,
      banned,
      openReports,
      newIdeas,
      ideas,
      published,
      drafts,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: week } } }),
      this.prisma.user.count({
        where: {
          bannedAt: { not: null },
          OR: [{ bannedUntil: null }, { bannedUntil: { gt: now } }],
        },
      }),
      this.prisma.report.count({ where: { status: ReportStatus.OPEN } }),
      this.prisma.idea.count({ where: { status: IdeaStatus.NEW } }),
      this.prisma.idea.count(),
      this.prisma.release.count({ where: { publishedAt: { not: null } } }),
      this.prisma.release.count({ where: { publishedAt: null } }),
    ]);
    return {
      users,
      newUsers,
      banned,
      openReports,
      newIdeas,
      ideas,
      releases: { published, drafts },
    };
  }

  // -------------------------------------------------------------- usuarios

  async users(q: AdminUsersQueryDto) {
    const now = new Date();
    const and: Prisma.UserWhereInput[] = [];
    if (q.search) {
      const s = q.search.replace(/^@/, '');
      and.push({
        OR: [
          { email: { contains: s, mode: 'insensitive' } },
          { username: { contains: s, mode: 'insensitive' } },
          { displayName: { contains: s, mode: 'insensitive' } },
        ],
      });
    }
    if (q.status === 'banned')
      and.push({
        bannedAt: { not: null },
        OR: [{ bannedUntil: null }, { bannedUntil: { gt: now } }],
      });
    if (q.status === 'admins') and.push({ role: UserRole.ADMIN });
    if (q.status === 'reported') {
      const rows = await this.prisma.report.findMany({
        where: { status: ReportStatus.OPEN, targetUserId: { not: null } },
        select: { targetUserId: true },
        distinct: ['targetUserId'],
      });
      and.push({ id: { in: rows.map((r) => r.targetUserId!) } });
    }
    const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: adminUserSelect,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(q.page, PAGE),
      }),
      this.prisma.user.count({ where }),
    ]);
    const open = await this.openReportsByUser(rows.map((r) => r.id));
    return paginate(
      rows.map((r) => toAdminUser(r, open.get(r.id) ?? 0)),
      total,
      q.page,
      PAGE,
    );
  }

  async user(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...adminUserSelect,
        _count: {
          select: {
            outfits: true,
            wardrobes: true,
            followers: true,
            following: true,
            ideas: true,
            reportsMade: true,
          },
        },
      },
    });
    if (!u) throw new NotFoundException('User not found');
    const [reports, actions, open] = await Promise.all([
      this.prisma.report.findMany({
        where: { targetUserId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          targetType: true,
          reason: true,
          details: true,
          status: true,
          snapshot: true,
          createdAt: true,
        },
      }),
      this.prisma.adminAction.findMany({
        where: { targetUserId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          action: true,
          targetId: true,
          details: true,
          createdAt: true,
          adminId: true,
        },
      }),
      this.openReportsByUser([id]),
    ]);
    const { _count, ...rest } = u;
    return {
      ...toAdminUser(rest, open.get(id) ?? 0),
      counts: _count,
      reports,
      actions: await this.withAdmins(actions),
    };
  }

  async ban(adminId: string, id: string, dto: BanUserDto) {
    if (id === adminId)
      throw new BadRequestException('You cannot suspend yourself');
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('User not found');
    // Un admin no puede suspender a otro: primero se le quita el rol en el servidor.
    if (target.role === UserRole.ADMIN)
      throw new ForbiddenException('You cannot suspend another admin');
    const now = new Date();
    const until = dto.days
      ? new Date(now.getTime() + dto.days * 24 * 3600 * 1000)
      : null;
    const u = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id },
        data: { bannedAt: now, bannedUntil: until, banReason: dto.reason },
        select: adminUserSelect,
      });
      await tx.adminAction.create({
        data: {
          adminId,
          action: 'user.ban',
          targetUserId: id,
          details: { reason: dto.reason, days: dto.days ?? null },
        },
      });
      return row;
    });
    // Fuera al momento: se cierran sus WebSockets (las peticiones HTTP ya
    // las corta el AuthGuard).
    this.realtime.disconnect(id, WS_CLOSE_BANNED, 'banned');
    return toAdminUser(u);
  }

  async unban(adminId: string, id: string) {
    const exists = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('User not found');
    const u = await this.prisma.$transaction(async (tx) => {
      const row = await tx.user.update({
        where: { id },
        data: { bannedAt: null, bannedUntil: null, banReason: null },
        select: adminUserSelect,
      });
      await tx.adminAction.create({
        data: { adminId, action: 'user.unban', targetUserId: id },
      });
      return row;
    });
    return toAdminUser(u);
  }

  // ----------------------------------------------------------------- ideas

  async updateIdea(adminId: string, id: string, dto: UpdateIdeaAdminDto) {
    const before = await this.prisma.idea.findUnique({
      where: { id },
      select: { title: true, status: true, adminReply: true, authorId: true },
    });
    if (!before) throw new NotFoundException('Idea not found');
    if (dto.duplicateOfId) {
      if (dto.duplicateOfId === id)
        throw new BadRequestException('An idea cannot duplicate itself');
      const target = await this.prisma.idea.findUnique({
        where: { id: dto.duplicateOfId },
        select: { id: true },
      });
      if (!target)
        throw new BadRequestException('The original idea does not exist');
    }
    const reply =
      dto.adminReply === undefined
        ? undefined
        : dto.adminReply
          ? dto.adminReply
          : null;
    const data: Prisma.IdeaUncheckedUpdateInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(reply !== undefined
        ? { adminReply: reply, repliedAt: reply ? new Date() : null }
        : {}),
      ...(dto.pinned !== undefined ? { pinned: dto.pinned } : {}),
      ...(dto.hidden !== undefined ? { hidden: dto.hidden } : {}),
      ...(dto.duplicateOfId !== undefined
        ? { duplicateOfId: dto.duplicateOfId }
        : {}),
    };
    const idea = await this.prisma.$transaction(async (tx) => {
      const row = await tx.idea.update({
        where: { id },
        data,
        select: ideaSelect,
      });
      await tx.adminAction.create({
        data: {
          adminId,
          action: 'idea.update',
          targetUserId: before.authorId,
          targetId: id,
          details: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue,
        },
      });
      return row;
    });

    // Avisos: a quien la propuso si hay respuesta nueva; a quien la votó si cambia el estado.
    const link = `/ideas?idea=${id}`;
    const replied = reply && reply !== before.adminReply;
    const statusChanged = dto.status && dto.status !== before.status;
    if (replied && before.authorId) {
      await this.notifications.notify([before.authorId], {
        type: NotificationType.IDEA_REPLY,
        title: `El equipo ha respondido a tu idea «${before.title}»`,
        body: reply,
        link,
        actorId: adminId,
      });
    }
    if (statusChanged) {
      const voters = await this.prisma.ideaVote.findMany({
        where: { ideaId: id },
        select: { userId: true },
      });
      const ids = voters
        .map((v) => v.userId)
        .filter((u) => !(replied && u === before.authorId));
      await this.notifications.notify(ids, {
        type: NotificationType.IDEA_STATUS,
        title: `«${before.title}» ahora está: ${IDEA_STATUS_LABEL[dto.status!]}`,
        link,
        actorId: adminId,
      });
    }
    return toIdeaView(idea, adminId, false);
  }

  async deleteIdea(adminId: string, id: string): Promise<void> {
    const idea = await this.prisma.idea.findUnique({
      where: { id },
      select: { title: true, authorId: true },
    });
    if (!idea) throw new NotFoundException('Idea not found');
    await this.prisma.$transaction([
      this.prisma.idea.delete({ where: { id } }),
      this.prisma.adminAction.create({
        data: {
          adminId,
          action: 'idea.delete',
          targetUserId: idea.authorId,
          targetId: id,
          details: { title: idea.title },
        },
      }),
    ]);
  }

  // ------------------------------------------------------------- denuncias

  async reports(q: AdminReportsQueryDto) {
    const where: Prisma.ReportWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.targetType ? { targetType: q.targetType } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(q.page, PAGE),
        select: {
          id: true,
          targetType: true,
          targetId: true,
          targetUserId: true,
          reason: true,
          details: true,
          snapshot: true,
          status: true,
          resolution: true,
          resolvedAt: true,
          createdAt: true,
          reporter: { select: userBriefSelect },
        },
      }),
      this.prisma.report.count({ where }),
    ]);
    const targetIds = [
      ...new Set(
        rows.map((r) => r.targetUserId).filter((x): x is string => !!x),
      ),
    ];
    const targets = await this.prisma.user.findMany({
      where: { id: { in: targetIds } },
      select: adminUserSelect,
    });
    const byId = new Map(targets.map((t) => [t.id, toAdminUser(t)]));
    // Estado actual de lo denunciado (si ya se ocultó o borró).
    const outfitIds = rows
      .filter((r) => r.targetType === ReportTarget.OUTFIT)
      .map((r) => r.targetId);
    const messageIds = rows
      .filter((r) => r.targetType === ReportTarget.MESSAGE)
      .map((r) => r.targetId);
    const ideaIds = rows
      .filter((r) => r.targetType === ReportTarget.IDEA)
      .map((r) => r.targetId);
    const [outfits, messages, ideas] = await Promise.all([
      outfitIds.length
        ? this.prisma.outfit.findMany({
            where: { id: { in: outfitIds } },
            select: { id: true, hiddenByAdmin: true },
          })
        : [],
      messageIds.length
        ? this.prisma.message.findMany({
            where: { id: { in: messageIds } },
            select: { id: true, deletedAt: true },
          })
        : [],
      ideaIds.length
        ? this.prisma.idea.findMany({
            where: { id: { in: ideaIds } },
            select: { id: true, hidden: true },
          })
        : [],
    ]);
    const state = new Map<string, 'hidden' | 'deleted' | 'visible'>();
    for (const o of outfits)
      state.set(o.id, o.hiddenByAdmin ? 'hidden' : 'visible');
    for (const m of messages)
      state.set(m.id, m.deletedAt ? 'deleted' : 'visible');
    for (const i of ideas) state.set(i.id, i.hidden ? 'hidden' : 'visible');
    return paginate(
      rows.map((r) => ({
        ...r,
        reporter: r.reporter ? toBrief(r.reporter) : null,
        targetUser: r.targetUserId ? (byId.get(r.targetUserId) ?? null) : null,
        targetState:
          r.targetType === ReportTarget.USER
            ? 'visible'
            : (state.get(r.targetId) ?? 'deleted'),
      })),
      total,
      q.page,
      PAGE,
    );
  }

  async updateReport(adminId: string, id: string, dto: UpdateReportDto) {
    const before = await this.prisma.report.findUnique({
      where: { id },
      select: { reporterId: true, targetUserId: true, status: true },
    });
    if (!before) throw new NotFoundException('Report not found');
    const closed = dto.status !== ReportStatus.OPEN;
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await tx.report.update({
        where: { id },
        data: {
          status: dto.status,
          resolution: dto.resolution || null,
          resolvedById: closed ? adminId : null,
          resolvedAt: closed ? new Date() : null,
        },
        select: { id: true, status: true, resolution: true, resolvedAt: true },
      });
      await tx.adminAction.create({
        data: {
          adminId,
          action: 'report.update',
          targetUserId: before.targetUserId,
          targetId: id,
          details: { status: dto.status },
        },
      });
      return row;
    });
    if (
      closed &&
      dto.notifyReporter !== false &&
      before.reporterId &&
      before.status === ReportStatus.OPEN
    ) {
      await this.notifications.notify([before.reporterId], {
        type: NotificationType.REPORT_UPDATE,
        title: 'Hemos revisado tu denuncia',
        body: 'Gracias por avisar. Por privacidad no contamos qué medidas se han tomado.',
      });
    }
    return r;
  }

  // ------------------------------------------------------------- contenido

  async setOutfitHidden(adminId: string, id: string, hidden: boolean) {
    const o = await this.prisma.outfit.findUnique({
      where: { id },
      select: { userId: true, name: true },
    });
    if (!o) throw new NotFoundException('Outfit not found');
    await this.prisma.$transaction([
      this.prisma.outfit.update({
        where: { id },
        data: { hiddenByAdmin: hidden },
      }),
      this.prisma.adminAction.create({
        data: {
          adminId,
          action: hidden ? 'outfit.hide' : 'outfit.unhide',
          targetUserId: o.userId,
          targetId: id,
          details: { name: o.name },
        },
      }),
    ]);
    return { id, hiddenByAdmin: hidden };
  }

  /** Borra un mensaje DENUNCIADO (el resto de chats no se pueden tocar). */
  async deleteMessage(adminId: string, id: string): Promise<void> {
    const reported = await this.prisma.report.findFirst({
      where: { targetType: ReportTarget.MESSAGE, targetId: id },
      select: { id: true },
    });
    if (!reported)
      throw new ForbiddenException('Only reported messages can be moderated');
    const m = await this.prisma.message.findUnique({
      where: { id },
      select: {
        conversationId: true,
        senderId: true,
        deletedAt: true,
        kind: true,
      },
    });
    if (!m) throw new NotFoundException('Message not found');
    if (m.deletedAt || m.kind === MessageKind.SYSTEM) return;
    await this.prisma.$transaction([
      this.prisma.message.update({
        where: { id },
        data: { deletedAt: new Date(), body: null, outfit: Prisma.DbNull },
      }),
      this.prisma.adminAction.create({
        data: {
          adminId,
          action: 'message.delete',
          targetUserId: m.senderId,
          targetId: id,
        },
      }),
    ]);
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId: m.conversationId },
      select: { userId: true },
    });
    this.realtime.emit(
      members.map((x) => x.userId),
      {
        type: 'message_deleted',
        conversationId: m.conversationId,
        messageId: id,
      },
    );
  }

  // ------------------------------------------------------------- novedades

  async releases(page: number) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.release.findMany({
        select: { ...releaseSelect, createdAt: true, updatedAt: true },
        // Borradores primero, luego lo publicado del más nuevo al más viejo.
        orderBy: [
          { publishedAt: { sort: 'desc', nulls: 'first' } },
          { createdAt: 'desc' },
        ],
        ...toSkipTake(page, PAGE),
      }),
      this.prisma.release.count(),
    ]);
    return paginate(rows, total, page, PAGE);
  }

  async createRelease(adminId: string, dto: ReleaseDto) {
    const r = await this.prisma.release.create({
      data: {
        title: dto.title,
        version: dto.version || null,
        body: dto.body,
        tags: dto.tags ?? [],
        authorId: adminId,
      },
      select: { ...releaseSelect, createdAt: true, updatedAt: true },
    });
    await this.log(adminId, 'release.create', null, r.id, { title: r.title });
    return r;
  }

  async updateRelease(adminId: string, id: string, dto: ReleaseDto) {
    await this.releaseOr404(id);
    const r = await this.prisma.release.update({
      where: { id },
      data: {
        title: dto.title,
        version: dto.version || null,
        body: dto.body,
        tags: dto.tags ?? [],
      },
      select: { ...releaseSelect, createdAt: true, updatedAt: true },
    });
    await this.log(adminId, 'release.update', null, id, { title: r.title });
    return r;
  }

  /**
   * Publica una novedad y (si `notify`) avisa a todas las cuentas. Solo se
   * avisa la PRIMERA vez que se publica: volver a publicarla tras retirarla
   * no manda otro aviso.
   */
  async publishRelease(adminId: string, id: string, notify = true) {
    const before = await this.releaseOr404(id);
    if (before.publishedAt) return { ...before, notified: 0 };
    const wasPublished = await this.prisma.adminAction.count({
      where: { action: 'release.publish', targetId: id },
    });
    const r = await this.prisma.release.update({
      where: { id },
      data: { publishedAt: new Date() },
      select: { ...releaseSelect, createdAt: true, updatedAt: true },
    });
    await this.log(adminId, 'release.publish', null, id, {
      title: r.title,
      notify,
    });
    let notified = 0;
    if (notify && wasPublished === 0) {
      notified = await this.notifications.notifyEveryone({
        type: NotificationType.RELEASE,
        title: r.version
          ? `Novedad ${r.version}: ${r.title}`
          : `Novedad: ${r.title}`,
        link: '/novedades',
        actorId: adminId,
      });
    }
    return { ...r, notified };
  }

  async unpublishRelease(adminId: string, id: string) {
    await this.releaseOr404(id);
    const r = await this.prisma.release.update({
      where: { id },
      data: { publishedAt: null },
      select: { ...releaseSelect, createdAt: true, updatedAt: true },
    });
    await this.log(adminId, 'release.unpublish', null, id, { title: r.title });
    return r;
  }

  async deleteRelease(adminId: string, id: string): Promise<void> {
    const r = await this.releaseOr404(id);
    await this.prisma.release.delete({ where: { id } });
    await this.log(adminId, 'release.delete', null, id, { title: r.title });
  }

  // -------------------------------------------------------------- registro

  async actions(page: number) {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.adminAction.findMany({
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(page, PAGE),
        select: {
          id: true,
          action: true,
          targetId: true,
          details: true,
          createdAt: true,
          adminId: true,
          targetUserId: true,
        },
      }),
      this.prisma.adminAction.count(),
    ]);
    return paginate(await this.withAdmins(rows), total, page, PAGE);
  }

  // --------------------------------------------------------------- ayudas

  private async openReportsByUser(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const groups = await this.prisma.report.groupBy({
      by: ['targetUserId'],
      where: { status: ReportStatus.OPEN, targetUserId: { in: ids } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.targetUserId!, g._count._all]));
  }

  /**
   * El registro no tiene claves foráneas (sobrevive aunque se borre la
   * cuenta), así que las personas se buscan aparte.
   */
  private async withAdmins<
    T extends { adminId: string | null; targetUserId?: string | null },
  >(rows: T[]) {
    const ids = [
      ...new Set(
        rows
          .flatMap((r) => [r.adminId, r.targetUserId ?? null])
          .filter((x): x is string => !!x),
      ),
    ];
    const users = ids.length
      ? await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: userBriefSelect,
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, toBrief(u)]));
    return rows.map(({ adminId, ...r }) => ({
      ...r,
      admin: adminId ? (byId.get(adminId) ?? null) : null,
      ...(r.targetUserId !== undefined
        ? {
            targetUser: r.targetUserId
              ? (byId.get(r.targetUserId) ?? null)
              : null,
          }
        : {}),
    }));
  }

  private async releaseOr404(id: string) {
    const r = await this.prisma.release.findUnique({
      where: { id },
      select: { ...releaseSelect, createdAt: true, updatedAt: true },
    });
    if (!r) throw new NotFoundException('Release not found');
    return r;
  }

  private async log(
    adminId: string,
    action: string,
    targetUserId: string | null,
    targetId: string | null,
    details?: Prisma.InputJsonValue,
  ) {
    await this.prisma.adminAction.create({
      data: { adminId, action, targetUserId, targetId, details },
    });
  }
}
