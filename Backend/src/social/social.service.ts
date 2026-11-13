import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FollowStatus, NotificationType, Prisma } from '@prisma/client';
import { banSelect, isBanned, notBannedWhere } from '../common/ban';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, toSkipTake } from '../common/pagination';
import { garmentTypeSummarySelect } from '../garment-types/garment-types.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StorageService } from '../storage/storage.service';
import { RelationsService } from './relations.service';
import {
  followState,
  toBrief,
  userBriefSelect,
  type FollowState,
  type UserBrief,
} from './user-brief';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un outfit compartido tal como lo ve otra persona (sin datos de compra ni modelos externos). */
export const sharedOutfitSelect = {
  id: true,
  name: true,
  description: true,
  occasion: true,
  season: true,
  sharedAt: true,
  items: {
    orderBy: { position: 'asc' },
    select: {
      position: true,
      styling: true,
      wardrobeItem: {
        select: {
          id: true,
          name: true,
          color: true,
          attributes: true,
          customization: true,
          garmentType: { select: garmentTypeSummarySelect },
        },
      },
    },
  },
} satisfies Prisma.OutfitSelect;

export interface Relationship {
  isSelf: boolean;
  /** Tú → esta persona. */
  following: FollowState;
  /** Esta persona → tú. */
  followedBy: FollowState;
  blockedByMe: boolean;
}

export interface PublicProfile extends UserBrief {
  bio: string | null;
  pronouns: string | null;
  accentColor: string | null;
  /** Solo si puedes ver el perfil completo (si no, null o vacío). */
  location: string | null;
  website: string | null;
  instagramHandle: string | null;
  styleTags: string[];
  favoriteColors: string[];
  cover: string | null;
  counts: { followers: number; following: number; outfits: number };
  relationship: Relationship;
  /** Puede ver outfits y listas de seguidores. */
  canView: boolean;
  /** Puede escribirle un mensaje. */
  canMessage: boolean;
}

@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly relations: RelationsService,
    private readonly realtime: RealtimeService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Perfiles
  // ---------------------------------------------------------------------------

  /** Busca por id o por @usuario. Si te ha bloqueado, "no existe" (404). */
  private async resolve(viewerId: string, handle: string) {
    const clean = handle.trim().replace(/^@/, '').toLowerCase();
    const where: Prisma.UserWhereUniqueInput = UUID.test(clean)
      ? { id: clean }
      : { username: clean };
    const user = await this.prisma.user.findUnique({
      where,
      select: {
        ...userBriefSelect,
        bio: true,
        pronouns: true,
        accentColor: true,
        location: true,
        website: true,
        instagramHandle: true,
        styleTags: true,
        favoriteColors: true,
        coverAssetId: true,
        messagePolicy: true,
        ...banSelect,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    // Una cuenta suspendida no se ve (salvo la tuya).
    if (user.id !== viewerId && isBanned(user))
      throw new NotFoundException('User not found');
    if (user.id !== viewerId) {
      const blockedMe = await this.prisma.block.count({
        where: { blockerId: user.id, blockedId: viewerId },
      });
      if (blockedMe) throw new NotFoundException('User not found');
    }
    return user;
  }

  async profile(viewerId: string, handle: string): Promise<PublicProfile> {
    const u = await this.resolve(viewerId, handle);
    const isSelf = u.id === viewerId;
    const [out, inc, blockedByMe, followers, following, outfits] =
      await Promise.all([
        isSelf ? null : this.relations.followStatus(viewerId, u.id),
        isSelf ? null : this.relations.followStatus(u.id, viewerId),
        isSelf
          ? 0
          : this.prisma.block.count({
              where: { blockerId: viewerId, blockedId: u.id },
            }),
        this.prisma.follow.count({
          where: { followingId: u.id, status: FollowStatus.ACCEPTED },
        }),
        this.prisma.follow.count({
          where: { followerId: u.id, status: FollowStatus.ACCEPTED },
        }),
        this.prisma.outfit.count({
          where: { userId: u.id, isShared: true, hiddenByAdmin: false },
        }),
      ]);
    const canView =
      isSelf ||
      (!blockedByMe && (!u.isPrivate || out === FollowStatus.ACCEPTED));
    const canMessage = isSelf
      ? false
      : await this.relations.canMessage(viewerId, u);
    return {
      ...toBrief(u),
      bio: u.bio,
      pronouns: u.pronouns,
      accentColor: u.accentColor,
      location: canView ? u.location : null,
      website: canView ? u.website : null,
      instagramHandle: canView ? u.instagramHandle : null,
      styleTags: canView ? u.styleTags : [],
      favoriteColors: canView ? u.favoriteColors : [],
      cover: canView ? u.coverAssetId : null,
      counts: { followers, following, outfits },
      relationship: {
        isSelf,
        following: followState(out),
        followedBy: followState(inc),
        blockedByMe: blockedByMe > 0,
      },
      canView,
      canMessage,
    };
  }

  /** Busca personas con @usuario (solo cuentas con @: es lo que las hace encontrables). */
  async search(
    viewerId: string,
    q: string,
  ): Promise<(UserBrief & { following: FollowState })[]> {
    const term = q.toLowerCase();
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: viewerId },
        username: { not: null },
        OR: [
          { username: { startsWith: term } },
          { displayName: { contains: q, mode: 'insensitive' } },
        ],
        // Ni a quien te ha bloqueado ni a quien has bloqueado.
        blocking: { none: { blockedId: viewerId } },
        blockedBy: { none: { blockerId: viewerId } },
        // Ni cuentas suspendidas.
        AND: [notBannedWhere()],
      },
      select: {
        ...userBriefSelect,
        followers: {
          where: { followerId: viewerId },
          select: { status: true },
        },
      },
      orderBy: [{ username: 'asc' }],
      take: 20,
    });
    return users.map((u) => ({
      ...toBrief(u),
      following: followState(u.followers[0]?.status),
    }));
  }

  /** Imagen de la foto (siempre visible salvo bloqueo) o de la portada (solo si puedes ver el perfil). */
  async image(
    viewerId: string,
    userId: string,
    kind: 'avatar' | 'cover',
  ): Promise<{ data: Buffer; mimeType: string }> {
    const u = await this.resolve(viewerId, userId);
    if (kind === 'cover' && !(await this.relations.canView(viewerId, u)))
      throw new NotFoundException('Image not found');
    const assetId = kind === 'avatar' ? u.avatarAssetId : u.coverAssetId;
    if (!assetId) throw new NotFoundException('Image not found');
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, userId: u.id },
      select: { storageKey: true, mimeType: true },
    });
    const data = asset ? await this.storage.get(asset.storageKey) : null;
    if (!asset || !data) throw new NotFoundException('Image not found');
    return { data, mimeType: asset.mimeType };
  }

  async sharedOutfits(
    viewerId: string,
    handle: string,
    page: number,
    pageSize: number,
  ) {
    const u = await this.resolve(viewerId, handle);
    if (!(await this.relations.canView(viewerId, u)))
      throw new ForbiddenException({
        message: 'This account is private',
        code: 'private',
      });
    const where = { userId: u.id, isShared: true, hiddenByAdmin: false };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.outfit.findMany({
        where,
        select: sharedOutfitSelect,
        orderBy: [{ sharedAt: 'desc' }, { id: 'asc' }],
        ...toSkipTake(page, pageSize),
      }),
      this.prisma.outfit.count({ where }),
    ]);
    return paginate(rows, total, page, pageSize);
  }

  /** Seguidores o seguidos (aceptados) de un perfil, con tu relación con cada uno. */
  async connections(
    viewerId: string,
    handle: string,
    which: 'followers' | 'following',
    page: number,
    pageSize: number,
  ) {
    const u = await this.resolve(viewerId, handle);
    if (!(await this.relations.canView(viewerId, u)))
      throw new ForbiddenException({
        message: 'This account is private',
        code: 'private',
      });
    const where: Prisma.FollowWhereInput =
      which === 'followers'
        ? { followingId: u.id, status: FollowStatus.ACCEPTED }
        : { followerId: u.id, status: FollowStatus.ACCEPTED };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.follow.findMany({
        where,
        orderBy: [{ acceptedAt: 'desc' }, { createdAt: 'desc' }],
        ...toSkipTake(page, pageSize),
        select: {
          follower: {
            select: {
              ...userBriefSelect,
              followers: {
                where: { followerId: viewerId },
                select: { status: true },
              },
            },
          },
          following: {
            select: {
              ...userBriefSelect,
              followers: {
                where: { followerId: viewerId },
                select: { status: true },
              },
            },
          },
        },
      }),
      this.prisma.follow.count({ where }),
    ]);
    const people = rows.map((r) => {
      const p = which === 'followers' ? r.follower : r.following;
      return { ...toBrief(p), following: followState(p.followers[0]?.status) };
    });
    return paginate(people, total, page, pageSize);
  }

  // ---------------------------------------------------------------------------
  // Seguir
  // ---------------------------------------------------------------------------

  /** Seguir: al momento en cuentas públicas; solicitud en las privadas. */
  async follow(
    viewerId: string,
    targetId: string,
  ): Promise<{ status: FollowState }> {
    if (viewerId === targetId)
      throw new BadRequestException('You cannot follow yourself');
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, isPrivate: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (await this.relations.isBlockedEitherWay(viewerId, targetId))
      throw new NotFoundException('User not found');

    const existing = await this.relations.followStatus(viewerId, targetId);
    if (existing) return { status: followState(existing) };
    const status = target.isPrivate
      ? FollowStatus.PENDING
      : FollowStatus.ACCEPTED;
    try {
      await this.prisma.follow.create({
        data: {
          followerId: viewerId,
          followingId: targetId,
          status,
          acceptedAt: status === FollowStatus.ACCEPTED ? new Date() : null,
        },
      });
    } catch (err) {
      // Doble clic: la otra petición ya lo creó.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        return {
          status: followState(
            await this.relations.followStatus(viewerId, targetId),
          ),
        };
      }
      throw err;
    }
    const me = await this.brief(viewerId);
    this.realtime.emit([targetId], {
      type: status === FollowStatus.PENDING ? 'follow_request' : 'new_follower',
      user: me,
    });
    const who = displayOf(me);
    await this.notifications.notify([targetId], {
      type:
        status === FollowStatus.PENDING
          ? NotificationType.FOLLOW_REQUEST
          : NotificationType.NEW_FOLLOWER,
      title:
        status === FollowStatus.PENDING
          ? `${who} quiere seguirte`
          : `${who} te sigue`,
      link:
        status === FollowStatus.PENDING
          ? '/personas'
          : me
            ? profileLink(me)
            : null,
      actorId: viewerId,
    });
    return { status: followState(status) };
  }

  /** Dejar de seguir o cancelar una solicitud. */
  async unfollow(viewerId: string, targetId: string): Promise<void> {
    await this.prisma.follow.deleteMany({
      where: { followerId: viewerId, followingId: targetId },
    });
  }

  /** Quitar a alguien de tus seguidores (o rechazar su solicitud). */
  async removeFollower(viewerId: string, followerId: string): Promise<void> {
    await this.prisma.follow.deleteMany({
      where: { followerId, followingId: viewerId },
    });
  }

  async requests(viewerId: string) {
    const rows = await this.prisma.follow.findMany({
      where: { followingId: viewerId, status: FollowStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { createdAt: true, follower: { select: userBriefSelect } },
    });
    return rows.map((r) => ({
      ...toBrief(r.follower),
      requestedAt: r.createdAt,
    }));
  }

  async acceptRequest(viewerId: string, followerId: string): Promise<void> {
    const { count } = await this.prisma.follow.updateMany({
      where: {
        followerId,
        followingId: viewerId,
        status: FollowStatus.PENDING,
      },
      data: { status: FollowStatus.ACCEPTED, acceptedAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Request not found');
    const me = await this.brief(viewerId);
    this.realtime.emit([followerId], { type: 'follow_accepted', user: me });
    await this.notifications.notify([followerId], {
      type: NotificationType.FOLLOW_ACCEPTED,
      title: `${displayOf(me)} ha aceptado tu solicitud`,
      link: me ? profileLink(me) : null,
      actorId: viewerId,
    });
  }

  // ---------------------------------------------------------------------------
  // Bloquear
  // ---------------------------------------------------------------------------

  /** Bloquear: se deja de seguir en los dos sentidos y ya no se pueden escribir. */
  async block(viewerId: string, targetId: string): Promise<void> {
    if (viewerId === targetId)
      throw new BadRequestException('You cannot block yourself');
    const exists = await this.prisma.user.count({ where: { id: targetId } });
    if (!exists) throw new NotFoundException('User not found');
    await this.prisma.$transaction([
      this.prisma.block.upsert({
        where: {
          blockerId_blockedId: { blockerId: viewerId, blockedId: targetId },
        },
        create: { blockerId: viewerId, blockedId: targetId },
        update: {},
      }),
      this.prisma.follow.deleteMany({
        where: {
          OR: [
            { followerId: viewerId, followingId: targetId },
            { followerId: targetId, followingId: viewerId },
          ],
        },
      }),
    ]);
  }

  async unblock(viewerId: string, targetId: string): Promise<void> {
    await this.prisma.block.deleteMany({
      where: { blockerId: viewerId, blockedId: targetId },
    });
  }

  async blocked(viewerId: string): Promise<UserBrief[]> {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: viewerId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { blocked: { select: userBriefSelect } },
    });
    return rows.map((r) => toBrief(r.blocked));
  }

  private async brief(userId: string): Promise<UserBrief | null> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userBriefSelect,
    });
    return u ? toBrief(u) : null;
  }
}

function displayOf(u: UserBrief | null): string {
  if (!u) return 'Alguien';
  return u.displayName?.trim() || (u.username ? `@${u.username}` : 'Alguien');
}

function profileLink(u: UserBrief): string {
  return `/u/${encodeURIComponent(u.username ?? u.id)}`;
}
