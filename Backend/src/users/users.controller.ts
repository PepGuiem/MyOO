import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthProvider } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { InstagramService } from '../oauth/instagram.service';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsernameQueryDto } from './dto/username-query.dto';
import { UsersService } from './users.service';

/** En la URL van en minúsculas: /users/me/accounts/google */
enum ProviderParam {
  google = 'google',
  apple = 'apple',
  instagram = 'instagram',
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly instagram: InstagramService,
  ) {}

  /** Perfil del usuario autenticado (con sus cuentas conectadas). */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.getProfile(user.id);
  }

  /** Actualiza el perfil: nombre, @usuario, bio, foto, portada, estilos, tallas... */
  @Patch('me')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.users.updateProfile(user.id, dto);
  }

  /** ¿Está libre un @usuario? */
  @Get('me/username-available')
  usernameAvailable(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: UsernameQueryDto,
  ) {
    return this.users.usernameAvailable(user.id, q.username);
  }

  /** Crea o cambia la contraseña (limita intentos: comprueba contraseñas). */
  @Post('me/password')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  setPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetPasswordDto,
  ): Promise<void> {
    return this.users.setPassword(user.id, dto);
  }

  /** Desconecta Google, Apple o Instagram. */
  @Delete('me/accounts/:provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provider', new ParseEnumPipe(ProviderParam))
    provider: ProviderParam,
  ): Promise<void> {
    return this.users.unlinkAccount(
      user.id,
      provider.toUpperCase() as AuthProvider,
    );
  }

  /** Perfil y últimas publicaciones de la cuenta de Instagram conectada. */
  @Get('me/instagram')
  instagramOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.instagram.overview(user.id);
  }

  /** Usa la foto de perfil de Instagram como foto de perfil. */
  @Post('me/instagram/use-photo')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  useInstagramPhoto(@CurrentUser() user: AuthenticatedUser) {
    return this.instagram.useProfilePhoto(user.id);
  }

  /**
   * Borra la cuenta y todos sus datos. Pide la contraseña actual (o la prueba
   * de identidad de Google/Apple) y limita los intentos.
   */
  @Delete('me')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ): Promise<void> {
    return this.users.deleteAccount(user.id, dto);
  }
}
