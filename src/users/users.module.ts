import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PeopleVisibilityService } from '../people/people-visibility.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PeopleVisibilityService],
  exports: [UsersService],
})
export class UsersModule {}

