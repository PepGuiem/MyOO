import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { notBannedWhere } from '../common/ban';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Ruta interna de la web ("/ideas", "/u/ana"...). */
  link?: string | null;
  actorId?: string | null;
}

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  link: true,
  actorId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

/** Usuarios por tanda al avisar a todo el mundo (novedades). */
const BATCH = 1000;

/**
 * Avisos de la campanita: se guardan en la base de datos (para verlos aunque
 * no estuvieras conectado) y, si estás conectado, llegan al momento por el
 * WebSocket como `{ type: 'notification' }`.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async notify(userIds: string[], n: NotificationInput): Promise<void> {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (ids.length === 0) return;
    const data = ids.map((userId) => ({ userId, ...clean(n) }));
    for (let i = 0; i < data.length; i += BATCH) {
      await this.prisma.notification.createMany({
        data: data.slice(i, i + BATCH),
      });
    }
    await this.realtime.emit(ids, {
      type: 'notification',
      notificationType: n.type,
      title: n.title,
      link: n.link ?? null,
    });
  }

  /** A todas las cuentas (sin banear), por tandas. Para las novedades. */
  async notifyEveryone(n: NotificationInput): Promise<number> {
    let cursor: string | undefined;
    let total = 0;
    for (;;) {
      const users = await this.prisma.user.findMany({
        where: notBannedWhere(),
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (users.length === 0) break;
      await this.notify(
        users.map((u) => u.id),
        n,
      );
      total += users.length;
      cursor = users[users.length - 1].id;
      if (users.length < BATCH) break;
    }
    return total;
  }

  list(userId: string, before?: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
      select: notificationSelect,
    });
  }

  async unread(userId: string): Promise<{ unread: number }> {
    return {
      unread: await this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    };
  }

  /** Marca como leídos esos avisos (o todos, sin ids). Solo los tuyos. */
  async markRead(userId: string, ids?: string[]): Promise<{ unread: number }> {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(ids?.length ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });
    return this.unread(userId);
  }
}

function clean(n: NotificationInput) {
  // Solo rutas internas: así un aviso nunca puede llevar a otra web.
  const link =
    n.link && n.link.startsWith('/') && !n.link.startsWith('//')
      ? n.link.slice(0, 200)
      : null;
  return {
    type: n.type,
    title: n.title.slice(0, 160),
    body: n.body ? n.body.slice(0, 500) : null,
    link,
    actorId: n.actorId ?? null,
  };
}
