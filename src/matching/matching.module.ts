import { Module } from '@nestjs/common';
import { MatchingService, DefaultRankingStrategy } from './matching.service';
import { MatchingController } from './matching.controller';
import { PeopleVisibilityService } from '../people/people-visibility.service';

@Module({
  controllers: [MatchingController],
  providers: [MatchingService, PeopleVisibilityService],
  exports: [MatchingService],
})
export class MatchingModule {}

