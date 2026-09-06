import { Controller, Put, Get, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LocationsService } from './locations.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Locations')
@ApiBearerAuth('access-token')
@Controller({ path: 'locations', version: '1' })
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Put('me')
  @ApiOperation({ summary: 'Update current user location' })
  updateMyLocation(
    @CurrentUser('sub') userId: string,
    @Body() dto: { latitude: number; longitude: number; altitude?: number; accuracy?: number; city?: string; country?: string },
  ) {
    return this.locations.updateMyLocation(userId, dto);
  }

  @Get('users/nearby')
  @ApiOperation({ summary: 'Find nearby users (PostGIS ST_DWithin)' })
  @ApiQuery({ name: 'lat', type: Number })
  @ApiQuery({ name: 'lng', type: Number })
  @ApiQuery({ name: 'radius', type: Number, description: 'Radius in km', required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  findNearbyUsers(
    @CurrentUser('sub') userId: string,
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('radius') radius: number = 20,
    @Query('limit') limit: number = 20,
  ) {
    return this.locations.findNearbyUsers(userId, Number(lat), Number(lng), Number(radius), Number(limit));
  }
}
