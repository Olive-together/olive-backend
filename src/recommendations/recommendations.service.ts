import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL = 3600; // 1 hour

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getPeople(userId: string) {
    const cacheKey = `recs:people:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as unknown[];

    // People with most shared interests, not already connected, not blocked
    const userInterests = await this.prisma.userInterest.findMany({
      where: { userId }, select: { interestId: true },
    });
    const interestIds = userInterests.map((i) => i.interestId);

    const blockedIds = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedUserId: userId }] },
      select: { blockerId: true, blockedUserId: true },
    });
    const excludeIds = [
      userId,
      ...new Set(blockedIds.flatMap((b) => [b.blockerId, b.blockedUserId])),
    ];

    const people = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludeIds },
        status: 'ACTIVE',
        deletedAt: null,
        profile: { discoveryEnabled: true },
        userInterests: interestIds.length ? { some: { interestId: { in: interestIds } } } : undefined,
      },
      select: {
        id: true, username: true,
        profile: { select: { displayName: true, avatarUrl: true, completenessScore: true } },
        reputationSummary: { select: { averageScore: true } },
      },
      take: 20,
    });

    await this.redis.set(cacheKey, JSON.stringify(people), CACHE_TTL);
    return people;
  }

  async getActivities(userId: string) {
    const cacheKey = `recs:activities:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as unknown[];

    const userInterests = await this.prisma.userInterest.findMany({
      where: { userId }, select: { interestId: true },
    });
    const interestIds = userInterests.map((i) => i.interestId);

    const activities = await this.prisma.activity.findMany({
      where: {
        status: 'ACTIVE',
        isPrivate: false,
        deletedAt: null,
        activityInterests: interestIds.length ? { some: { interestId: { in: interestIds } } } : undefined,
        participants: { none: { userId } },
      },
      include: {
        creator: { select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        activityInterests: { include: { interest: true }, take: 3 },
        _count: { select: { participants: { where: { status: 'JOINED' } } } },
      },
      take: 20,
    });

    await this.redis.set(cacheKey, JSON.stringify(activities), CACHE_TTL);
    return activities;
  }

  async getInterests(userId: string) {
    const existing = await this.prisma.userInterest.findMany({
      where: { userId }, select: { interestId: true },
    });
    const existingIds = existing.map((i) => i.interestId);

    return this.prisma.interest.findMany({
      where: { isActive: true, id: { notIn: existingIds } },
      include: { category: true },
      take: 20,
      orderBy: { userInterests: { _count: 'desc' } },
    });
  }

  async invalidateCache(userId: string): Promise<void> {
    await this.redis.del(`recs:people:${userId}`, `recs:activities:${userId}`);
  }
}
