import { Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get() @ApiOperation({ summary: 'List notifications (paginated)' })
  findAll(@CurrentUser('sub') userId: string, @Query('page') page?: number, @Query('limit') limit?: number) {
    return this.notifications.findAll(userId, page, limit);
  }

  @Get('unread-count') @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@CurrentUser('sub') userId: string) { return this.notifications.getUnreadCount(userId); }

  @Patch(':id/read') @ApiOperation({ summary: 'Mark notification as read' })
  markRead(@CurrentUser('sub') userId: string, @Param('id') id: string) { return this.notifications.markRead(userId, id); }

  @Patch('read-all') @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllRead(@CurrentUser('sub') userId: string) { return this.notifications.markAllRead(userId); }
}
