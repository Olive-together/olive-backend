import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ActivitiesService, CreateActivityDto } from './activities.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Activities')
@Controller({ path: 'activities', version: '1' })
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new activity' })
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateActivityDto) {
    return this.activities.create(userId, dto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'List activities (cursor paginated)' })
  findAll(@Query() query: { status?: string; timeline?: 'upcoming' | 'past'; city?: string; state?: string; lat?: string; lng?: string; radiusKm?: string; cursor?: string; limit?: number }) {
    return this.activities.findAll(query as never);
  }

  @Get('nearby')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Find activities near coordinates' })
  @ApiQuery({ name: 'lat', type: Number })
  @ApiQuery({ name: 'lng', type: Number })
  @ApiQuery({ name: 'radius', type: Number, description: 'Radius in km (default 20)' })
  findNearby(
    @CurrentUser('sub') userId: string,
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('radius') radius: number = 20,
  ) {
    return this.activities.findNearby(Number(lat), Number(lng), Number(radius), userId);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get activity by ID' })
  findOne(@Param('id') id: string) { return this.activities.findOne(id); }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update activity (creator only)' })
  update(@CurrentUser('sub') userId: string, @Param('id') id: string, @Body() dto: Partial<CreateActivityDto>) {
    return this.activities.update(userId, id, dto);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel/delete activity (creator only)' })
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.activities.remove(userId, id);
  }

  @Post(':id/join')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join an activity' })
  join(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.activities.join(userId, id);
  }

  @Post(':id/leave')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave an activity' })
  leave(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.activities.leave(userId, id);
  }

  @Post(':id/requests/:requestUserId/accept')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a join request (creator only)' })
  acceptRequest(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Param('requestUserId') requestUserId: string,
  ) {
    return this.activities.acceptRequest(userId, id, requestUserId);
  }

  @Post(':id/requests/:requestUserId/reject')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a join request (creator only)' })
  rejectRequest(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Param('requestUserId') requestUserId: string,
  ) {
    return this.activities.rejectRequest(userId, id, requestUserId);
  }

  @Post(':id/invite')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invite a user to an activity (creator only)' })
  invite(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body('userId') invitedUserId: string,
  ) {
    return this.activities.invite(userId, id, invitedUserId);
  }

  @Get(':id/participants')
  @Public()
  @ApiOperation({ summary: 'Get activity participants' })
  getParticipants(@Param('id') id: string) {
    return this.activities.getParticipants(id);
  }

  // ─── Group Chat ──────────────────────────────────────────────────────────

  @Get(':id/chat')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get the group conversation for an activity',
    description:
      'Returns the group conversation with members and last message. ' +
      'Use GET /chat/conversations/:conversationId/messages for paginated messages. ' +
      'To DM a specific member, use POST /chat/conversations with their userId.',
  })
  getActivityChat(
    @CurrentUser('sub') userId: string,
    @Param('id') activityId: string,
  ) {
    return this.activities.getActivityChat(userId, activityId);
  }
}
