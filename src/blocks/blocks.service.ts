import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async blockUser(blockerId: string, blockedUserId: string, reason?: string) {
    return this.prisma.block.upsert({
      where: { blockerId_blockedUserId: { blockerId, blockedUserId } },
      create: { blockerId, blockedUserId, reason },
      update: { reason },
    });
  }

  async unblockUser(blockerId: string, blockedUserId: string) {
    await this.prisma.block.delete({
      where: { blockerId_blockedUserId: { blockerId, blockedUserId } },
    });
  }
}
