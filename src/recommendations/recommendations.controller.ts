import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RecommendationsService } from './recommendations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Recommendations')
@ApiBearerAuth('access-token')
@Controller({ path: 'recommendations', version: '1' })
export class RecommendationsController {
  constructor(private readonly rec: RecommendationsService) {}

  @Get('people') @ApiOperation({ summary: 'Recommended people' })
  getPeople(@CurrentUser('sub') userId: string) { return this.rec.getPeople(userId); }

  @Get('activities') @ApiOperation({ summary: 'Recommended activities' })
  getActivities(@CurrentUser('sub') userId: string) { return this.rec.getActivities(userId); }

  @Get('interests') @ApiOperation({ summary: 'Suggested interests to add' })
  getInterests(@CurrentUser('sub') userId: string) { return this.rec.getInterests(userId); }
}
