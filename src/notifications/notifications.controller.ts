import {
  Controller, Get, Patch, Param, Query, Body,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiBody,
} from '@nestjs/swagger';
import { NotificationsService, UpdateNotifPrefsDto } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications (paginated)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @CurrentUser('sub') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.notifications.findAll(userId, page, limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@CurrentUser('sub') userId: string) {
    return this.notifications.getUnreadCount(userId);
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences for current user' })
  getPrefs(@CurrentUser('sub') userId: string) {
    return this.notifications.getPrefs(userId);
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update notification preferences' })
  @ApiBody({ schema: {
    type: 'object',
    properties: {
      activityJoins:      { type: 'boolean' },
      connectionRequests: { type: 'boolean' },
      messages:           { type: 'boolean' },
      activityReminders:  { type: 'boolean' },
      recommendations:    { type: 'boolean' },
      ratings:            { type: 'boolean' },
    },
  }})
  updatePrefs(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateNotifPrefsDto,
  ) {
    return this.notifications.updatePrefs(userId, dto);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser('sub') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markRead(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id);
  }
}
