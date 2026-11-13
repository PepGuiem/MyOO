import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  AdminReportsQueryDto,
  AdminUsersQueryDto,
  BanUserDto,
  PageDto,
  PublishReleaseDto,
  ReleaseDto,
  UpdateIdeaAdminDto,
  UpdateReportDto,
} from './admin.dto';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

const uuid = new ParseUUIDPipe();

/** Panel de administración. Solo cuentas con rol ADMIN (ver `npm run admin:grant`). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  stats() {
    return this.admin.stats();
  }

  // Usuarios
  @Get('users')
  users(@Query() q: AdminUsersQueryDto) {
    return this.admin.users(q);
  }

  @Get('users/:id')
  user(@Param('id', uuid) id: string) {
    return this.admin.user(id);
  }

  @Post('users/:id/ban')
  @HttpCode(HttpStatus.OK)
  ban(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: BanUserDto,
  ) {
    return this.admin.ban(me.id, id, dto);
  }

  @Delete('users/:id/ban')
  unban(@CurrentUser() me: AuthenticatedUser, @Param('id', uuid) id: string) {
    return this.admin.unban(me.id, id);
  }

  // Ideas (la lista es GET /ideas: a un admin le salen también las ocultas)
  @Patch('ideas/:id')
  updateIdea(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateIdeaAdminDto,
  ) {
    return this.admin.updateIdea(me.id, id, dto);
  }

  @Delete('ideas/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteIdea(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.deleteIdea(me.id, id);
  }

  // Denuncias y moderación
  @Get('reports')
  reports(@Query() q: AdminReportsQueryDto) {
    return this.admin.reports(q);
  }

  @Patch('reports/:id')
  updateReport(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.admin.updateReport(me.id, id, dto);
  }

  @Post('outfits/:id/hide')
  @HttpCode(HttpStatus.OK)
  hideOutfit(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.setOutfitHidden(me.id, id, true);
  }

  @Delete('outfits/:id/hide')
  unhideOutfit(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.setOutfitHidden(me.id, id, false);
  }

  @Delete('messages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMessage(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.deleteMessage(me.id, id);
  }

  // Novedades
  @Get('releases')
  releases(@Query() q: PageDto) {
    return this.admin.releases(q.page);
  }

  @Post('releases')
  createRelease(@CurrentUser() me: AuthenticatedUser, @Body() dto: ReleaseDto) {
    return this.admin.createRelease(me.id, dto);
  }

  @Put('releases/:id')
  updateRelease(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: ReleaseDto,
  ) {
    return this.admin.updateRelease(me.id, id, dto);
  }

  @Post('releases/:id/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: PublishReleaseDto,
  ) {
    return this.admin.publishRelease(me.id, id, dto.notify ?? true);
  }

  @Post('releases/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.unpublishRelease(me.id, id);
  }

  @Delete('releases/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRelease(
    @CurrentUser() me: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.admin.deleteRelease(me.id, id);
  }

  // Registro
  @Get('actions')
  actions(@Query() q: PageDto) {
    return this.admin.actions(q.page);
  }
}
