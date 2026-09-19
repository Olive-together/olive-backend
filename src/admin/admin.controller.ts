import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ActivityStatus, AuditAction, ReportStatus, UserRole, UserStatus } from '@prisma/client';
import { Request } from 'express';

/**
 * All routes in this controller require ADMIN role.
 * The JwtAuthGuard is applied globally (via APP_GUARD in AuthModule) so every
 * request must also carry a valid JWT — the RolesGuard then checks the role claim.
 */
@ApiTags('Admin')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  // ─── Dashboard ────────────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Platform dashboard stats (admin only)' })
  getDashboardStats() {
    return this.admin.getDashboardStats();
  }

  // ─── User Management ──────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List all users with filters (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: UserStatus })
  @ApiQuery({ name: 'role', required: false, enum: UserRole })
  listUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: UserStatus,
    @Query('role') role?: string,
  ) {
    return this.admin.listUsers({ page, limit, search, status, role });
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get user detail with report history (admin only)' })
  getUserDetail(@Param('id') id: string) {
    return this.admin.getUserDetail(id);
  }

  @Patch('users/:id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspend a user account (admin only)' })
  suspendUser(
    @CurrentUser('sub') adminId: string,
    @Param('id') userId: string,
    @Body('reason') reason: string,
    @Req() req: Request,
  ) {
    return this.admin.suspendUser(adminId, userId, reason ?? 'No reason provided', req);
  }

  @Patch('users/:id/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Permanently ban a user (admin only)' })
  banUser(
    @CurrentUser('sub') adminId: string,
    @Param('id') userId: string,
    @Body('reason') reason: string,
    @Req() req: Request,
  ) {
    return this.admin.banUser(adminId, userId, reason ?? 'No reason provided', req);
  }

  @Patch('users/:id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a suspended/banned user (admin only)' })
  restoreUser(
    @CurrentUser('sub') adminId: string,
    @Param('id') userId: string,
    @Req() req: Request,
  ) {
    return this.admin.restoreUser(adminId, userId, req);
  }

  // ─── Activity Management ──────────────────────────────────────────────────

  @Get('activities')
  @ApiOperation({ summary: 'List all activities with filters (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ActivityStatus })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'creatorId', required: false })
  listActivities(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: ActivityStatus,
    @Query('category') category?: string,
    @Query('city') city?: string,
    @Query('creatorId') creatorId?: string,
  ) {
    return this.admin.listActivities({ page, limit, search, status, category, city, creatorId });
  }

  @Post('activities/:id/message-creator')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a system notification to an activity creator (admin only)' })
  messageActivityCreator(
    @CurrentUser('sub') adminId: string,
    @Param('id') activityId: string,
    @Body('message') message: string,
    @Req() req: Request,
  ) {
    return this.admin.sendMessageToActivityCreator(adminId, activityId, message, req);
  }

  @Delete('activities/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove/cancel an activity (admin only)' })
  removeActivity(
    @CurrentUser('sub') adminId: string,
    @Param('id') activityId: string,
    @Body('reason') reason: string,
    @Req() req: Request,
  ) {
    return this.admin.removeActivity(adminId, activityId, reason ?? 'No reason provided', req);
  }

  // ─── Reports Management ───────────────────────────────────────────────────

  @Get('reports')
  @ApiOperation({ summary: 'List submitted reports with filters (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ReportStatus })
  @ApiQuery({ name: 'type', required: false })
  listReports(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: ReportStatus,
    @Query('type') type?: string,
  ) {
    return this.admin.listReports({ page, limit, status, type });
  }

  @Patch('reports/:id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update a report status and resolution (admin only)' })
  reviewReport(
    @CurrentUser('sub') adminId: string,
    @Param('id') reportId: string,
    @Body() dto: { status: ReportStatus; resolution?: string },
    @Req() req: Request,
  ) {
    return this.admin.reviewReport(adminId, reportId, dto, req);
  }

  // ─── Audit Logs ───────────────────────────────────────────────────────────

  @Get('audit-logs')
  @ApiOperation({ summary: 'View admin audit trail (admin only)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'actorId', required: false })
  @ApiQuery({ name: 'action', required: false, enum: AuditAction })
  @ApiQuery({ name: 'targetId', required: false })
  getAuditLogs(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('actorId') actorId?: string,
    @Query('action') action?: AuditAction,
    @Query('targetId') targetId?: string,
  ) {
    return this.admin.getAuditLogs({ page, limit, actorId, action, targetId });
  }
}
