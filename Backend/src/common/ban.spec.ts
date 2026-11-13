import { ForbiddenException } from '@nestjs/common';
import { bannedError, isBanned, notBannedWhere } from './ban';

describe('ban', () => {
  const now = new Date('2026-11-12T12:00:00Z');
  const ban = (bannedUntil: Date | null) => ({
    bannedAt: new Date('2026-11-01T00:00:00Z'),
    bannedUntil,
    banReason: 'spam',
  });

  it('sin baneo: no está baneado', () => {
    expect(
      isBanned({ bannedAt: null, bannedUntil: null, banReason: null }, now),
    ).toBe(false);
  });

  it('baneo indefinido: sí', () => {
    expect(isBanned(ban(null), now)).toBe(true);
  });

  it('baneo temporal: sí hasta la fecha, no después', () => {
    expect(isBanned(ban(new Date('2026-11-13T00:00:00Z')), now)).toBe(true);
    expect(isBanned(ban(new Date('2026-11-12T12:00:00Z')), now)).toBe(false);
    expect(isBanned(ban(new Date('2026-11-10T00:00:00Z')), now)).toBe(false);
  });

  it('el filtro de Prisma coincide con isBanned', () => {
    expect(notBannedWhere(now)).toEqual({
      OR: [{ bannedAt: null }, { bannedUntil: { lte: now } }],
    });
  });

  it('el error lleva el código, el motivo y la fecha', () => {
    const until = new Date('2026-12-01T00:00:00Z');
    const err = bannedError(ban(until));
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({
      code: 'banned',
      reason: 'spam',
      until,
    });
  });
});
