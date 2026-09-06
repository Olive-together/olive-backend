import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { MatchingService } from './matching.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Matching')
@ApiBearerAuth('access-token')
@Controller({ path: 'matching', version: '1' })
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Get('candidates')
  @ApiOperation({ summary: 'Get ranked match candidates for the current user' })
  getCandidates(
    @CurrentUser('sub') userId: string,
    @Query('lat') lat?: number,
    @Query('lng') lng?: number,
    @Query('radius') radius?: number,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.matching.getCandidates(userId, {
      latitude: lat ? Number(lat) : undefined,
      longitude: lng ? Number(lng) : undefined,
      radiusKm: radius ? Number(radius) : undefined,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
