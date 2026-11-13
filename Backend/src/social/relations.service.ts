import { Injectable } from '@nestjs/common';
import { FollowStatus, MessagePolicy, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Pick<
  Prisma.TransactionClient,
  'block' | 'follow' | 'user' | 'message'
>;

/**
 * Reglas de privacidad en un solo sitio (las usan perfiles, seguidores y chats):
 *  - Bloqueo (en cualquier dirección): no se ven, no se siguen, no se escriben.
 *  - Ver el contenido de un perfil: el tuyo, uno público, o uno privado si le
 *    sigues y te ha aceptado.
 *  - Escribir a alguien: según su ajuste "quién puede escribirme"
 *    (todos / personas a las que sigue / nadie).
 */
@Injectable()
export class RelationsService {
  constructor(private readonly prisma: PrismaService) {}

  async isBlockedEitherWay(
    a: string,
    b: string,
    db: Db = this.prisma,
  ): Promise<boolean> {
    const n = await db.block.count({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return n > 0;
  }

  async followStatus(
    followerId: string,
    followingId: string,
    db: Db = this.prisma,
  ): Promise<FollowStatus | null> {
    const f = await db.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
      select: { status: true },
    });
    return f?.status ?? null;
  }

  /** ¿Puede `viewer` ver el contenido (outfits, seguidores...) del perfil de `owner`? */
  async canView(
    viewerId: string,
    owner: { id: string; isPrivate: boolean },
    db: Db = this.prisma,
  ): Promise<boolean> {
    if (viewerId === owner.id) return true;
    if (await this.isBlockedEitherWay(viewerId, owner.id, db)) return false;
    if (!owner.isPrivate) return true;
    return (
      (await this.followStatus(viewerId, owner.id, db)) ===
      FollowStatus.ACCEPTED
    );
  }

  /**
   * ¿Puede `sender` empezar a escribir a `recipient` (o añadirle a un grupo)?
   * Depende del ajuste de quien RECIBE.
   */
  async canMessage(
    senderId: string,
    recipient: { id: string; messagePolicy: MessagePolicy },
    db: Db = this.prisma,
  ): Promise<boolean> {
    if (senderId === recipient.id) return false;
    if (await this.isBlockedEitherWay(senderId, recipient.id, db)) return false;
    if (recipient.messagePolicy === MessagePolicy.EVERYONE) return true;
    if (recipient.messagePolicy === MessagePolicy.NOBODY) return false;
    // FOLLOWING: quien recibe tiene que seguir a quien escribe.
    return (
      (await this.followStatus(recipient.id, senderId, db)) ===
      FollowStatus.ACCEPTED
    );
  }
}
