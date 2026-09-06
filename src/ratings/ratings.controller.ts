import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RatingsService } from './ratings.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Ratings')
@ApiBearerAuth('access-token')
@Controller({ path: 'ratings', version: '1' })
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post()
  submitRating(
    @CurrentUser('sub') userId: string,
    @Body() dto: { targetId: string; activityId: string; score: number; review?: string }
  ) {
    return this.ratings.submitRating(userId, dto.targetId, dto.activityId, dto.score, dto.review);
  }
}
