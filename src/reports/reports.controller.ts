import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportType } from '@prisma/client';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /**
   * POST /api/v1/reports
   * Submit a report. The reason is a free-text string provided by the user.
   */
  @Post()
  @ApiOperation({ summary: 'Submit a user/content report' })
  submitReport(
    @CurrentUser('sub') userId: string,
    @Body()
    dto: {
      type: ReportType;
      description: string;
      targetUserId?: string;
      targetActivityId?: string;
      targetMessageId?: string;
      targetMediaId?: string;
    },
  ) {
    return this.reports.submitReport(userId, dto);
  }
}
