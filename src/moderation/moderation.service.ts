import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, Prisma } from '@prisma/client';
import { Request } from 'express';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Audit Logging ────────────────────────────────────────────────────────

  /**
   * Records an admin/moderation action in the audit log.
   * Non-fatal — errors are logged but not re-thrown so the primary action succeeds.
   */
  async recordAuditLog(opts: {
    actorId: string;
    action: AuditAction;
    targetId?: string;
    targetType?: string;
    metadata?: Record<string, unknown>;
    req?: Request;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: opts.actorId,
          action: opts.action,
          targetId: opts.targetId,
          targetType: opts.targetType,
          metadata: (opts.metadata ?? {}) as Prisma.InputJsonValue,
          ipAddress: opts.req?.ip ?? opts.req?.socket?.remoteAddress,
          userAgent: opts.req?.headers?.['user-agent'],
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log [${opts.action}]: ${(err as Error).message}`);
    }
  }
}
