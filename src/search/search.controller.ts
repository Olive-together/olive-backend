import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * SearchController — all user-search endpoints require authentication and
 * enforce the activity-based visibility rule via SearchService.
 */
@ApiTags('Search')
@ApiBearerAuth('access-token')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Unified search (user results restricted to shared-activity relationships)' })
  @ApiQuery({ name: 'q', description: 'Search query' })
  searchAll(
    @CurrentUser('sub') requesterId: string,
    @Query('q') q: string,
    @Query('limit') limit?: number,
  ) {
    return this.search.searchAll(q, requesterId, limit ? Number(limit) : 20);
  }

  /** User search — scoped to activity-visible users only */
  @Get('users')
  @ApiOperation({ summary: 'Search users (activity-relationship scoped)' })
  searchUsers(
    @CurrentUser('sub') requesterId: string,
    @Query('q') q: string,
  ) {
    return this.search.searchUsers(q, requesterId);
  }

  @Get('activities')
  @ApiOperation({ summary: 'Search activities' })
  searchActivities(@Query('q') q: string) {
    return this.search.searchActivities(q);
  }

  @Get('skills')
  @ApiOperation({ summary: 'Search skills' })
  searchSkills(@Query('q') q: string) {
    return this.search.searchSkills(q);
  }

  @Get('interests')
  @ApiOperation({ summary: 'Search interests' })
  searchInterests(@Query('q') q: string) {
    return this.search.searchInterests(q);
  }
}
