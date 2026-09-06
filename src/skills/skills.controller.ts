import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SkillsService } from './skills.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Skills')
@Controller({ path: 'skills', version: '1' })
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  @Get() @Public() @ApiOperation({ summary: 'List all skills (searchable)' })
  findAll(@Query('search') search?: string) { return this.skills.findAll(search); }

  @Get('categories') @Public() @ApiOperation({ summary: 'List skill categories' })
  findCategories() { return this.skills.findCategories(); }

  @Get(':id') @Public() @ApiOperation({ summary: 'Get skill by ID' })
  findOne(@Param('id') id: string) { return this.skills.findOne(id); }

  @Post() @ApiBearerAuth('access-token') @Roles(UserRole.ADMIN) @ApiOperation({ summary: '[Admin] Create skill' })
  create(@Body() dto: { name: string; slug: string; categoryId: string; description?: string }) { return this.skills.create(dto); }

  @Patch(':id') @ApiBearerAuth('access-token') @Roles(UserRole.ADMIN) @ApiOperation({ summary: '[Admin] Update skill' })
  update(@Param('id') id: string, @Body() dto: { name?: string; description?: string; isActive?: boolean }) { return this.skills.update(id, dto); }

  @Delete(':id') @ApiBearerAuth('access-token') @Roles(UserRole.ADMIN) @ApiOperation({ summary: '[Admin] Deactivate skill' })
  remove(@Param('id') id: string) { return this.skills.remove(id); }

  @Post('categories') @ApiBearerAuth('access-token') @Roles(UserRole.ADMIN) @ApiOperation({ summary: '[Admin] Create skill category' })
  createCategory(@Body() dto: { name: string; description?: string; iconUrl?: string }) { return this.skills.createCategory(dto); }
}
