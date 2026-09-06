import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportType, ReportReason } from '@prisma/client';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  submitReport(
    @CurrentUser('sub') userId: string,
    @Body() dto: { type: ReportType; reason: ReportReason; description?: string; targetUserId?: string; targetActivityId?: string; targetMessageId?: string; targetMediaId?: string }
  ) {
    return this.reports.submitReport(userId, dto);
  }
}
