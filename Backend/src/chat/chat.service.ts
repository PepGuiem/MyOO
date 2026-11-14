import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  ConversationRole,
  MessageKind,
  MessagePolicy,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { sharedOutfitSelect } from '../social/social.service';
import { RelationsService } from '../social/relations.service';
import { toBrief, userBriefSelect, type UserBrief } from '../social/user-brief';
import {
  CreateGroupDto,
  MAX_GROUP_MEMBERS,
  MessagesQueryDto,
  SendMessageDto,
} from './dto/chat.dto';

/** Mensajes por persona en 10 segundos (frena el spam y los bucles). */
const MAX_MESSAGES_PER_WINDOW = 15;
const WINDOW_MS = 10_000;

const messageSelect = {
  id: true,
  conversationId: true,
  kind: true,
  body: true,
  outfit: true,
  deletedAt: true,
  createdAt: true,
  sender: { select: userBriefSelect },
} satisfies Prisma.MessageSelect;

type MessageRow = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;

export interface MessageView {
  id: string;
  conversationId: string;
  kind: MessageKind;
  body: string | null;
  outfit: unknown;
  deleted: boolean;
  createdAt: Date;
  sender: UserBrief | null;
}

function toView(m: MessageRow): MessageView {
  const deleted = m.deletedAt !== null;
  return {
    id: m.id,
    conversationId: m.conversationId,
    kind: m.kind,
    body: deleted ? null : m.body,
    outfit: deleted ? null : m.outfit,
    deleted,
    createdAt: m.createdAt,
    sender: m.sender ? toBrief(m.sender) : null,
  };
}

const memberSelect = {
  role: true,
  joinedAt: true,
  lastReadAt: true,
  user: { select: userBriefSelect },
} satisfies Prisma.ConversationMemberSelect;

/**
 * Chats 1 a 1 y de grupo. Todo pasa por aquí (REST) y los cambios se avisan
 * en tiempo real a los miembros por el WebSocket (RealtimeService).
 *
 * Quién puede escribir:
 *  - 1 a 1: para empezar, lo que diga el ajuste de quien recibe. Ya empezado,
 *    puedes contestar a quien te haya escrito. Nunca con un bloqueo de por medio.
 *  - Grupos: cualquier miembro. Para añadir a alguien, su ajuste tiene que
 *    permitir que le escribas.
 */
@Injectable()
export class ChatService implements OnModuleInit {
  private readonly sent = new Map<string, number[]>();
  private readonly typingAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly relations: RelationsService,
    private readonly realtime: RealtimeService,
  ) {}

  onModuleInit(): void {
    // "Está escribiendo…": llega por el WebSocket y se reenvía a los demás.
    this.realtime.on('typing', (userId, p) =>
      this.typing(
        userId,
        typeof p.conversationId === 'string' ? p.conversationId : '',
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Lista y detalle
  // ---------------------------------------------------------------------------

  async list(userId: string) {
    const convs = await this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      select: {
        id: true,
        isGroup: true,
        title: true,
        lastMessageAt: true,
        members: { select: memberSelect, orderBy: { joinedAt: 'asc' } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: messageSelect,
        },
      },
    });
    const unread = await this.unreadByConversation(
      userId,
      convs.map((c) => c.id),
    );
    return convs.map((c) => ({
      id: c.id,
      isGroup: c.isGroup,
      title: c.title,
      lastMessageAt: c.lastMessageAt,
      members: c.members.map((m) => ({
        ...toBrief(m.user),
        role: m.role,
        lastReadAt: m.lastReadAt,
      })),
      lastMessage: c.messages[0] ? toView(c.messages[0]) : null,
      unread: unread.get(c.id) ?? 0,
    }));
  }

  /** Mensajes sin leer por conversación (sin contar los tuyos ni los avisos). */
  private async unreadByConversation(
    userId: string,
    ids: string[],
  ): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { conversationId: string; unread: number }[]
    >`
      SELECT m."conversationId", COUNT(*)::int AS unread
      FROM "Message" m
      JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId" AND cm."userId" = ${userId}::uuid
      WHERE m."conversationId" = ANY(${ids}::uuid[])
        AND m."senderId" IS DISTINCT FROM ${userId}::uuid
        AND m."kind" <> 'SYSTEM'
        AND m."deletedAt" IS NULL
        AND (cm."lastReadAt" IS NULL OR m."createdAt" > cm."lastReadAt")
      GROUP BY m."conversationId"
    `;
    return new Map(rows.map((r) => [r.conversationId, r.unread]));
  }

  async unreadTotal(userId: string): Promise<{ unread: number }> {
    const convs = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    const map = await this.unreadByConversation(
      userId,
      convs.map((c) => c.conversationId),
    );
    let unread = 0;
    for (const v of map.values()) unread += v;
    return { unread };
  }

  async detail(userId: string, conversationId: string) {
    await this.membership(userId, conversationId);
    const c = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: {
        id: true,
        isGroup: true,
        title: true,
        createdAt: true,
        lastMessageAt: true,
        members: { select: memberSelect, orderBy: { joinedAt: 'asc' } },
      },
    });
    const other = c.isGroup
      ? null
      : c.members.find((m) => m.user.id !== userId);
    const canSend = c.isGroup
      ? true
      : other
        ? await this.canSendDirect(userId, other.user.id, conversationId)
        : false;
    return {
      id: c.id,
      isGroup: c.isGroup,
      title: c.title,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
      members: c.members.map((m) => ({
        ...toBrief(m.user),
        role: m.role,
        lastReadAt: m.lastReadAt,
      })),
      canSend,
    };
  }

  async messages(
    userId: string,
    conversationId: string,
    q: MessagesQueryDto,
  ): Promise<MessageView[]> {
    await this.membership(userId, conversationId);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      select: messageSelect,
    });
    return rows.reverse().map(toView);
  }

  // ---------------------------------------------------------------------------
  // Crear conversaciones
  // ---------------------------------------------------------------------------

  /** Abre (o devuelve la que ya hay) la conversación 1 a 1 con otra persona. */
  async openDirect(userId: string, otherId: string) {
    if (userId === otherId)
      throw new BadRequestException('You cannot message yourself');
    const directKey = [userId, otherId].sort().join(':');
    const existing = await this.prisma.conversation.findUnique({
      where: { directKey },
      select: { id: true },
    });
    if (existing) {
      // Si alguno la había dejado (borró su cuenta y la rehízo no aplica): vuelve a estar dentro.
      return this.detail(userId, existing.id);
    }
    const other = await this.prisma.user.findUnique({
      where: { id: otherId },
      select: { id: true, messagePolicy: true },
    });
    if (!other) throw new NotFoundException('User not found');
    if (!(await this.relations.canMessage(userId, other))) {
      throw new ForbiddenException({
        message: 'This person does not accept messages from you',
        code: 'cannot_message',
      });
    }
    return this.detail(userId, await this.ensureDirect(userId, otherId));
  }

  /**
   * STREET MARKET: primer mensaje a quien vende. Publicar un anuncio implica
   * aceptar preguntas de compradores aunque su ajuste sea «personas a las que
   * sigo» (nunca con «nadie» ni con un bloqueo). Ese ajuste solo se salta para
   * UN mensaje: después el chat sigue sus reglas normales (puedes volver a
   * escribir cuando te conteste).
   */
  async contactSeller(
    buyerId: string,
    sellerId: string,
    body: string,
  ): Promise<{ conversationId: string; message: MessageView }> {
    if (buyerId === sellerId)
      throw new BadRequestException('You cannot message yourself');
    const seller = await this.prisma.user.findUnique({
      where: { id: sellerId },
      select: { id: true, messagePolicy: true },
    });
    if (!seller) throw new NotFoundException('User not found');
    if (
      seller.messagePolicy === MessagePolicy.NOBODY ||
      (await this.relations.isBlockedEitherWay(buyerId, sellerId))
    ) {
      throw new ForbiddenException({
        message: 'This seller does not accept messages',
        code: 'cannot_message',
      });
    }
    const conversationId = await this.ensureDirect(buyerId, sellerId);
    let skipPolicy = false;
    if (!(await this.canSendDirect(buyerId, sellerId, conversationId))) {
      const already = await this.prisma.message.count({
        where: {
          conversationId,
          senderId: buyerId,
          kind: { not: MessageKind.SYSTEM },
        },
      });
      if (already > 0) {
        throw new ConflictException({
          message: 'You already wrote to this seller: wait for a reply',
          code: 'wait_reply',
        });
      }
      skipPolicy = true;
    }
    const message = await this.send(
      buyerId,
      conversationId,
      { body },
      { skipPolicy },
    );
    return { conversationId, message };
  }

  /** Id de la conversación 1 a 1 entre dos personas (la crea si no existe). */
  private async ensureDirect(userId: string, otherId: string): Promise<string> {
    const directKey = [userId, otherId].sort().join(':');
    const existing = await this.prisma.conversation.findUnique({
      where: { directKey },
      select: { id: true },
    });
    if (existing) return existing.id;
    try {
      const c = await this.prisma.conversation.create({
        data: {
          directKey,
          isGroup: false,
          members: {
            create: [
              { userId, role: ConversationRole.MEMBER },
              { userId: otherId, role: ConversationRole.MEMBER },
            ],
          },
        },
        select: { id: true },
      });
      return c.id;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const again = await this.prisma.conversation.findUniqueOrThrow({
          where: { directKey },
          select: { id: true },
        });
        return again.id;
      }
      throw err;
    }
  }

  async createGroup(userId: string, dto: CreateGroupDto) {
    const others = dto.memberIds.filter((id) => id !== userId);
    if (others.length === 0)
      throw new BadRequestException('Add at least one person');
    if (others.length + 1 > MAX_GROUP_MEMBERS)
      throw new BadRequestException(
        `A group can have at most ${MAX_GROUP_MEMBERS} people`,
      );
    await this.assertCanAdd(userId, others);
    const c = await this.prisma.conversation.create({
      data: {
        isGroup: true,
        title: dto.title,
        members: {
          create: [
            { userId, role: ConversationRole.OWNER, lastReadAt: new Date() },
            ...others.map((id) => ({
              userId: id,
              role: ConversationRole.MEMBER,
            })),
          ],
        },
        messages: {
          create: {
            kind: MessageKind.SYSTEM,
            senderId: userId,
            body: 'created',
          },
        },
      },
      select: { id: true },
    });
    const detail = await this.detail(userId, c.id);
    this.realtime.emit([userId, ...others], {
      type: 'conversation',
      conversationId: c.id,
    });
    return detail;
  }

  // ---------------------------------------------------------------------------
  // Mensajes
  // ---------------------------------------------------------------------------

  async send(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
    opts: { skipPolicy?: boolean } = {},
  ): Promise<MessageView> {
    const body = dto.body?.trim() || null;
    if (!body && !dto.outfitId)
      throw new BadRequestException('Write something or attach an outfit');
    const conv = await this.membership(userId, conversationId);
    const members = await this.memberIds(conversationId);
    if (!conv.isGroup) {
      const other = members.find((id) => id !== userId);
      if (
        !other ||
        (!opts.skipPolicy &&
          !(await this.canSendDirect(userId, other, conversationId)))
      ) {
        throw new ForbiddenException({
          message: 'You cannot send messages in this conversation',
          code: 'cannot_message',
        });
      }
    }
    this.rateLimit(userId);

    let outfit: Prisma.InputJsonValue | undefined;
    if (dto.outfitId) {
      // Solo tus outfits. Se guarda una copia: el mensaje no cambia si lo editas o borras.
      const o = await this.prisma.outfit.findFirst({
        where: { id: dto.outfitId, userId },
        select: sharedOutfitSelect,
      });
      if (!o) throw new NotFoundException('Outfit not found');
      outfit = JSON.parse(JSON.stringify(o)) as Prisma.InputJsonValue;
    }

    const now = new Date();
    const [msg] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          senderId: userId,
          kind: outfit ? MessageKind.OUTFIT : MessageKind.TEXT,
          body,
          outfit,
        },
        select: messageSelect,
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: now },
      }),
      this.prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId } },
        data: { lastReadAt: now },
      }),
    ]);
    const view = toView(msg);
    this.realtime.emit(members, { type: 'message', message: view });
    return view;
  }

  /** Borra un mensaje tuyo (queda "Mensaje eliminado"). */
  async deleteMessage(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    await this.membership(userId, conversationId);
    const { count } = await this.prisma.message.updateMany({
      where: {
        id: messageId,
        conversationId,
        senderId: userId,
        deletedAt: null,
        kind: { not: MessageKind.SYSTEM },
      },
      data: { deletedAt: new Date(), body: null, outfit: Prisma.DbNull },
    });
    if (count === 0) throw new NotFoundException('Message not found');
    this.realtime.emit(await this.memberIds(conversationId), {
      type: 'message_deleted',
      conversationId,
      messageId,
    });
  }

  /** Marca la conversación como leída y avisa a los demás ("Visto"). */
  async markRead(
    userId: string,
    conversationId: string,
  ): Promise<{ lastReadAt: Date }> {
    await this.membership(userId, conversationId);
    const at = new Date();
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: at },
    });
    this.realtime.emit(await this.memberIds(conversationId), {
      type: 'read',
      conversationId,
      userId,
      at,
    });
    return { lastReadAt: at };
  }

  /** "Está escribiendo…" (como mucho un aviso cada 2 s por conversación). */
  async typing(userId: string, conversationId: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return;
    const key = `${userId}:${conversationId}`;
    const last = this.typingAt.get(key) ?? 0;
    if (Date.now() - last < 2000) return;
    this.typingAt.set(key, Date.now());
    if (this.typingAt.size > 10_000) this.typingAt.clear();
    const members = await this.memberIds(conversationId);
    if (!members.includes(userId)) return;
    this.realtime.emit(
      members.filter((id) => id !== userId),
      { type: 'typing', conversationId, userId },
    );
  }

  // ---------------------------------------------------------------------------
  // Grupos
  // ---------------------------------------------------------------------------

  async rename(userId: string, conversationId: string, title: string) {
    const me = await this.groupAdmin(userId, conversationId);
    await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { title },
      }),
      this.prisma.message.create({
        data: {
          conversationId,
          senderId: me,
          kind: MessageKind.SYSTEM,
          body: 'renamed',
        },
      }),
    ]);
    this.realtime.emit(await this.memberIds(conversationId), {
      type: 'conversation',
      conversationId,
    });
    return this.detail(userId, conversationId);
  }

  async addMembers(userId: string, conversationId: string, userIds: string[]) {
    await this.groupAdmin(userId, conversationId);
    const current = await this.memberIds(conversationId);
    const fresh = userIds.filter((id) => !current.includes(id));
    if (fresh.length === 0) return this.detail(userId, conversationId);
    if (current.length + fresh.length > MAX_GROUP_MEMBERS)
      throw new BadRequestException(
        `A group can have at most ${MAX_GROUP_MEMBERS} people`,
      );
    await this.assertCanAdd(userId, fresh);
    await this.prisma.$transaction([
      this.prisma.conversationMember.createMany({
        data: fresh.map((id) => ({ conversationId, userId: id })),
        skipDuplicates: true,
      }),
      ...fresh.map((id) =>
        this.prisma.message.create({
          data: {
            conversationId,
            senderId: userId,
            kind: MessageKind.SYSTEM,
            body: `added:${id}`,
          },
        }),
      ),
    ]);
    this.realtime.emit([...current, ...fresh], {
      type: 'conversation',
      conversationId,
    });
    return this.detail(userId, conversationId);
  }

  /**
   * Quitar a alguien (admins) o salir (tú mismo). Si sale el dueño, pasa a
   * serlo el admin más antiguo (o el miembro más antiguo). Si no queda nadie,
   * el grupo se borra.
   */
  async removeMember(
    userId: string,
    conversationId: string,
    targetId: string,
  ): Promise<void> {
    const conv = await this.membership(userId, conversationId);
    if (!conv.isGroup)
      throw new BadRequestException(
        'You cannot leave a one-to-one conversation',
      );
    if (targetId !== userId) {
      await this.groupAdmin(userId, conversationId);
      const target = await this.prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId, userId: targetId } },
        select: { role: true },
      });
      if (!target) throw new NotFoundException('Member not found');
      if (target.role === ConversationRole.OWNER)
        throw new ForbiddenException('The owner cannot be removed');
      if (
        target.role === ConversationRole.ADMIN &&
        conv.role !== ConversationRole.OWNER
      ) {
        throw new ForbiddenException('Only the owner can remove an admin');
      }
    }
    const before = await this.memberIds(conversationId);
    await this.prisma.$transaction(async (tx) => {
      await tx.conversationMember.delete({
        where: { conversationId_userId: { conversationId, userId: targetId } },
      });
      const rest = await tx.conversationMember.findMany({
        where: { conversationId },
        orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
        select: { userId: true, role: true },
      });
      if (rest.length === 0) {
        await tx.conversation.delete({ where: { id: conversationId } });
        return;
      }
      if (!rest.some((m) => m.role === ConversationRole.OWNER)) {
        const heir =
          rest.find((m) => m.role === ConversationRole.ADMIN) ?? rest[0];
        await tx.conversationMember.update({
          where: {
            conversationId_userId: { conversationId, userId: heir.userId },
          },
          data: { role: ConversationRole.OWNER },
        });
      }
      await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          kind: MessageKind.SYSTEM,
          body: targetId === userId ? 'left' : `removed:${targetId}`,
        },
      });
    });
    this.realtime.emit(before, { type: 'conversation', conversationId });
  }

  async setRole(
    userId: string,
    conversationId: string,
    targetId: string,
    role: 'ADMIN' | 'MEMBER',
  ) {
    const me = await this.membership(userId, conversationId);
    if (!me.isGroup || me.role !== ConversationRole.OWNER)
      throw new ForbiddenException('Only the owner can change roles');
    if (targetId === userId) throw new BadRequestException('You are the owner');
    const { count } = await this.prisma.conversationMember.updateMany({
      where: {
        conversationId,
        userId: targetId,
        role: { not: ConversationRole.OWNER },
      },
      data: { role: ConversationRole[role] },
    });
    if (count === 0) throw new NotFoundException('Member not found');
    this.realtime.emit(await this.memberIds(conversationId), {
      type: 'conversation',
      conversationId,
    });
    return this.detail(userId, conversationId);
  }

  // ---------------------------------------------------------------------------
  // Ayudas
  // ---------------------------------------------------------------------------

  /** Tu pertenencia (404 si no estás: no se revela si la conversación existe). */
  private async membership(
    userId: string,
    conversationId: string,
  ): Promise<{ isGroup: boolean; role: ConversationRole }> {
    const m = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { role: true, conversation: { select: { isGroup: true } } },
    });
    if (!m) throw new NotFoundException('Conversation not found');
    return { isGroup: m.conversation.isGroup, role: m.role };
  }

  private async groupAdmin(
    userId: string,
    conversationId: string,
  ): Promise<string> {
    const m = await this.membership(userId, conversationId);
    if (!m.isGroup) throw new BadRequestException('This is not a group');
    if (m.role === ConversationRole.MEMBER)
      throw new ForbiddenException('Only admins can do this');
    return userId;
  }

  private async memberIds(conversationId: string): Promise<string[]> {
    const rows = await this.prisma.conversationMember.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  /** 1 a 1 ya empezada: puedes si su ajuste te deja o si te ha escrito ella; nunca con bloqueo. */
  private async canSendDirect(
    userId: string,
    otherId: string,
    conversationId: string,
  ): Promise<boolean> {
    const other = await this.prisma.user.findUnique({
      where: { id: otherId },
      select: { id: true, messagePolicy: true },
    });
    if (!other) return false;
    if (await this.relations.isBlockedEitherWay(userId, otherId)) return false;
    if (await this.relations.canMessage(userId, other)) return true;
    const wroteToMe = await this.prisma.message.count({
      where: {
        conversationId,
        senderId: otherId,
        kind: { not: MessageKind.SYSTEM },
      },
    });
    return wroteToMe > 0;
  }

  /** Para añadir a alguien a un grupo, tiene que aceptar mensajes tuyos. */
  private async assertCanAdd(userId: string, ids: string[]): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        messagePolicy: true,
        displayName: true,
        username: true,
      },
    });
    if (users.length !== ids.length)
      throw new NotFoundException('User not found');
    const refused: string[] = [];
    for (const u of users)
      if (!(await this.relations.canMessage(userId, u)))
        refused.push(
          u.username ? `@${u.username}` : (u.displayName ?? 'alguien'),
        );
    if (refused.length) {
      throw new ForbiddenException({
        message: `These people do not accept messages from you: ${refused.join(', ')}`,
        code: 'cannot_add',
        people: refused,
      });
    }
  }

  private rateLimit(userId: string): void {
    const now = Date.now();
    const recent = (this.sent.get(userId) ?? []).filter(
      (t) => now - t < WINDOW_MS,
    );
    if (recent.length >= MAX_MESSAGES_PER_WINDOW) {
      throw new HttpException(
        { message: 'Too many messages. Wait a moment.', code: 'slow_down' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recent.push(now);
    this.sent.set(userId, recent);
    if (this.sent.size > 10_000) this.sent.clear();
  }
}
