import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthProvider, EmailTokenPurpose } from '@prisma/client';
import {
  hashToken,
  looksLikeToken,
  newEmailToken,
  RESEND_COOLDOWN_MS,
  tokenProblem,
  type TokenProblem,
} from '../mail/email-tokens';
import { MailService } from '../mail/mail.service';
import { oauthOnlyMail, resetPasswordMail, verifyEmailMail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';

/**
 * Respuesta de «He olvidado mi contraseña»: SIEMPRE la misma, exista la
 * cuenta o no (así no sirve para averiguar qué emails están registrados).
 */
export const FORGOT_PASSWORD_RESPONSE = {
  message: 'If an account exists for that email, we have sent a link to it.',
} as const;

export type VerificationResult = 'sent' | 'already_verified' | 'wait' | 'failed';

function tokenError(problem: TokenProblem): BadRequestException {
  const byProblem = {
    invalid: { message: 'This link is not valid', code: 'token_invalid' },
    used: { message: 'This link has already been used', code: 'token_used' },
    expired: { message: 'This link has expired', code: 'token_expired' },
  } as const;
  return new BadRequestException(byProblem[problem]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Enlaces por correo para la cuenta: contraseña olvidada y verificar el email.
 *
 * - Tokens aleatorios de un solo uso; en la base de datos solo su hash
 *   (ver mail/email-tokens.ts). Contraseña: 1 h. Verificar: 24 h.
 * - Como mucho un correo de cada tipo por minuto y cuenta (además del límite
 *   por IP del ThrottlerGuard en el controlador).
 * - Cambiar la contraseña con el enlace cierra todas las sesiones
 *   (sessionVersion) y anula los demás enlaces pendientes.
 */
@Injectable()
export class EmailAuthService {
  private readonly logger = new Logger('EmailAuth');
  /**
   * Tiempo mínimo de respuesta de «olvidé la contraseña»: así tarda casi lo
   * mismo con o sin cuenta (enviar el correo lleva unos cientos de ms).
   * Los tests lo ponen a 0.
   */
  minForgotMs = 1200;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly passwords: PasswordService,
  ) {}

  // ------------------------------------------------ contraseña olvidada

  async forgotPassword(email: string, now = new Date()): Promise<typeof FORGOT_PASSWORD_RESPONSE> {
    if (!this.mail.enabled) {
      // Sin correo no se puede, para nadie (no revela nada de la cuenta).
      throw new ServiceUnavailableException({ message: 'Email is not available', code: 'mail_disabled' });
    }
    const started = Date.now();
    try {
      await this.sendReset(email, now);
    } catch (err) {
      // Un fallo tampoco cambia la respuesta (se apunta sin datos de la cuenta).
      this.logger.warn(`Contraseña olvidada: ${err instanceof Error ? err.name : 'error'}`);
    }
    const wait = this.minForgotMs - (Date.now() - started);
    if (wait > 0) await sleep(wait);
    return { ...FORGOT_PASSWORD_RESPONSE };
  }

  private async sendReset(email: string, now: Date): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        locale: true,
        passwordHash: true,
        authAccounts: {
          where: { provider: { in: [AuthProvider.GOOGLE, AuthProvider.APPLE] } },
          select: { provider: true },
        },
      },
    });
    if (!user) return;
    if (await this.sentRecently(user.id, EmailTokenPurpose.RESET_PASSWORD, now)) return;

    const opts = { frontendUrl: this.mail.frontendUrl };
    if (user.passwordHash === null) {
      // Cuenta de Google/Apple sin contraseña: el correo explica cómo entrar.
      // Se guarda una marca ya usada (no hay enlace) solo para el límite de 1/min.
      const marker = newEmailToken(EmailTokenPurpose.RESET_PASSWORD, now);
      await this.prisma.emailToken.create({
        data: {
          userId: user.id,
          purpose: EmailTokenPurpose.RESET_PASSWORD,
          tokenHash: marker.tokenHash,
          email: user.email,
          expiresAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
          usedAt: now,
        },
      });
      const providers = user.authAccounts.map((a) => a.provider as 'GOOGLE' | 'APPLE');
      await this.mail.send({
        to: user.email,
        ...oauthOnlyMail(user.locale, providers, `${this.mail.frontendUrl}/login`, opts),
      });
      return;
    }

    const token = await this.issue(user.id, user.email, EmailTokenPurpose.RESET_PASSWORD, now);
    const url = `${this.mail.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send({ to: user.email, ...resetPasswordMail(user.locale, url, opts) });
  }

  /** Pone la contraseña nueva con el enlace del correo. */
  async resetPassword(token: string, password: string, now = new Date()): Promise<void> {
    const row = await this.findToken(token);
    const problem = tokenProblem(row, EmailTokenPurpose.RESET_PASSWORD, row?.user.email ?? null, now);
    if (problem || !row) throw tokenError(problem ?? 'invalid');
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      // Un solo uso, también con dos peticiones a la vez: solo una lo marca.
      const { count } = await tx.emailToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count !== 1) throw tokenError('used');
      // Los demás enlaces de contraseña pendientes dejan de valer.
      await tx.emailToken.updateMany({
        where: { userId: row.userId, purpose: EmailTokenPurpose.RESET_PASSWORD, usedAt: null },
        data: { usedAt: now },
      });
      await tx.user.update({
        where: { id: row.userId },
        data: {
          passwordHash,
          // Cierra todas las sesiones abiertas (tokens emitidos hasta ahora).
          sessionVersion: { increment: 1 },
          // Ha demostrado que el correo es suyo.
          ...(row.user.emailVerifiedAt === null ? { emailVerifiedAt: now } : {}),
        },
      });
    });
  }

  // ------------------------------------------------------ verificar email

  /** Manda (o reenvía) el enlace para confirmar el email de la cuenta. */
  async sendVerification(userId: string, now = new Date()): Promise<VerificationResult> {
    if (!this.mail.enabled) return 'failed';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, locale: true, emailVerifiedAt: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.emailVerifiedAt) return 'already_verified';
    if (await this.sentRecently(user.id, EmailTokenPurpose.VERIFY_EMAIL, now)) return 'wait';
    const token = await this.issue(user.id, user.email, EmailTokenPurpose.VERIFY_EMAIL, now);
    const url = `${this.mail.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const sent = await this.mail.send({
      to: user.email,
      ...verifyEmailMail(user.locale, url, { frontendUrl: this.mail.frontendUrl }),
    });
    return sent ? 'sent' : 'failed';
  }

  /** «Reenviar» desde la cuenta: errores claros para la web. */
  async resendVerification(userId: string): Promise<{ status: 'sent' | 'already_verified' }> {
    if (!this.mail.enabled) {
      throw new ServiceUnavailableException({ message: 'Email is not available', code: 'mail_disabled' });
    }
    const result = await this.sendVerification(userId);
    if (result === 'wait') {
      throw new HttpException(
        { message: 'Wait a minute before asking for another email', code: 'mail_wait' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (result === 'failed') {
      throw new ServiceUnavailableException({ message: 'The email could not be sent', code: 'mail_failed' });
    }
    return { status: result };
  }

  /** Confirma el email con el enlace del correo. */
  async verifyEmail(token: string, now = new Date()): Promise<{ verified: true }> {
    const row = await this.findToken(token);
    const problem = tokenProblem(row, EmailTokenPurpose.VERIFY_EMAIL, row?.user.email ?? null, now);
    if (problem === 'used' && row?.user.emailVerifiedAt) return { verified: true };
    if (problem || !row) throw tokenError(problem ?? 'invalid');
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.emailToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count !== 1) throw tokenError('used');
      await tx.emailToken.updateMany({
        where: { userId: row.userId, purpose: EmailTokenPurpose.VERIFY_EMAIL, usedAt: null },
        data: { usedAt: now },
      });
      if (row.user.emailVerifiedAt === null) {
        await tx.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: now } });
      }
    });
    return { verified: true };
  }

  // ---------------------------------------------------------------- ayudas

  private async sentRecently(userId: string, purpose: EmailTokenPurpose, now: Date): Promise<boolean> {
    const recent = await this.prisma.emailToken.findFirst({
      where: { userId, purpose, createdAt: { gt: new Date(now.getTime() - RESEND_COOLDOWN_MS) } },
      select: { id: true },
    });
    return recent !== null;
  }

  /** Crea el token (guarda solo el hash) y devuelve el valor para el enlace. */
  private async issue(userId: string, email: string, purpose: EmailTokenPurpose, now: Date): Promise<string> {
    // Limpieza: los enlaces caducados de la cuenta ya no sirven para nada.
    await this.prisma.emailToken.deleteMany({ where: { userId, expiresAt: { lt: now } } });
    const { token, tokenHash, expiresAt } = newEmailToken(purpose, now);
    await this.prisma.emailToken.create({ data: { userId, purpose, tokenHash, email, expiresAt } });
    return token;
  }

  private findToken(token: string) {
    if (!looksLikeToken(token)) return Promise.resolve(null);
    return this.prisma.emailToken.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        userId: true,
        purpose: true,
        email: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { email: true, emailVerifiedAt: true } },
      },
    });
  }
}
