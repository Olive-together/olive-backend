import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';

@ApiTags('Search')
@ApiBearerAuth('access-token')
@Controller({ path: 'search', version: '1' })
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get() @ApiOperation({ summary: 'Unified search across all resources' }) @ApiQuery({ name: 'q', description: 'Search query' })
  searchAll(@Query('q') q: string, @Query('limit') limit?: number) { return this.search.searchAll(q, limit ? Number(limit) : 20); }

  @Get('users') searchUsers(@Query('q') q: string) { return this.search.searchUsers(q); }
  @Get('activities') searchActivities(@Query('q') q: string) { return this.search.searchActivities(q); }
  @Get('skills') searchSkills(@Query('q') q: string) { return this.search.searchSkills(q); }
  @Get('interests') searchInterests(@Query('q') q: string) { return this.search.searchInterests(q); }
}
