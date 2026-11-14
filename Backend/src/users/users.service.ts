import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthProvider, FollowStatus, Prisma } from '@prisma/client';
import { AssetsService } from '../assets/assets.service';
import { PasswordService } from '../auth/password.service';
import { OAuthService } from '../oauth/oauth.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StorageService } from '../storage/storage.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { loadProfile, type ProfileView } from './profile';
import { isValidUsername, RESERVED_USERNAMES } from './profile-options';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly storage: StorageService,
    private readonly assets: AssetsService,
    private readonly oauth: OAuthService,
    private readonly realtime?: RealtimeService,
  ) {}

  async getProfile(userId: string): Promise<ProfileView> {
    const user = await loadProfile(this.prisma, userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<ProfileView> {
    if (dto.username && RESERVED_USERNAMES.has(dto.username)) {
      throw new BadRequestException({
        message: 'This username is reserved',
        code: 'username_reserved',
      });
    }
    // La foto y la portada tienen que ser imágenes TUYAS (nunca de otro usuario).
    const imageIds = [dto.avatarAssetId, dto.coverAssetId].filter(
      (id): id is string => typeof id === 'string',
    );
    if (imageIds.length) {
      const owned = await this.prisma.asset.count({
        where: { userId, id: { in: [...new Set(imageIds)] } },
      });
      if (owned !== new Set(imageIds).size)
        throw new BadRequestException('The image does not exist');
    }
    if (dto.avatarAssetId && dto.avatarAssetId === dto.coverAssetId) {
      throw new BadRequestException(
        'Use different images for the photo and the cover',
      );
    }

    const before = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { avatarAssetId: true, coverAssetId: true },
    });
    if (!before) throw new NotFoundException('User not found');

    const data: Prisma.UserUpdateInput = {
      displayName: dto.displayName,
      username: dto.username,
      bio: dto.bio,
      pronouns: dto.pronouns,
      location: dto.location,
      website: dto.website,
      instagramHandle: dto.instagramHandle,
      styleTags: dto.styleTags,
      favoriteColors: dto.favoriteColors,
      sizeTop: dto.sizeTop,
      sizeBottom: dto.sizeBottom,
      sizeShoes: dto.sizeShoes,
      accentColor: dto.accentColor,
      isPrivate: dto.isPrivate,
      messagePolicy: dto.messagePolicy,
      locale: dto.locale,
    };
    // Las relaciones se cambian con connect / disconnect.
    if (dto.avatarAssetId !== undefined) {
      data.avatarAsset =
        dto.avatarAssetId === null
          ? { disconnect: true }
          : { connect: { id: dto.avatarAssetId } };
    }
    if (dto.coverAssetId !== undefined) {
      data.coverAsset =
        dto.coverAssetId === null
          ? { disconnect: true }
          : { connect: { id: dto.coverAssetId } };
    }

    try {
      await this.prisma.user.update({ where: { id: userId }, data });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const raw = (err.meta as { target?: unknown } | undefined)?.target;
        const target = Array.isArray(raw)
          ? raw.join(',')
          : typeof raw === 'string'
            ? raw
            : '';
        if (target.includes('username'))
          throw new ConflictException({
            message: 'This username is already taken',
            code: 'username_taken',
          });
        throw new ConflictException(
          'This image is already used as your photo or cover',
        );
      }
      throw err;
    }

    // Al pasar a cuenta pública, las solicitudes pendientes quedan aceptadas.
    if (dto.isPrivate === false) {
      await this.prisma.follow.updateMany({
        where: { followingId: userId, status: FollowStatus.PENDING },
        data: { status: FollowStatus.ACCEPTED, acceptedAt: new Date() },
      });
    }

    // La foto o portada anterior ya no se usa: se borra (si no la usa una prenda).
    for (const [old, now] of [
      [before.avatarAssetId, dto.avatarAssetId],
      [before.coverAssetId, dto.coverAssetId],
    ] as const) {
      if (old && now !== undefined && now !== old)
        await this.assets.removeIfUnused(userId, old).catch(() => undefined);
    }
    return this.getProfile(userId);
  }

  /** ¿Está libre ese @usuario? (el tuyo cuenta como libre). */
  async usernameAvailable(
    userId: string,
    username: string,
  ): Promise<{ username: string; available: boolean; valid: boolean }> {
    if (!isValidUsername(username))
      return { username, available: false, valid: false };
    const taken = await this.prisma.user.findFirst({
      where: { username, NOT: { id: userId } },
      select: { id: true },
    });
    return { username, available: !taken, valid: true };
  }

  /**
   * Crea o cambia la contraseña. Con contraseña pide la actual; sin ella
   * (cuenta de Google/Apple) pide la prueba de volver a entrar con el proveedor.
   */
  async setPassword(userId: string, dto: SetPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) throw new NotFoundException('User not found');
    await this.confirmIdentity(
      userId,
      user.passwordHash,
      dto.currentPassword,
      dto.reauthToken,
    );
    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  /** Desconecta Google, Apple o Instagram. */
  unlinkAccount(userId: string, provider: AuthProvider): Promise<void> {
    return this.oauth.unlink(userId, provider);
  }

  /**
   * Borra la cuenta y TODOS sus datos (lo exigen App Store y Google Play para
   * las apps que permiten crear cuenta). Pide la contraseña actual (o, sin
   * contraseña, volver a entrar con Google/Apple): un token robado no basta.
   *
   * En la base de datos, armarios, prendas, outfits, imágenes, suscripciones
   * y cuentas conectadas caen en cascada (onDelete: Cascade). Los archivos de
   * las imágenes se borran después del almacenamiento; si alguno falla queda
   * huérfano (se registra), pero la cuenta ya no existe.
   */
  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, assets: { select: { storageKey: true } } },
    });
    if (!user) throw new NotFoundException('User not found');

    await this.confirmIdentity(
      userId,
      user.passwordHash,
      dto.password,
      dto.reauthToken,
    );

    await this.prisma.user.delete({ where: { id: userId } });
    // Cierra sus conexiones en tiempo real (chats abiertos en otras pestañas).
    this.realtime?.disconnect(userId, 4003, 'account deleted');

    const results = await Promise.allSettled(
      user.assets.map((a) => this.storage.delete(a.storageKey)),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0)
      this.logger.warn(
        `Cuenta borrada; ${failed} archivo(s) no se pudieron borrar del almacenamiento`,
      );
  }

  /** 403 (y no 401): un 401 haría que el cliente cerrase la sesión. */
  private async confirmIdentity(
    userId: string,
    passwordHash: string | null,
    password: string | undefined,
    reauthToken: string | undefined,
  ): Promise<void> {
    if (passwordHash !== null) {
      if (!password || !(await this.passwords.verify(passwordHash, password))) {
        throw new ForbiddenException('Incorrect password');
      }
      return;
    }
    if (
      !reauthToken ||
      !(await this.oauth.consumeReauthProof(userId, reauthToken))
    ) {
      throw new ForbiddenException({
        message: 'Confirm your identity with Google or Apple again',
        code: 'reauth_required',
      });
    }
  }
}
