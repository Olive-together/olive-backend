import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { PeopleVisibilityService } from './people-visibility.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ForbiddenException } from '../common/exceptions/app.exception';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PeopleController — exposes the activity-based people discovery endpoints.
 *
 * All endpoints require authentication (JWT guard applied globally).
 * Visibility is enforced server-side in PeopleVisibilityService.
 */
@ApiTags('People')
@ApiBearerAuth('access-token')
@Controller({ path: 'people', version: '1' })
export class PeopleController {
  constructor(
    private readonly visibility: PeopleVisibilityService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /api/v1/people
   * Returns the paginated list of people the current user has met through activities.
   */
  @Get()
  @ApiOperation({
    summary: 'People you\'ve met through activities (activity-relationship only)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  getPeople(
    @CurrentUser('sub') viewerId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.visibility.getPeopleWithContext(viewerId, {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
      search: search?.trim() || undefined,
    });
  }

  /**
   * GET /api/v1/people/:username/can-view
   * Returns whether the current user can view the given username's profile.
   * Used by the frontend to guard profile navigation.
   */
  @Get(':username/can-view')
  @ApiOperation({ summary: 'Check if current user can view a specific user profile' })
  async canViewProfile(
    @CurrentUser('sub') viewerId: string,
    @Param('username') username: string,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!target) return { canView: false };
    const canView = await this.visibility.canViewUser(viewerId, target.id);
    return { canView };
  }

  /**
   * GET /api/v1/people/:username/shared-activities
   * Returns shared activity context between current user and the target.
   */
  @Get(':username/shared-activities')
  @ApiOperation({ summary: 'Get shared activities between current user and target' })
  async getSharedActivities(
    @CurrentUser('sub') viewerId: string,
    @Param('username') username: string,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!target) return { sharedCount: 0, sharedActivities: [] };

    const canView = await this.visibility.canViewUser(viewerId, target.id);
    if (!canView) throw new ForbiddenException('Profile not accessible');

    return this.visibility.getSharedActivityContext(viewerId, target.id);
  }
}
