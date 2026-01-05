import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LogsService } from './logs.service';
import { QueryLogsDto } from './dto/query-logs.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserData } from '../auth/decorators/current-user.decorator';

@ApiTags('日志')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  @ApiOperation({ summary: '获取操作日志' })
  findAll(@Query() query: QueryLogsDto, @CurrentUser() user: CurrentUserData) {
    return this.logsService.findAll(query, user);
  }

  @Get('stats')
  @ApiOperation({ summary: '获取日志统计' })
  getStats(@CurrentUser() user: CurrentUserData) {
    return this.logsService.getStats(user);
  }
}

