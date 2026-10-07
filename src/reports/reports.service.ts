import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ReportType, ReportReason } from '@prisma/client';

export interface SubmitReportDto {
  type: ReportType;
  /** Free-text reason provided by the user (stored as description). */
  description: string;
  targetUserId?: string;
  targetActivityId?: string;
  targetMessageId?: string;
  targetMediaId?: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async submitReport(reporterId: string, dto: SubmitReportDto) {
    // Persist the report
    const report = await this.prisma.report.create({
      data: {
        reporterId,
        reportType: dto.type,
        // Use OTHER as the canonical reason enum — the real detail is in description
        reason: ReportReason.OTHER,
        description: dto.description,
        targetUserId: dto.targetUserId,
        targetActivityId: dto.targetActivityId,
        targetMessageId: dto.targetMessageId,
        targetMediaId: dto.targetMediaId,
      },
    });

    // Send admin notification email (fire-and-forget — don't block the response)
    if (dto.type === ReportType.USER && dto.targetUserId) {
      this.sendAdminNotification(reporterId, dto.targetUserId, dto.description, report.createdAt).catch(
        (err) => this.logger.error('Failed to send admin report email', err),
      );
    }

    return {
      id: report.id,
      message: 'Report submitted. Thanks for helping keep LetsDoTogether safe.',
    };
  }

  private async sendAdminNotification(
    reporterId: string,
    targetUserId: string,
    reason: string,
    timestamp: Date,
  ): Promise<void> {
    // Fetch both users in parallel
    const [reporter, target] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: reporterId },
        select: {
          email: true,
          username: true,
          profile: { select: { displayName: true } },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          email: true,
          username: true,
          profile: { select: { displayName: true } },
        },
      }),
    ]);

    if (!reporter || !target) return;

    await this.email.sendReportNotification({
      reportedUserName: target.profile?.displayName ?? target.username,
      reportedUserEmail: target.email,
      reportedUserId: target.id,
      reporterName: reporter.profile?.displayName ?? reporter.username,
      reporterEmail: reporter.email,
      reason,
      timestamp,
    });
  }
}
