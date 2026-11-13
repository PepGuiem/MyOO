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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ChatService } from './chat.service';
import {
  AddMembersDto,
  CreateGroupDto,
  DirectChatDto,
  MessagesQueryDto,
  SendMessageDto,
  SetRoleDto,
  UpdateGroupDto,
} from './dto/chat.dto';

const uuid = new ParseUUIDPipe();

@ApiTags('chat')
@ApiBearerAuth()
@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Tus conversaciones, la más reciente primero, con los no leídos. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.list(user.id);
  }

  @Get('unread')
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.chat.unreadTotal(user.id);
  }

  /** Abre (o recupera) el chat 1 a 1 con alguien. */
  @Post('direct')
  @HttpCode(HttpStatus.OK)
  direct(@CurrentUser() user: AuthenticatedUser, @Body() dto: DirectChatDto) {
    return this.chat.openDirect(user.id, dto.userId);
  }

  @Post('groups')
  createGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateGroupDto,
  ) {
    return this.chat.createGroup(user.id, dto);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.chat.detail(user.id, id);
  }

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.chat.rename(user.id, id, dto.title);
  }

  @Get(':id/messages')
  messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Query() q: MessagesQueryDto,
  ) {
    return this.chat.messages(user.id, id, q);
  }

  @Post(':id/messages')
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.send(user.id, id, dto);
  }

  @Delete(':id/messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Param('messageId', uuid) messageId: string,
  ) {
    return this.chat.deleteMessage(user.id, id, messageId);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  read(@CurrentUser() user: AuthenticatedUser, @Param('id', uuid) id: string) {
    return this.chat.markRead(user.id, id);
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.OK)
  addMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.chat.addMembers(user.id, id, dto.userIds);
  }

  /** Quitar a alguien o, con tu propio id, salir del grupo. */
  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Param('userId', uuid) userId: string,
  ) {
    return this.chat.removeMember(user.id, id, userId);
  }

  @Patch(':id/members/:userId')
  setRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Param('userId', uuid) userId: string,
    @Body() dto: SetRoleDto,
  ) {
    return this.chat.setRole(user.id, id, userId, dto.role);
  }
}
