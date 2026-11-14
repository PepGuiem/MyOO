import {
  acceptDeadline,
  effectiveStatus,
  leaderboard,
  recordOf,
  revealVotes,
  shareA,
  sideOf,
  voteBlock,
  voteDeadline,
  winnerOf,
  winStreak,
  type BattleLike,
} from './battles.rules';

const NOW = new Date('2026-11-13T12:00:00Z');
const H = 3_600_000;
const battle = (extra: Partial<BattleLike> = {}): BattleLike => ({
  challengerId: 'ana',
  opponentId: 'leo',
  status: 'ACTIVE',
  votesA: 0,
  votesB: 0,
  expiresAt: new Date(NOW.getTime() + 10 * H),
  endsAt: new Date(NOW.getTime() + 10 * H),
  ...extra,
});

describe('battles.rules', () => {
  it('plazos: 48 h de votación y 72 h para aceptar', () => {
    expect(voteDeadline(NOW).getTime() - NOW.getTime()).toBe(48 * H);
    expect(acceptDeadline(NOW).getTime() - NOW.getTime()).toBe(72 * H);
  });

  it('ganador por votos y empate', () => {
    expect(winnerOf(3, 1)).toBe('A');
    expect(winnerOf(1, 3)).toBe('B');
    expect(winnerOf(2, 2)).toBe(null);
    expect(winnerOf(0, 0)).toBe(null);
    expect(shareA(0, 0)).toBe(50);
    expect(shareA(3, 1)).toBe(75);
  });

  it('estado real: caduca y termina aunque la base de datos no lo haya apuntado', () => {
    expect(
      effectiveStatus(
        battle({ status: 'PENDING', expiresAt: new Date(NOW.getTime() - 1) }),
        NOW,
      ),
    ).toBe('EXPIRED');
    expect(effectiveStatus(battle({ status: 'PENDING' }), NOW)).toBe('PENDING');
    expect(effectiveStatus(battle({ endsAt: NOW }), NOW)).toBe('FINISHED');
    expect(effectiveStatus(battle(), NOW)).toBe('ACTIVE');
    expect(effectiveStatus(battle({ status: 'DECLINED' }), NOW)).toBe(
      'DECLINED',
    );
  });

  it('nadie vota en su propia batalla ni fuera de plazo', () => {
    const b = battle();
    expect(sideOf(b, 'ana')).toBe('A');
    expect(sideOf(b, 'leo')).toBe('B');
    expect(sideOf(b, 'eva')).toBe(null);
    expect(voteBlock(b, 'ana', NOW)).toBe('own_battle');
    expect(voteBlock(b, 'leo', NOW)).toBe('own_battle');
    expect(voteBlock(b, 'eva', NOW)).toBe(null);
    expect(
      voteBlock(battle({ endsAt: new Date(NOW.getTime() - 1) }), 'eva', NOW),
    ).toBe('not_active');
    expect(
      voteBlock(battle({ status: 'PENDING', opponentId: null }), 'eva', NOW),
    ).toBe('not_active');
  });

  it('los votos se ocultan hasta votar (salvo a los participantes) y se ven al terminar', () => {
    const b = battle({ votesA: 4, votesB: 2 });
    expect(revealVotes(b, 'eva', false, NOW)).toBe(false);
    expect(revealVotes(b, 'eva', true, NOW)).toBe(true);
    expect(revealVotes(b, 'ana', false, NOW)).toBe(true);
    expect(revealVotes(battle({ status: 'FINISHED' }), 'eva', false, NOW)).toBe(
      true,
    );
    expect(revealVotes(battle({ status: 'PENDING' }), 'ana', false, NOW)).toBe(
      false,
    );
  });

  it('ranking: victorias, luego % y votos; los empates no suman victorias', () => {
    const rows = leaderboard([
      {
        challengerId: 'ana',
        opponentId: 'leo',
        winner: 'A',
        votesA: 5,
        votesB: 2,
      },
      {
        challengerId: 'leo',
        opponentId: 'eva',
        winner: 'A',
        votesA: 3,
        votesB: 1,
      },
      {
        challengerId: 'eva',
        opponentId: 'ana',
        winner: 'B',
        votesA: 1,
        votesB: 6,
      },
      {
        challengerId: 'leo',
        opponentId: 'ana',
        winner: null,
        votesA: 2,
        votesB: 2,
      },
      {
        challengerId: 'max',
        opponentId: null,
        winner: null,
        votesA: 0,
        votesB: 0,
      },
    ]);
    expect(rows.map((r) => r.userId)).toEqual(['ana', 'leo']);
    expect(rows[0]).toEqual({
      userId: 'ana',
      wins: 2,
      losses: 0,
      ties: 1,
      played: 3,
      votes: 13,
      winRate: 67,
    });
    expect(rows[1]).toEqual({
      userId: 'leo',
      wins: 1,
      losses: 1,
      ties: 1,
      played: 3,
      votes: 7,
      winRate: 33,
    });
    expect(
      recordOf('eva', [
        {
          challengerId: 'eva',
          opponentId: 'ana',
          winner: 'B',
          votesA: 1,
          votesB: 6,
        },
      ]),
    ).toEqual({
      userId: 'eva',
      wins: 0,
      losses: 1,
      ties: 0,
      played: 1,
      votes: 1,
      winRate: 0,
    });
    expect(recordOf('nadie', []).played).toBe(0);
  });

  it('racha de victorias seguidas', () => {
    const list = [
      {
        challengerId: 'ana',
        opponentId: 'leo',
        winner: 'A' as const,
        votesA: 1,
        votesB: 0,
      },
      {
        challengerId: 'eva',
        opponentId: 'ana',
        winner: 'B' as const,
        votesA: 0,
        votesB: 1,
      },
      {
        challengerId: 'ana',
        opponentId: 'eva',
        winner: null,
        votesA: 1,
        votesB: 1,
      },
      {
        challengerId: 'ana',
        opponentId: 'leo',
        winner: 'A' as const,
        votesA: 1,
        votesB: 0,
      },
    ];
    expect(winStreak('ana', list)).toBe(2);
    expect(winStreak('leo', list)).toBe(0);
  });
});
