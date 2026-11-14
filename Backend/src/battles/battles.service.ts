import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  BattleSide,
  BattleStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { banSelect, isBanned, notBannedWhere } from '../common/ban';
import { paginate, toSkipTake } from '../common/pagination';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { RelationsService } from '../social/relations.service';
import { sharedOutfitSelect } from '../social/social.service';
import { toBrief, userBriefSelect, type UserBrief } from '../social/user-brief';
import {
  acceptDeadline,
  effectiveStatus,
  leaderboard,
  MAX_PENDING_SENT,
  recordOf,
  revealVotes,
  shareA,
  sideOf,
  voteBlock,
  voteDeadline,
  winnerOf,
  winStreak,
  type LeaderRow,
  type Side,
} from './battles.rules';
import type {
  BattleTab,
  CreateBattleDto,
  ListBattlesQueryDto,
} from './dto/battles.dto';

const personSelect = {
  ...userBriefSelect,
  ...banSelect,
} satisfies Prisma.UserSelect;

const battleSelect = (viewerId: string) =>
  ({
    id: true,
    challengerId: true,
    opponentId: true,
    isOpen: true,
    theme: true,
    challengerOutfit: true,
    opponentOutfit: true,
    status: true,
    votesA: true,
    votesB: true,
    winner: true,
    expiresAt: true,
    startedAt: true,
    endsAt: true,
    finishedAt: true,
    createdAt: true,
    challenger: { select: personSelect },
    opponent: { select: personSelect },
    votes: { where: { userId: viewerId }, select: { side: true } },
  }) satisfies Prisma.BattleSelect;

type BattleRow = Prisma.BattleGetPayload<{
  select: ReturnType<typeof battleSelect>;
}>;

export interface BattleView {
  id: string;
  status: BattleStatus;
  theme: string | null;
  isOpen: boolean;
  challenger: UserBrief;
  opponent: UserBrief | null;
  /** Copias de los outfits (A = quien reta, B = quien responde). */
  outfitA: unknown;
  outfitB: unknown;
  /** Votos de cada lado: solo si ya votaste, si participas o si terminó. */
  votes: { a: number; b: number; shareA: number } | null;
  totalVotes: number;
  winner: Side | null;
  mySide: Side | null;
  myVote: Side | null;
  canVote: boolean;
  /** Por qué no puedes votar (own_battle, not_active, already_voted). */
  voteBlock: string | null;
  canAccept: boolean;
  canDecline: boolean;
  canCancel: boolean;
  expiresAt: Date;
  startedAt: Date | null;
  endsAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

export interface LeaderView extends LeaderRow {
  rank: number;
  user: UserBrief;
}

/** Cada cuánto se cierran solas las votaciones vencidas y los retos caducados. */
const SWEEP_MS = 60_000;
/** Como mucho una limpieza cada 5 s al consultar (además de la del minuto). */
const LAZY_SWEEP_MS = 5_000;

/**
 * STREETWEAR BATTLES: retos 1 vs 1 entre outfits.
 *  - Retas a alguien (o dejas el reto abierto) con un outfit tuyo; el rival
 *    responde con el suyo y la comunidad vota 48 h.
 *  - Un voto por persona (clave primaria) y nunca en tu propia batalla.
 *  - Los votos se suman en la misma transacción que el voto, con una
 *    actualización condicionada: no se cuenta nada fuera de plazo.
 *  - Las batallas vencidas se cierran con un UPDATE ... RETURNING: aunque dos
 *    procesos lo intenten a la vez, cada batalla se cierra (y se avisa) una vez.
 */
@Injectable()
export class BattlesService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(BattlesService.name);
  private timer?: NodeJS.Timeout;
  private lastSweep = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly relations: RelationsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.sweep().catch((err: unknown) =>
        this.log.warn(`No se pudieron cerrar las batallas: ${String(err)}`),
      );
    }, SWEEP_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------------------------------------------------------------------------
  // Consultas
  // ---------------------------------------------------------------------------

  async list(userId: string, q: ListBattlesQueryDto) {
    await this.lazySweep();
    const now = new Date();
    const tab: BattleTab = q.tab ?? 'live';
    const hidden = await this.hiddenPeople(userId);
    const visible: Prisma.BattleWhereInput = {
      challenger: notBannedWhere(now),
      OR: [{ opponentId: null }, { opponent: notBannedWhere(now) }],
      ...(hidden.length
        ? {
            challengerId: { notIn: hidden },
            NOT: { opponentId: { in: hidden } },
          }
        : {}),
    };
    let where: Prisma.BattleWhereInput;
    let orderBy: Prisma.BattleOrderByWithRelationInput[];
    switch (tab) {
      case 'open':
        where = {
          ...visible,
          status: BattleStatus.PENDING,
          isOpen: true,
          opponentId: null,
          expiresAt: { gt: now },
        };
        orderBy = [{ createdAt: 'desc' }];
        break;
      case 'challenges':
        where = {
          status: BattleStatus.PENDING,
          opponentId: userId,
          expiresAt: { gt: now },
          challenger: notBannedWhere(now),
          ...(hidden.length ? { challengerId: { notIn: hidden } } : {}),
        };
        orderBy = [{ createdAt: 'desc' }];
        break;
      case 'mine':
        where = { OR: [{ challengerId: userId }, { opponentId: userId }] };
        orderBy = [{ createdAt: 'desc' }];
        break;
      case 'finished':
        where = { ...visible, status: BattleStatus.FINISHED };
        orderBy = [{ finishedAt: 'desc' }];
        break;
      default:
        where = {
          ...visible,
          status: BattleStatus.ACTIVE,
          endsAt: { gt: now },
        };
        orderBy = [{ endsAt: 'asc' }];
    }
    const { skip, take } = toSkipTake(q.page, q.pageSize);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.battle.findMany({
        where,
        orderBy,
        skip,
        take,
        select: battleSelect(userId),
      }),
      this.prisma.battle.count({ where }),
    ]);
    return paginate(
      rows.map((r) => this.toView(r, userId, now)),
      total,
      q.page,
      q.pageSize,
    );
  }

  /** Contadores para las pestañas y el aviso de retos recibidos. */
  async summary(userId: string) {
    await this.lazySweep();
    const now = new Date();
    const [challenges, live, mine] = await this.prisma.$transaction([
      this.prisma.battle.count({
        where: {
          status: BattleStatus.PENDING,
          opponentId: userId,
          expiresAt: { gt: now },
        },
      }),
      this.prisma.battle.count({
        where: { status: BattleStatus.ACTIVE, endsAt: { gt: now } },
      }),
      this.prisma.battle.count({
        where: {
          status: BattleStatus.ACTIVE,
          endsAt: { gt: now },
          OR: [{ challengerId: userId }, { opponentId: userId }],
        },
      }),
    ]);
    const finished = await this.finishedFor(userId);
    return {
      challenges,
      live,
      myLive: mine,
      record: recordOf(userId, finished),
      streak: winStreak(userId, finished),
    };
  }

  async findOne(userId: string, id: string): Promise<BattleView> {
    await this.lazySweep();
    let row = await this.visibleRow(userId, id);
    const now = new Date();
    // Si acaba de vencer, se cierra ya (y se avisa) en lugar de esperar al minuto.
    if (effectiveStatus(row, now) !== row.status) {
      await this.sweep(now);
      row = await this.visibleRow(userId, id);
    }
    return this.toView(row, userId, now);
  }

  /** Ranking de ganadores (sin cuentas bloqueadas contigo ni suspendidas). */
  async leaderboard(userId: string) {
    await this.lazySweep();
    const finished = await this.prisma.battle.findMany({
      where: { status: BattleStatus.FINISHED, opponentId: { not: null } },
      select: {
        challengerId: true,
        opponentId: true,
        winner: true,
        votesA: true,
        votesB: true,
      },
      orderBy: { finishedAt: 'desc' },
      take: 20_000,
    });
    const hidden = new Set(await this.hiddenPeople(userId));
    const rows = leaderboard(finished, 200).filter(
      (r) => !hidden.has(r.userId),
    );
    const people = await this.prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) }, ...notBannedWhere() },
      select: userBriefSelect,
    });
    const byId = new Map(people.map((p) => [p.id, toBrief(p)]));
    const top: LeaderView[] = [];
    for (const r of rows) {
      const user = byId.get(r.userId);
      if (!user) continue;
      top.push({ ...r, rank: top.length + 1, user });
      if (top.length === 50) break;
    }
    const mine = recordOf(userId, finished);
    const myRank = top.find((r) => r.userId === userId)?.rank ?? null;
    return { top, me: { ...mine, rank: myRank } };
  }

  // ---------------------------------------------------------------------------
  // Retar, aceptar, rechazar y retirar
  // ---------------------------------------------------------------------------

  async create(userId: string, dto: CreateBattleDto): Promise<BattleView> {
    const outfit = await this.snapshot(userId, dto.outfitId);
    if (dto.opponentId) await this.assertCanChallenge(userId, dto.opponentId);
    const now = new Date();

    const id = await this.prisma.$transaction(async (tx) => {
      // Un cerrojo por persona: dos retos a la vez no se saltan el límite.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'battles:' + userId}))`;
      const pending = await tx.battle.findMany({
        where: {
          challengerId: userId,
          status: BattleStatus.PENDING,
          expiresAt: { gt: now },
        },
        select: { opponentId: true },
      });
      if (pending.length >= MAX_PENDING_SENT) {
        throw new ConflictException({
          message: `You can have at most ${MAX_PENDING_SENT} challenges waiting`,
          code: 'too_many_pending',
          limit: MAX_PENDING_SENT,
        });
      }
      if (
        dto.opponentId &&
        pending.some((p) => p.opponentId === dto.opponentId)
      ) {
        throw new ConflictException({
          message: 'You already challenged this person',
          code: 'already_challenged',
        });
      }
      const b = await tx.battle.create({
        data: {
          challengerId: userId,
          opponentId: dto.opponentId ?? null,
          isOpen: !dto.opponentId,
          theme: dto.theme ?? null,
          challengerOutfit: outfit.json,
          challengerOutfitId: outfit.id,
          expiresAt: acceptDeadline(now),
        },
        select: { id: true },
      });
      return b.id;
    });

    if (dto.opponentId) {
      const me = await this.brief(userId);
      await this.notifications.notify([dto.opponentId], {
        type: NotificationType.BATTLE_CHALLENGE,
        title: `${who(me)} te reta a una batalla`,
        body: dto.theme
          ? `Tema: ${dto.theme}. Tienes 72 h para responder con un outfit.`
          : 'Tienes 72 h para responder con un outfit.',
        link: `/batallas/${id}`,
        actorId: userId,
      });
    }
    return this.findOne(userId, id);
  }

  async accept(
    userId: string,
    id: string,
    outfitId: string,
  ): Promise<BattleView> {
    const row = await this.visibleRow(userId, id);
    const now = new Date();
    if (row.challengerId === userId) {
      throw new BadRequestException({
        message: 'You cannot accept your own challenge',
        code: 'own_battle',
      });
    }
    if (
      effectiveStatus(row, now) !== BattleStatus.PENDING ||
      (row.opponentId && row.opponentId !== userId)
    ) {
      throw new ConflictException({
        message: 'This challenge is no longer available',
        code: 'not_available',
      });
    }
    const outfit = await this.snapshot(userId, outfitId);
    // Actualización condicionada: si dos personas aceptan un reto abierto a la
    // vez, solo una lo consigue; la otra recibe 409.
    const n = await this.prisma.battle.updateMany({
      where: {
        id,
        status: BattleStatus.PENDING,
        expiresAt: { gt: now },
        challengerId: { not: userId },
        OR: [{ opponentId: userId }, { opponentId: null, isOpen: true }],
      },
      data: {
        opponentId: userId,
        opponentOutfit: outfit.json,
        opponentOutfitId: outfit.id,
        status: BattleStatus.ACTIVE,
        startedAt: now,
        endsAt: voteDeadline(now),
      },
    });
    if (n.count === 0) {
      throw new ConflictException({
        message: 'This challenge is no longer available',
        code: 'not_available',
      });
    }
    const me = await this.brief(userId);
    await this.notifications.notify([row.challengerId], {
      type: NotificationType.BATTLE_ACCEPTED,
      title: `${who(me)} ha aceptado tu reto`,
      body: 'Empieza la votación: 48 h.',
      link: `/batallas/${id}`,
      actorId: userId,
    });
    return this.findOne(userId, id);
  }

  async decline(userId: string, id: string): Promise<BattleView> {
    const n = await this.prisma.battle.updateMany({
      where: {
        id,
        opponentId: userId,
        isOpen: false,
        status: BattleStatus.PENDING,
      },
      data: { status: BattleStatus.DECLINED },
    });
    if (n.count === 0)
      throw new ConflictException({
        message: 'This challenge is no longer pending',
        code: 'not_available',
      });
    return this.findOne(userId, id);
  }

  async cancel(userId: string, id: string): Promise<void> {
    const n = await this.prisma.battle.updateMany({
      where: { id, challengerId: userId, status: BattleStatus.PENDING },
      data: { status: BattleStatus.CANCELLED },
    });
    if (n.count === 0) {
      const exists = await this.prisma.battle.count({
        where: { id, challengerId: userId },
      });
      if (!exists) throw new NotFoundException('Battle not found');
      throw new ConflictException({
        message: 'Only challenges nobody accepted yet can be withdrawn',
        code: 'not_pending',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Votar
  // ---------------------------------------------------------------------------

  async vote(userId: string, id: string, side: Side): Promise<BattleView> {
    const row = await this.visibleRow(userId, id);
    const now = new Date();
    const block = voteBlock(row, userId, now);
    if (block === 'own_battle')
      throw new ForbiddenException({
        message: 'You cannot vote in your own battle',
        code: block,
      });
    if (block)
      throw new ConflictException({ message: 'Voting is closed', code: block });
    if (row.votes.length > 0)
      throw new ConflictException({
        message: 'You already voted',
        code: 'already_voted',
      });
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.battleVote.create({
          data: { battleId: id, userId, side: side as BattleSide },
        });
        const n = await tx.battle.updateMany({
          where: {
            id,
            status: BattleStatus.ACTIVE,
            endsAt: { gt: now },
            challengerId: { not: userId },
            opponentId: { not: userId },
          },
          data:
            side === 'A'
              ? { votesA: { increment: 1 } }
              : { votesB: { increment: 1 } },
        });
        if (n.count === 0)
          throw new ConflictException({
            message: 'Voting is closed',
            code: 'not_active',
          });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException({
          message: 'You already voted',
          code: 'already_voted',
        });
      }
      throw err;
    }
    return this.findOne(userId, id);
  }

  // ---------------------------------------------------------------------------
  // Cierre de batallas vencidas
  // ---------------------------------------------------------------------------

  /** Cierra las votaciones vencidas y caduca los retos sin respuesta. */
  async sweep(now = new Date()): Promise<number> {
    this.lastSweep = Date.now();
    await this.prisma.$executeRaw`
      UPDATE "Battle" SET "status" = 'EXPIRED', "updatedAt" = ${now}
      WHERE "status" = 'PENDING' AND "expiresAt" <= ${now}
    `;
    const done = await this.prisma.$queryRaw<
      {
        id: string;
        challengerId: string;
        opponentId: string | null;
        winner: Side | null;
        theme: string | null;
      }[]
    >`
      UPDATE "Battle"
      SET "status" = 'FINISHED',
          "finishedAt" = ${now},
          "updatedAt" = ${now},
          "winner" = CASE
            WHEN "votesA" > "votesB" THEN 'A'::"BattleSide"
            WHEN "votesB" > "votesA" THEN 'B'::"BattleSide"
            ELSE NULL
          END
      WHERE "status" = 'ACTIVE' AND "endsAt" <= ${now}
      RETURNING "id", "challengerId", "opponentId", "winner"::text AS "winner", "theme"
    `;
    for (const b of done) {
      if (!b.opponentId) continue;
      const theme = b.theme ? ` «${b.theme}»` : '';
      const link = `/batallas/${b.id}`;
      if (!b.winner) {
        await this.notifications.notify([b.challengerId, b.opponentId], {
          type: NotificationType.BATTLE_RESULT,
          title: `Empate en la batalla${theme}`,
          body: 'Mismos votos para los dos outfits.',
          link,
        });
        continue;
      }
      const winnerId = b.winner === 'A' ? b.challengerId : b.opponentId;
      const loserId = b.winner === 'A' ? b.opponentId : b.challengerId;
      await this.notifications.notify([winnerId], {
        type: NotificationType.BATTLE_RESULT,
        title: `¡Has ganado la batalla${theme}!`,
        body: 'La comunidad ha elegido tu outfit.',
        link,
      });
      await this.notifications.notify([loserId], {
        type: NotificationType.BATTLE_RESULT,
        title: `Batalla${theme} terminada`,
        body: 'Esta vez ganó el otro outfit. Mira el resultado.',
        link,
      });
    }
    return done.length;
  }

  private async lazySweep(): Promise<void> {
    if (Date.now() - this.lastSweep < LAZY_SWEEP_MS) return;
    await this.sweep();
  }

  // ---------------------------------------------------------------------------
  // Ayudantes
  // ---------------------------------------------------------------------------

  /** Copia de un outfit tuyo (sin datos de compra), como en el chat. */
  private async snapshot(
    userId: string,
    outfitId: string,
  ): Promise<{ id: string; json: Prisma.InputJsonValue }> {
    const o = await this.prisma.outfit.findFirst({
      where: { id: outfitId, userId, hiddenByAdmin: false },
      select: sharedOutfitSelect,
    });
    if (!o) throw new NotFoundException('Outfit not found');
    if (o.items.length === 0) {
      throw new BadRequestException({
        message: 'This outfit has no garments',
        code: 'empty_outfit',
      });
    }
    return {
      id: o.id,
      json: JSON.parse(JSON.stringify(o)) as Prisma.InputJsonValue,
    };
  }

  private async assertCanChallenge(
    userId: string,
    opponentId: string,
  ): Promise<void> {
    if (opponentId === userId)
      throw new BadRequestException({
        message: 'You cannot challenge yourself',
        code: 'self',
      });
    const other = await this.prisma.user.findUnique({
      where: { id: opponentId },
      select: { id: true, isPrivate: true, ...banSelect },
    });
    if (!other || isBanned(other))
      throw new NotFoundException('User not found');
    if (!(await this.relations.canView(userId, other))) {
      throw new ForbiddenException({
        message: 'You cannot challenge this person',
        code: 'cannot_challenge',
      });
    }
  }

  /** Batalla que puedes ver: sin bloqueos con los participantes ni cuentas suspendidas. */
  private async visibleRow(userId: string, id: string): Promise<BattleRow> {
    const row = await this.prisma.battle.findUnique({
      where: { id },
      select: battleSelect(userId),
    });
    if (!row) throw new NotFoundException('Battle not found');
    const mine = sideOf(row, userId) !== null;
    if (!mine) {
      if (isBanned(row.challenger) || (row.opponent && isBanned(row.opponent)))
        throw new NotFoundException('Battle not found');
      const hidden = await this.hiddenPeople(userId);
      if (
        hidden.includes(row.challengerId) ||
        (row.opponentId && hidden.includes(row.opponentId))
      ) {
        throw new NotFoundException('Battle not found');
      }
      // Lo que no llegó a jugarse (reto directo pendiente, rechazado, retirado
      // o caducado) solo lo ven sus protagonistas. Un reto abierto pendiente sí.
      const played =
        row.status === BattleStatus.ACTIVE ||
        row.status === BattleStatus.FINISHED;
      const openPending = row.status === BattleStatus.PENDING && row.isOpen;
      if (!played && !openPending)
        throw new NotFoundException('Battle not found');
    }
    return row;
  }

  /** Personas con bloqueo contigo (en cualquier dirección). */
  private async hiddenPeople(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return [
      ...new Set(
        rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)),
      ),
    ];
  }

  private finishedFor(userId: string) {
    return this.prisma.battle.findMany({
      where: {
        status: BattleStatus.FINISHED,
        OR: [{ challengerId: userId }, { opponentId: userId }],
      },
      select: {
        challengerId: true,
        opponentId: true,
        winner: true,
        votesA: true,
        votesB: true,
      },
      orderBy: { finishedAt: 'desc' },
      take: 1000,
    });
  }

  private async brief(userId: string): Promise<UserBrief> {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: userBriefSelect,
    });
    return toBrief(u);
  }

  private toView(r: BattleRow, userId: string, now: Date): BattleView {
    const status = effectiveStatus(r, now) as BattleStatus;
    const myVote = (r.votes[0]?.side ?? null) as Side | null;
    const mySide = sideOf(r, userId);
    const block =
      voteBlock(r, userId, now) ?? (myVote ? 'already_voted' : null);
    const reveal = revealVotes(r, userId, myVote !== null, now);
    const finished = status === BattleStatus.FINISHED;
    return {
      id: r.id,
      status,
      theme: r.theme,
      isOpen: r.isOpen,
      challenger: toBrief(r.challenger),
      opponent: r.opponent ? toBrief(r.opponent) : null,
      outfitA: r.challengerOutfit,
      outfitB: r.opponentOutfit,
      votes: reveal
        ? { a: r.votesA, b: r.votesB, shareA: shareA(r.votesA, r.votesB) }
        : null,
      totalVotes: r.votesA + r.votesB,
      // Si la base de datos aún no la cerró, el ganador sale de los votos.
      winner: finished
        ? ((r.winner as Side | null) ??
          (r.status === BattleStatus.ACTIVE
            ? winnerOf(r.votesA, r.votesB)
            : null))
        : null,
      mySide,
      myVote,
      canVote: block === null,
      voteBlock: block,
      canAccept:
        status === BattleStatus.PENDING &&
        mySide !== 'A' &&
        (r.opponentId === userId || (r.isOpen && r.opponentId === null)),
      canDecline:
        status === BattleStatus.PENDING && r.opponentId === userId && !r.isOpen,
      canCancel: status === BattleStatus.PENDING && mySide === 'A',
      expiresAt: r.expiresAt,
      startedAt: r.startedAt,
      endsAt: r.endsAt,
      finishedAt:
        status === BattleStatus.FINISHED ? (r.finishedAt ?? r.endsAt) : null,
      createdAt: r.createdAt,
    };
  }
}

function who(u: UserBrief): string {
  return u.username ? `@${u.username}` : (u.displayName ?? 'Alguien');
}
