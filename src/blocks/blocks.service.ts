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
    await this.prisma.block.deleteMany({
      where: { blockerId, blockedUserId },
    });
  }

  /**
   * Returns true if `blockerId` has blocked `blockedUserId`,
   * OR if the reverse block exists (bidirectional check).
   */
  async isBlocked(userA: string, userB: string): Promise<boolean> {
    const count = await this.prisma.block.count({
      where: {
        OR: [
          { blockerId: userA, blockedUserId: userB },
          { blockerId: userB, blockedUserId: userA },
        ],
      },
    });
    return count > 0;
  }

  /**
   * Returns all user IDs that `userId` has blocked.
   */
  async getBlockedUserIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: userId },
      select: { blockedUserId: true },
    });
    return rows.map((r) => r.blockedUserId);
  }

  /**
   * Returns all Block records where `userId` is the blocker,
   * enriched with the blocked user's profile info.
   */
  async getBlockList(userId: string) {
    return this.prisma.block.findMany({
      where: { blockerId: userId },
      select: {
        id: true,
        blockedUserId: true,
        reason: true,
        createdAt: true,
        blockedUser: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarUrl: true, city: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns the single block record if blockerId has blocked blockedUserId, else null.
   */
  async getBlock(blockerId: string, blockedUserId: string) {
    return this.prisma.block.findUnique({
      where: { blockerId_blockedUserId: { blockerId, blockedUserId } },
    });
  }
}
