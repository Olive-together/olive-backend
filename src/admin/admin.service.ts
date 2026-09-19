import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ActivityStatus,
  AuditAction,
  NotificationType,
  ReportStatus,
  UserStatus,
} from '@prisma/client';
import { NotFoundException, BadRequestException } from '../common/exceptions/app.exception';
import { Request } from 'express';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Dashboard Stats ──────────────────────────────────────────────────────

  async getDashboardStats() {
    const [
      totalUsers,
      activeUsers,
      suspendedUsers,
      bannedUsers,
      totalActivities,
      activeActivities,
      pendingReports,
      totalReports,
    ] = await Promise.all([
      this.prisma.user.count({ where: { deletedAt: null } }),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE, deletedAt: null } }),
      this.prisma.user.count({ where: { status: UserStatus.SUSPENDED, deletedAt: null } }),
      this.prisma.user.count({ where: { status: UserStatus.BANNED, deletedAt: null } }),
      this.prisma.activity.count({ where: { deletedAt: null } }),
      this.prisma.activity.count({ where: { status: ActivityStatus.ACTIVE, deletedAt: null } }),
      this.prisma.report.count({ where: { status: ReportStatus.PENDING } }),
      this.prisma.report.count(),
    ]);

    return {
      users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers, banned: bannedUsers },
      activities: { total: totalActivities, active: activeActivities },
      reports: { total: totalReports, pending: pendingReports },
    };
  }

  // ─── User Management ──────────────────────────────────────────────────────

  async listUsers(filters: {
    page?: number;
    limit?: number;
    search?: string;
    status?: UserStatus;
    role?: string;
  }) {
    const page = Number(filters.page ?? 1);
    const limit = Number(filters.limit ?? 20);
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (filters.search) {
      where.OR = [
        { email: { contains: filters.search, mode: 'insensitive' } },
        { username: { contains: filters.search, mode: 'insensitive' } },
        { profile: { displayName: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }
    if (filters.status) where.status = filters.status;
    if (filters.role) where.role = filters.role;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          status: true,
          createdAt: true,
          profile: {
            select: { displayName: true, avatarUrl: true, city: true, country: true },
          },
          reputationSummary: {
            select: { activitiesJoined: true, activitiesHosted: true },
          },
          _count: {
            select: { reportsTargeted: true },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        profile: true,
        reputationSummary: true,
        reportsTargeted: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            reporter: { select: { id: true, username: true } },
          },
        },
        _count: {
          select: {
            activitiesCreated: true,
            participations: true,
            connectionsFrom: true,
            connectionsTo: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User', userId);
    return user;
  }

  async suspendUser(
    adminId: string,
    userId: string,
    reason: string,
    req?: Request,
  ) {
    if (adminId === userId) throw new BadRequestException('Cannot suspend yourself');

    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User', userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.SUSPENDED },
    });

    await this.moderation.recordAuditLog({
      actorId: adminId,
      action: AuditAction.USER_SUSPEND,
      targetId: userId,
      targetType: 'USER',
      metadata: { reason, previousStatus: user.status },
      req,
    });

    // Notify the affected user
    await this.notifications.createNotification(
      userId,
      NotificationType.SYSTEM,
      'Account Suspended',
      `Your account has been suspended. Reason: ${reason}`,
      { referenceType: 'USER', referenceId: userId },
    );

    this.logger.log(`Admin ${adminId} suspended user ${userId}: ${reason}`);
    return updated;
  }

  async banUser(
    adminId: string,
    userId: string,
    reason: string,
    req?: Request,
  ) {
    if (adminId === userId) throw new BadRequestException('Cannot ban yourself');

    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User', userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.BANNED },
    });

    await this.moderation.recordAuditLog({
      actorId: adminId,
      action: AuditAction.USER_BAN,
      targetId: userId,
      targetType: 'USER',
      metadata: { reason, previousStatus: user.status },
      req,
    });

    await this.notifications.createNotification(
      userId,
      NotificationType.SYSTEM,
      'Account Banned',
      `Your account has been permanently banned. Reason: ${reason}`,
      { referenceType: 'USER', referenceId: userId },
    );

    this.logger.log(`Admin ${adminId} banned user ${userId}: ${reason}`);
    return updated;
  }

  async restoreUser(adminId: string, userId: string, req?: Request) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundException('User', userId);

    if (user.status === UserStatus.ACTIVE) {
      throw new BadRequestException('User is already active');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });

    await this.moderation.recordAuditLog({
      actorId: adminId,
      action: AuditAction.USER_RESTORE,
      targetId: userId,
      targetType: 'USER',
      metadata: { previousStatus: user.status },
      req,
    });

    await this.notifications.createNotification(
      userId,
      NotificationType.SYSTEM,
      'Account Restored',
      'Your account has been restored and is now active again.',
      { referenceType: 'USER', referenceId: userId },
    );

    this.logger.log(`Admin ${adminId} restored user ${userId}`);
    return updated;
  }

  // ─── Activity Management ──────────────────────────────────────────────────

  async listActivities(filters: {
    page?: number;
    limit?: number;
    search?: string;
    status?: ActivityStatus;
    category?: string;
    city?: string;
    creatorId?: string;
  }) {
    const page = Number(filters.page ?? 1);
    const limit = Number(filters.limit ?? 20);
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: null };

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.status) where.status = filters.status;
    if (filters.category) where.category = { equals: filters.category, mode: 'insensitive' };
    if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
    if (filters.creatorId) where.creatorId = filters.creatorId;

    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          creator: {
            select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } },
          },
          _count: { select: { participants: true } },
        },
      }),
      this.prisma.activity.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async removeActivity(
    adminId: string,
    activityId: string,
    reason: string,
    req?: Request,
  ) {
    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, deletedAt: null },
      select: { id: true, title: true, creatorId: true, status: true },
    });
    if (!activity) throw new NotFoundException('Activity', activityId);

    await this.prisma.activity.update({
      where: { id: activityId },
      data: {
        deletedAt: new Date(),
        status: ActivityStatus.CANCELLED,
      },
    });

    await this.moderation.recordAuditLog({
      actorId: adminId,
      action: AuditAction.ACTIVITY_REMOVE,
      targetId: activityId,
      targetType: 'ACTIVITY',
      metadata: { reason, activityTitle: activity.title, previousStatus: activity.status },
      req,
    });

    // Notify activity creator
    await this.notifications.createNotification(
      activity.creatorId,
      NotificationType.ACTIVITY_CANCELLED,
      'Activity Removed',
      `Your activity "${activity.title}" was removed by an administrator. Reason: ${reason}`,
      { referenceId: activityId, referenceType: 'ACTIVITY' },
    );

    this.logger.log(`Admin ${adminId} removed activity ${activityId}: ${reason}`);
    return { message: 'Activity removed', activityId };
  }

  async sendMessageToActivityCreator(
    adminId: string,
    activityId: string,
    message: string,
    req?: Request,
  ) {
    const trimmedMessage = message?.trim();
    if (!trimmedMessage) {
      throw new BadRequestException('Message is required');
    }

    const activity = await this.prisma.activity.findFirst({
      where: { id: activityId, deletedAt: null },
      select: {
        id: true,
        title: true,
        creatorId: true,
        creator: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true } },
          },
        },
      },
    });
    if (!activity) throw new NotFoundException('Activity', activityId);

    await this.notifications.createNotification(
      activity.creatorId,
      NotificationType.SYSTEM,
      'Message from Olive Admin',
      trimmedMessage,
      {
        actorId: adminId,
        actorName: 'Olive Admin',
        referenceId: activityId,
        referenceType: 'ACTIVITY',
        activityTitle: activity.title,
        adminMessage: true,
      },
    );

    await this.moderation.recordAuditLog({
      actorId: adminId,
      action: AuditAction.REPORT_RESOLVE,
      targetId: activityId,
      targetType: 'ACTIVITY',
      metadata: {
        actionType: 'ADMIN_MESSAGE_CREATOR',
        activityTitle: activity.title,
        recipientId: activity.creatorId,
        recipientUsername: activity.creator.username,
        message: trimmedMessage,
      },
      req,
    });

    this.logger.log(`Admin ${adminId} messaged creator ${activity.creatorId} for activity ${activityId}`);
    return { sent: true };
  }

  // ─── Reports Management ───────────────────────────────────────────────────

  async listReports(filters: {
    page?: number;
    limit?: number;
    status?: ReportStatus;
    type?: string;
  }) {
    const page = Number(filters.page ?? 1);
    const limit = Number(filters.limit ?? 20);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.type) where.reportType = filters.type;

    const [items, total] = await Promise.all([
      this.prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          reporter: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
          targetUser: { select: { id: true, username: true, profile: { select: { displayName: true } } } },
          targetActivity: { select: { id: true, title: true, status: true } },
        },
      }),
      this.prisma.report.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async reviewReport(
    adminId: string,
    reportId: string,
    dto: { status: ReportStatus; resolution?: string },
    req?: Request,
  ) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report', reportId);

    if (report.status !== ReportStatus.PENDING && report.status !== ReportStatus.UNDER_REVIEW) {
      throw new BadRequestException('Report has already been resolved or dismissed');
    }

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        resolution: dto.resolution,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    const auditAction =
      dto.status === ReportStatus.RESOLVED
        ? AuditAction.REPORT_RESOLVE
        : AuditAction.REPORT_DISMISS;

    await this.moderation.recordAuditLog({
      actorId: adminId,
      action: auditAction,
      targetId: reportId,
      targetType: 'REPORT',
      metadata: { newStatus: dto.status, resolution: dto.resolution },
      req,
    });

    return updated;
  }

  // ─── Audit Logs ───────────────────────────────────────────────────────────

  async getAuditLogs(filters: {
    page?: number;
    limit?: number;
    actorId?: string;
    action?: AuditAction;
    targetId?: string;
  }) {
    const page = Number(filters.page ?? 1);
    const limit = Number(filters.limit ?? 50);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.actorId) where.actorId = filters.actorId;
    if (filters.action) where.action = filters.action;
    if (filters.targetId) where.targetId = filters.targetId;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: { id: true, username: true, role: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
}
