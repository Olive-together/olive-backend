import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * BullMQ queue names for reference.
 * Workers are wired into each queue when BullMQ is fully configured.
 */
export const QUEUE_NAMES = {
  NOTIFICATION: 'notification',
  EMAIL: 'email',
  ACTIVITY_EXPIRY: 'activity-expiry',
  ACTIVITY_REMINDER: 'activity-reminder',
  RECOMMENDATION_REFRESH: 'recommendation-refresh',
  MEDIA_PROCESSING: 'media-processing',
  ACCOUNT_DELETION: 'account-deletion',
  MODERATION: 'moderation',
} as const;

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs every 5 minutes to:
   * 1. Mark EXPIRED: activities past their explicit expiresAt date.
   * 2. Mark COMPLETED: activities whose scheduledAt has passed (event is over).
   * 3. Soft-delete: activities that have been COMPLETED/EXPIRED for 2+ days.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireActivities(): Promise<void> {
    const now = new Date();

    // 1. Mark EXPIRED: activities with an explicit expiresAt in the past
    const expired = await this.prisma.activity.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
        deletedAt: null,
      },
      data: { status: 'EXPIRED' },
    });

    // 2. Mark COMPLETED: activities whose scheduledAt has passed
    //    Use endsAt if available, otherwise fall back to scheduledAt.
    //    No grace period — the event time IS the cutoff.
    const completed = await this.prisma.activity.updateMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        OR: [
          // Has an end time — use that as the cutoff
          { endsAt: { lt: now } },
          // No end time — use scheduled time (and no explicit expiresAt handled above)
          { endsAt: null, scheduledAt: { lt: now }, expiresAt: null },
        ],
      },
      data: { status: 'COMPLETED' },
    });

    // 3. Soft-delete activities that have been COMPLETED or EXPIRED for 2+ days
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const deleted = await this.prisma.activity.updateMany({
      where: {
        status: { in: ['COMPLETED', 'EXPIRED'] },
        deletedAt: null,
        // updatedAt is bumped when status changes, so this approximates "2 days since completion"
        updatedAt: { lt: twoDaysAgo },
      },
      data: { deletedAt: now },
    });

    if (expired.count > 0)   this.logger.log(`Expired ${expired.count} activities`);
    if (completed.count > 0) this.logger.log(`Marked ${completed.count} activities as COMPLETED (past scheduled time)`);
    if (deleted.count > 0)   this.logger.log(`Soft-deleted ${deleted.count} activities (2+ days after completion)`);
  }


  /**
   * Runs hourly to clean up revoked/expired sessions.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupSessions(): Promise<void> {
    const result = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        ],
      },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired sessions`);
    }
  }
}
