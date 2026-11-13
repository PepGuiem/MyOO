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
import { CalendarService } from './calendar.service';
import {
  CalendarDayQueryDto,
  CalendarRangeQueryDto,
  CalendarTodayQueryDto,
  CreateCalendarEntryDto,
  UpdateCalendarEntryDto,
} from './dto/calendar.dto';

/** OUTFIT CALENDAR: qué outfit te pones cada día. */
@ApiTags('calendar')
@ApiBearerAuth()
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  /** Días entre `from` y `to` (máx. 62), con el outfit y los avisos de repetición. */
  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: CalendarRangeQueryDto,
  ) {
    return this.calendar.list(user.id, q.from, q.to);
  }

  /** Estadísticas, repeticiones, próximos días y eventos. */
  @Get('insights')
  insights(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: CalendarTodayQueryDto,
  ) {
    return this.calendar.insights(user.id, q.today);
  }

  /** Outfits recomendados para un día. */
  @Get('suggestions')
  suggestions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() q: CalendarDayQueryDto,
  ) {
    return this.calendar.suggestions(user.id, q.date, q.limit);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCalendarEntryDto,
  ) {
    return this.calendar.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCalendarEntryDto,
  ) {
    return this.calendar.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.calendar.remove(user.id, id);
  }
}
