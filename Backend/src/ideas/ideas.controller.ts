import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateIdeaDto, ListIdeasDto } from './ideas.dto';
import { IdeasService } from './ideas.service';

const uuid = new ParseUUIDPipe();

@ApiTags('ideas')
@ApiBearerAuth()
@Controller('ideas')
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() q: ListIdeasDto) {
    return this.ideas.list(user.id, q, user.role === 'ADMIN');
  }

  @Post()
  @UseGuards(ThrottlerGuard)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateIdeaDto) {
    return this.ideas.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', uuid) id: string) {
    return this.ideas.get(user.id, id, user.role === 'ADMIN');
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.ideas.remove(user.id, id);
  }

  @Post(':id/vote')
  @HttpCode(HttpStatus.OK)
  vote(@CurrentUser() user: AuthenticatedUser, @Param('id', uuid) id: string) {
    return this.ideas.vote(user.id, id, true);
  }

  @Delete(':id/vote')
  unvote(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
  ) {
    return this.ideas.vote(user.id, id, false);
  }
}
