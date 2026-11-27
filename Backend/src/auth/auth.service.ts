import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { banSelect, bannedError, isBanned } from '../common/ban';
import type { AppConfig } from '../config/env.validation';
import type { JwtPayload } from '../common/types/authenticated-user';
import { PrismaService } from '../prisma/prisma.service';
import { loadProfile, type ProfileView } from '../users/profile';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { EmailAuthService } from './email-auth.service';
import { PasswordService } from './password.service';

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Segundos hasta que el token caduca. */
  expiresIn: number;
  user: ProfileView;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService<AppConfig, true>,
    @Optional() private readonly emailAuth?: EmailAuthService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const passwordHash = await this.passwords.hash(dto.password);
    try {
      // No se crea suscripción: sin suscripción activa se aplica el plan por
      // defecto (FREE). Ver PlansService.getEffectivePlan().
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          displayName: dto.displayName ?? null,
          locale: dto.locale,
        },
        select: { id: true },
      });
      // Correo para confirmar el email (si hay correo configurado). Si no sale,
      // la cuenta se crea igual: se puede reenviar desde «Cuenta».
      await this.emailAuth?.sendVerification(user.id).catch(() => undefined);
      return this.issue(user.id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, passwordHash: true },
    });

    // Sin usuario, o cuenta creada con Google/Apple que aún no tiene
    // contraseña: mismo mensaje y mismo tiempo de respuesta que una
    // contraseña incorrecta (no revelamos qué emails existen).
    if (!user || user.passwordHash === null) {
      await this.passwords.verifyDummy(dto.password);
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await this.passwords.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.issue(user.id);
  }

  /**
   * Firma un token de acceso para el usuario y devuelve su perfil (sin el
   * hash de la contraseña). Lo usan el registro, el login y el login con
   * Google/Apple.
   */
  /**
   * Cierra la sesión de verdad: sube la versión y todos los tokens emitidos
   * hasta ahora (en este y en otros dispositivos) dejan de valer.
   */
  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
    });
  }

  async issue(userId: string): Promise<AuthResponse> {
    // Una cuenta baneada no recibe token (ni con contraseña ni con Google/Apple).
    const ban = await this.prisma.user.findUnique({
      where: { id: userId },
      select: banSelect,
    });
    if (ban && isBanned(ban)) throw bannedError(ban);
    const user = await loadProfile(this.prisma, userId);
    if (!user) throw new NotFoundException('User not found');
    const { sessionVersion } = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { sessionVersion: true },
    });
    const payload: JwtPayload = { sub: user.id, email: user.email, sv: sessionVersion };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get('JWT_EXPIRES_IN_SECONDS', { infer: true }),
      user,
    };
  }
}
