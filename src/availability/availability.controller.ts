import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AvailabilityService, UpsertAvailabilityDto } from './availability.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Availability')
@ApiBearerAuth('access-token')
@Controller({ path: 'availability', version: '1' })
export class AvailabilityController {
  constructor(private readonly availability: AvailabilityService) {}

  @Get() findAll(@CurrentUser('sub') userId: string) { return this.availability.findAll(userId); }
  @Post() create(@CurrentUser('sub') userId: string, @Body() dto: UpsertAvailabilityDto) { return this.availability.create(userId, dto); }
  @Patch(':id') update(@CurrentUser('sub') userId: string, @Param('id') id: string, @Body() dto: Partial<UpsertAvailabilityDto>) { return this.availability.update(userId, id, dto); }
  @Delete(':id') remove(@CurrentUser('sub') userId: string, @Param('id') id: string) { return this.availability.remove(userId, id); }
}
