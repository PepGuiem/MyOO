import { EmailTokenPurpose } from '@prisma/client';
import {
  hashToken,
  looksLikeToken,
  newEmailToken,
  tokenProblem,
  TOKEN_TTL_MS,
} from './email-tokens';

const now = new Date('2026-11-27T10:00:00Z');
const RESET = EmailTokenPurpose.RESET_PASSWORD;
const VERIFY = EmailTokenPurpose.VERIFY_EMAIL;

describe('tokens de los enlaces por correo', () => {
  it('el token es aleatorio y solo se guarda su hash SHA-256', () => {
    const a = newEmailToken(RESET, now);
    const b = newEmailToken(RESET, now);
    expect(a.token).not.toBe(b.token);
    expect(looksLikeToken(a.token)).toBe(true);
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tokenHash).toBe(hashToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
  });

  it('caduca en 1 h (contraseña) y en 24 h (verificar email)', () => {
    expect(newEmailToken(RESET, now).expiresAt.getTime() - now.getTime()).toBe(60 * 60 * 1000);
    expect(newEmailToken(VERIFY, now).expiresAt.getTime() - now.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(TOKEN_TTL_MS[RESET]).toBe(3_600_000);
  });

  it('looksLikeToken rechaza basura', () => {
    expect(looksLikeToken('')).toBe(false);
    expect(looksLikeToken('a'.repeat(42))).toBe(false);
    expect(looksLikeToken('a'.repeat(43))).toBe(true);
    expect(looksLikeToken(`${'a'.repeat(42)}$`)).toBe(false);
    expect(looksLikeToken(123)).toBe(false);
  });

  describe('tokenProblem', () => {
    const row = (over: Partial<{ purpose: EmailTokenPurpose; expiresAt: Date; usedAt: Date | null; email: string }> = {}) => ({
      purpose: RESET,
      expiresAt: new Date(now.getTime() + 1000),
      usedAt: null,
      email: 'ana@example.com',
      ...over,
    });

    it('válido', () => {
      expect(tokenProblem(row(), RESET, 'ana@example.com', now)).toBeNull();
    });
    it('no existe o es de otro tipo', () => {
      expect(tokenProblem(null, RESET, null, now)).toBe('invalid');
      expect(tokenProblem(row({ purpose: VERIFY }), RESET, 'ana@example.com', now)).toBe('invalid');
    });
    it('caducado (también justo en el instante de caducar)', () => {
      expect(tokenProblem(row({ expiresAt: now }), RESET, 'ana@example.com', now)).toBe('expired');
      expect(tokenProblem(row({ expiresAt: new Date(now.getTime() - 1) }), RESET, 'ana@example.com', now)).toBe('expired');
    });
    it('un solo uso', () => {
      expect(tokenProblem(row({ usedAt: now }), RESET, 'ana@example.com', now)).toBe('used');
    });
    it('si la cuenta cambió de email, el enlace deja de valer', () => {
      expect(tokenProblem(row(), RESET, 'otra@example.com', now)).toBe('invalid');
    });
  });
});
