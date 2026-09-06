import { Controller, Get, Patch, Post, Delete, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ProfilesService } from './profiles.service';
import { AddSkillDto, UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Profiles')
@ApiBearerAuth('access-token')
@Controller({ path: 'profiles', version: '1' })
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('me') @ApiOperation({ summary: 'Get my profile' })
  getMyProfile(@CurrentUser('sub') userId: string) { return this.profiles.getMyProfile(userId); }

  @Patch('me') @ApiOperation({ summary: 'Update my profile' })
  updateMyProfile(@CurrentUser('sub') userId: string, @Body() dto: UpdateProfileDto) { return this.profiles.updateMyProfile(userId, dto); }

  @Get('me/skills') @ApiOperation({ summary: 'Get my skills' })
  getMySkills(@CurrentUser('sub') userId: string) { return this.profiles.getMySkills(userId); }

  @Post('me/skills') @ApiOperation({ summary: 'Add a skill' })
  addSkill(@CurrentUser('sub') userId: string, @Body() dto: AddSkillDto) { return this.profiles.addSkill(userId, dto); }

  @Delete('me/skills/:skillId') @ApiOperation({ summary: 'Remove a skill' })
  removeSkill(@CurrentUser('sub') userId: string, @Param('skillId') skillId: string) { return this.profiles.removeSkill(userId, skillId); }

  @Get('me/interests') @ApiOperation({ summary: 'Get my interests' })
  getMyInterests(@CurrentUser('sub') userId: string) { return this.profiles.getMyInterests(userId); }

  @Post('me/interests') @ApiOperation({ summary: 'Add an interest' })
  addInterest(@CurrentUser('sub') userId: string, @Body('interestId') interestId: string) { return this.profiles.addInterest(userId, interestId); }

  @Delete('me/interests/:interestId') @ApiOperation({ summary: 'Remove an interest' })
  removeInterest(@CurrentUser('sub') userId: string, @Param('interestId') interestId: string) { return this.profiles.removeInterest(userId, interestId); }
}
