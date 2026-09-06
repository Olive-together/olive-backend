import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InterestsService } from './interests.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Interests')
@Controller({ path: 'interests', version: '1' })
export class InterestsController {
  constructor(private readonly interests: InterestsService) {}

  @Get() @Public() findAll(@Query('search') search?: string) { return this.interests.findAll(search); }
  @Get('categories') @Public() findCategories() { return this.interests.findCategories(); }
  @Get(':id') @Public() findOne(@Param('id') id: string) { return this.interests.findOne(id); }

  @Post() @ApiBearerAuth('access-token') @Roles(UserRole.ADMIN)
  create(@Body() dto: { name: string; slug: string; categoryId: string; description?: string }) { return this.interests.create(dto); }

  @Patch(':id') @ApiBearerAuth('access-token') @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: { name?: string; description?: string; isActive?: boolean }) { return this.interests.update(id, dto); }

  @Delete(':id') @ApiBearerAuth('access-token') @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) { return this.interests.remove(id); }

  @Post('categories') @ApiBearerAuth('access-token') @Roles(UserRole.ADMIN)
  createCategory(@Body() dto: { name: string; description?: string; iconUrl?: string }) { return this.interests.createCategory(dto); }
}
