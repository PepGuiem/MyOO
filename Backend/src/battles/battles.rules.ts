/**
 * STREETWEAR BATTLES: reglas puras (sin base de datos), probadas en
 * battles.rules.spec.ts.
 */
export type Side = 'A' | 'B';
export type Status =
  'PENDING' | 'ACTIVE' | 'FINISHED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';

/** Horas de votación desde que se acepta el reto. */
export const VOTE_HOURS = 48;
/** Horas para aceptar un reto antes de que caduque. */
export const ACCEPT_HOURS = 72;
/** Retos pendientes que puedes tener enviados a la vez (frena el spam). */
export const MAX_PENDING_SENT = 10;

const HOUR = 3_600_000;

export function voteDeadline(start: Date): Date {
  return new Date(start.getTime() + VOTE_HOURS * HOUR);
}

export function acceptDeadline(created: Date): Date {
  return new Date(created.getTime() + ACCEPT_HOURS * HOUR);
}

export interface BattleLike {
  challengerId: string;
  opponentId: string | null;
  status: Status;
  votesA: number;
  votesB: number;
  expiresAt: Date;
  endsAt: Date | null;
}

/** Ganador por votos; null = empate. */
export function winnerOf(votesA: number, votesB: number): Side | null {
  if (votesA === votesB) return null;
  return votesA > votesB ? 'A' : 'B';
}

/**
 * Estado real en este momento: un reto pendiente cuya fecha pasó está
 * caducado y una votación cuyo plazo terminó está acabada, aunque la base de
 * datos aún no lo haya apuntado (se cierra en cuanto alguien la consulta y
 * cada minuto).
 */
export function effectiveStatus(
  b: Pick<BattleLike, 'status' | 'expiresAt' | 'endsAt'>,
  now = new Date(),
): Status {
  if (b.status === 'PENDING' && b.expiresAt.getTime() <= now.getTime())
    return 'EXPIRED';
  if (b.status === 'ACTIVE' && b.endsAt && b.endsAt.getTime() <= now.getTime())
    return 'FINISHED';
  return b.status;
}

/** Lado de una persona en la batalla (null si no participa). */
export function sideOf(
  b: Pick<BattleLike, 'challengerId' | 'opponentId'>,
  userId: string,
): Side | null {
  if (b.challengerId === userId) return 'A';
  if (b.opponentId === userId) return 'B';
  return null;
}

export type VoteBlock = 'not_active' | 'own_battle' | null;

/** ¿Puede votar? Nunca en tu propia batalla y solo mientras se vota. */
export function voteBlock(
  b: BattleLike,
  userId: string,
  now = new Date(),
): VoteBlock {
  if (sideOf(b, userId)) return 'own_battle';
  if (effectiveStatus(b, now) !== 'ACTIVE') return 'not_active';
  return null;
}

/**
 * ¿Se enseñan los votos? Mientras se vota, solo a quien ya votó y a los dos
 * participantes (así nadie vota «al que va ganando»). Al terminar, a todos.
 */
export function revealVotes(
  b: BattleLike,
  userId: string,
  voted: boolean,
  now = new Date(),
): boolean {
  const s = effectiveStatus(b, now);
  if (s === 'FINISHED') return true;
  if (s !== 'ACTIVE') return false;
  return voted || sideOf(b, userId) !== null;
}

/** Porcentaje del lado A (0-100, redondeado; 50 si no hay votos). */
export function shareA(votesA: number, votesB: number): number {
  const t = votesA + votesB;
  return t === 0 ? 50 : Math.round((votesA / t) * 100);
}

export interface FinishedBattle {
  challengerId: string;
  opponentId: string | null;
  winner: Side | null;
  votesA: number;
  votesB: number;
}

export interface LeaderRow {
  userId: string;
  wins: number;
  losses: number;
  ties: number;
  played: number;
  /** Votos recibidos en todas sus batallas. */
  votes: number;
  /** % de victorias (0-100). */
  winRate: number;
}

/**
 * Ranking de ganadores: más victorias primero; a igualdad, mejor % de
 * victorias, luego más votos recibidos y, por último, el id (orden estable).
 */
export function leaderboard(
  battles: FinishedBattle[],
  limit = 50,
): LeaderRow[] {
  const out = [...tally(battles).values()].filter((r) => r.wins > 0);
  out.sort(
    (x, y) =>
      y.wins - x.wins ||
      y.winRate - x.winRate ||
      y.votes - x.votes ||
      x.userId.localeCompare(y.userId),
  );
  return out.slice(0, limit);
}

/** Récord de una persona (aunque no tenga victorias). */
export function recordOf(userId: string, battles: FinishedBattle[]): LeaderRow {
  return (
    tally(battles).get(userId) ?? {
      userId,
      wins: 0,
      losses: 0,
      ties: 0,
      played: 0,
      votes: 0,
      winRate: 0,
    }
  );
}

function tally(battles: FinishedBattle[]): Map<string, LeaderRow> {
  const rows = new Map<string, LeaderRow>();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      r = {
        userId: id,
        wins: 0,
        losses: 0,
        ties: 0,
        played: 0,
        votes: 0,
        winRate: 0,
      };
      rows.set(id, r);
    }
    return r;
  };
  for (const b of battles) {
    if (!b.opponentId) continue;
    const a = row(b.challengerId);
    const o = row(b.opponentId);
    a.played++;
    o.played++;
    a.votes += b.votesA;
    o.votes += b.votesB;
    if (b.winner === 'A') {
      a.wins++;
      o.losses++;
    } else if (b.winner === 'B') {
      o.wins++;
      a.losses++;
    } else {
      a.ties++;
      o.ties++;
    }
  }
  for (const r of rows.values())
    r.winRate = r.played ? Math.round((r.wins / r.played) * 100) : 0;
  return rows;
}

/** Racha actual de victorias (de la batalla más reciente hacia atrás). */
export function winStreak(
  userId: string,
  newestFirst: FinishedBattle[],
): number {
  let n = 0;
  for (const b of newestFirst) {
    const s = sideOf(
      { challengerId: b.challengerId, opponentId: b.opponentId },
      userId,
    );
    if (!s) continue;
    if (b.winner === s) n++;
    else break;
  }
  return n;
}
