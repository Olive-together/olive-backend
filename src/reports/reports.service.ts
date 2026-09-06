import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportType, ReportReason } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async submitReport(userId: string, dto: { type: ReportType; reason: ReportReason; description?: string; targetUserId?: string; targetActivityId?: string; targetMessageId?: string; targetMediaId?: string }) {
    return this.prisma.report.create({
      data: {
        reporterId: userId,
        reportType: dto.type,
        reason: dto.reason,
        description: dto.description,
        targetUserId: dto.targetUserId,
        targetActivityId: dto.targetActivityId,
        targetMessageId: dto.targetMessageId,
        targetMediaId: dto.targetMediaId,
      }
    });
  }
}
