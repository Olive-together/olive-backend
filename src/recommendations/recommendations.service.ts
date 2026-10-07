import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PeopleVisibilityService } from '../people/people-visibility.service';

const CACHE_TTL = 3600; // 1 hour

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly peopleVisibility: PeopleVisibilityService,
  ) {}

  /**
   * Returns people the user has met through activities.
   * Replaces the old interest-based discovery: only activity-connected users are returned.
   * Cache key still per-user for performance, but data is activity-scoped.
   */
  async getPeople(userId: string) {
    const cacheKey = `recs:people:v2:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as unknown[];

    const result = await this.peopleVisibility.getPeopleWithContext(userId, {
      page: 1,
      limit: 20,
    });

    await this.redis.set(cacheKey, JSON.stringify(result.items), CACHE_TTL);
    return result.items;
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
        scheduledAt: { gte: new Date() },
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
    await this.redis.del(
      `recs:people:v2:${userId}`,
      `recs:activities:${userId}`,
    );
  }
}
