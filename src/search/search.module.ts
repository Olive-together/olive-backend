import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PeopleVisibilityService } from '../people/people-visibility.service';

@Module({
  controllers: [SearchController],
  providers: [SearchService, PeopleVisibilityService],
})
export class SearchModule {}
