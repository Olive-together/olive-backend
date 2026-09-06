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
   * Runs every 5 minutes to expire activities past their expiresAt.
   * In production, replace with a BullMQ repeatable job.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireActivities(): Promise<void> {
    const result = await this.prisma.activity.updateMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: new Date() },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      this.logger.log(`Expired ${result.count} activities`);
    }
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
