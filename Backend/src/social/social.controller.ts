import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { PageDto, SearchPeopleDto } from './dto/social.dto';
import { SocialService } from './social.service';

const uuid = new ParseUUIDPipe();

@ApiTags('social')
@ApiBearerAuth()
@Controller()
export class SocialController {
  constructor(private readonly social: SocialService) {}

  /** Buscar personas por @usuario o nombre. */
  @Get('people/search')
  search(@CurrentUser() user: AuthenticatedUser, @Query() q: SearchPeopleDto) {
    return this.social.search(user.id, q.q);
  }

  /** Perfil de otra persona (por id o @usuario), con lo que puedes ver según su privacidad. */
  @Get('people/:handle')
  profile(
    @CurrentUser() user: AuthenticatedUser,
    @Param('handle') handle: string,
  ) {
    return this.social.profile(user.id, handle.slice(0, 64));
  }

  @Get('people/:id/avatar')
  avatar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.image(user.id, id, 'avatar', res);
  }

  @Get('people/:id/cover')
  cover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.image(user.id, id, 'cover', res);
  }

  @Get('people/:handle/outfits')
  outfits(
    @CurrentUser() user: AuthenticatedUser,
    @Param('handle') handle: string,
    @Query() p: PageDto,
  ) {
    return this.social.sharedOutfits(
      user.id,
      handle.slice(0, 64),
      p.page,
      p.pageSize,
    );
  }

  @Get('people/:handle/followers')
  followers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('handle') handle: string,
    @Query() p: PageDto,
  ) {
    return this.social.connections(
      user.id,
      handle.slice(0, 64),
      'followers',
      p.page,
      p.pageSize,
    );
  }

  @Get('people/:handle/following')
  following(
    @CurrentUser() user: AuthenticatedUser,
    @Param('handle') handle: string,
    @Query() p: PageDto,
  ) {
    return this.social.connections(
      user.id,
      handle.slice(0, 64),
      'following',
      p.page,
      p.pageSize,
    );
  }

  /** Seguir (o enviar solicitud si la cuenta es privada). */
  @Post('people/:id/follow')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  follow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.social.follow(user.id, id);
  }

  /** Dejar de seguir o cancelar la solicitud. */
  @Delete('people/:id/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  unfollow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.social.unfollow(user.id, id);
  }

  /** Quitar a esta persona de tus seguidores. */
  @Delete('people/:id/follower')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFollower(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.social.removeFollower(user.id, id);
  }

  @Post('people/:id/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  block(@CurrentUser() user: AuthenticatedUser, @Param('id', uuid) id: string) {
    return this.social.block(user.id, id);
  }

  @Delete('people/:id/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.social.unblock(user.id, id);
  }

  /** Solicitudes para seguirte (cuenta privada). */
  @Get('follow-requests')
  requests(@CurrentUser() user: AuthenticatedUser) {
    return this.social.requests(user.id);
  }

  @Post('follow-requests/:id/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.social.acceptRequest(user.id, id);
  }

  @Delete('follow-requests/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.social.removeFollower(user.id, id);
  }

  /** Personas que has bloqueado. */
  @Get('blocks')
  blocked(@CurrentUser() user: AuthenticatedUser) {
    return this.social.blocked(user.id);
  }

  private async image(
    viewerId: string,
    id: string,
    kind: 'avatar' | 'cover',
    res: Response,
  ): Promise<StreamableFile> {
    const { data, mimeType } = await this.social.image(viewerId, id, kind);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; img-src 'self'; sandbox",
    );
    return new StreamableFile(data, {
      type: mimeType,
      length: data.length,
      disposition: 'inline',
    });
  }
}
