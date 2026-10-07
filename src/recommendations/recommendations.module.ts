import { Module } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { PeopleVisibilityService } from '../people/people-visibility.service';

@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationsService, PeopleVisibilityService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}

