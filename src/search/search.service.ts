import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PeopleVisibilityService } from '../people/people-visibility.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly peopleVisibility: PeopleVisibilityService,
  ) {}

  /**
   * Unified search across activities, skills, and interests.
   * User search is scoped to the requester's visible users only.
   */
  async searchAll(query: string, requesterId: string, limit = 20) {
    const [users, activities, skills, interests] = await Promise.all([
      this.searchUsers(query, requesterId, limit),
      this.searchActivities(query, limit),
      this.searchSkills(query, limit),
      this.searchInterests(query, limit),
    ]);
    return { users, activities, skills, interests };
  }

  /**
   * Search users — restricted to activity-based visible users only.
   * A user who has never shared an activity with the requester will NOT appear.
   */
  async searchUsers(query: string, requesterId: string, limit = 20) {
    // Resolve the set of users the requester can see
    const visibleIds = await this.peopleVisibility.getVisibleUserIds(requesterId);

    if (visibleIds.length === 0) return [];

    return this.prisma.user.findMany({
      where: {
        id: { in: visibleIds },
        status: 'ACTIVE',
        deletedAt: null,
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { profile: { displayName: { contains: query, mode: 'insensitive' } } },
        ],
      },
      select: {
        id: true,
        username: true,
        profile: { select: { displayName: true, avatarUrl: true, city: true } },
      },
      take: limit,
    });
  }

  async searchActivities(query: string, limit = 20) {
    return this.prisma.activity.findMany({
      where: {
        status: 'ACTIVE',
        isPrivate: false,
        deletedAt: null,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { city: { contains: query, mode: 'insensitive' } },
          { tags: { has: query } },
        ],
      },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
      take: limit,
    });
  }

  async searchSkills(query: string, limit = 20) {
    return this.prisma.skill.findMany({
      where: { isActive: true, name: { contains: query, mode: 'insensitive' } },
      include: { category: true },
      take: limit,
    });
  }

  async searchInterests(query: string, limit = 20) {
    return this.prisma.interest.findMany({
      where: { isActive: true, name: { contains: query, mode: 'insensitive' } },
      include: { category: true },
      take: limit,
    });
  }
}
