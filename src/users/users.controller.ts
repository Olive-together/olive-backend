import {
  Controller,
  Get,
  Patch,
  Delete,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateDiscoveryDto, UpdatePrivacyDto, UpdateUserDto } from './dto/update-user.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser('sub') userId: string) {
    return this.users.getMe(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user' })
  updateMe(@CurrentUser('sub') userId: string, @Body() dto: UpdateUserDto) {
    return this.users.updateMe(userId, dto);
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete current user account' })
  deleteMe(@CurrentUser('sub') userId: string) {
    return this.users.softDelete(userId);
  }

  @Post('me/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate account (hidden from discovery)' })
  deactivate(@CurrentUser('sub') userId: string) {
    return this.users.deactivate(userId);
  }

  @Post('me/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a deactivated account' })
  reactivate(@CurrentUser('sub') userId: string) {
    return this.users.reactivate(userId);
  }

  @Patch('me/privacy')
  @ApiOperation({ summary: 'Update privacy settings' })
  updatePrivacy(@CurrentUser('sub') userId: string, @Body() dto: UpdatePrivacyDto) {
    return this.users.updatePrivacy(userId, dto);
  }

  @Patch('me/discovery')
  @ApiOperation({ summary: 'Update discovery settings' })
  updateDiscovery(@CurrentUser('sub') userId: string, @Body() dto: UpdateDiscoveryDto) {
    return this.users.updateDiscovery(userId, dto);
  }

  @Get(':username')
  @Public()
  @ApiOperation({ summary: 'Get public profile by username' })
  getPublicProfile(
    @Param('username') username: string,
    @CurrentUser('sub') requesterId: string,
  ) {
    return this.users.getPublicProfile(username, requesterId);
  }
}
