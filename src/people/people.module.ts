import { Module } from '@nestjs/common';
import { PeopleVisibilityService } from './people-visibility.service';
import { PeopleController } from './people.controller';

@Module({
  controllers: [PeopleController],
  providers: [PeopleVisibilityService],
  exports: [PeopleVisibilityService],
})
export class PeopleModule {}
