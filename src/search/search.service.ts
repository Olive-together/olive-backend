import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async searchAll(query: string, limit = 20) {
    const [users, activities, skills, interests] = await Promise.all([
      this.searchUsers(query, limit),
      this.searchActivities(query, limit),
      this.searchSkills(query, limit),
      this.searchInterests(query, limit),
    ]);
    return { users, activities, skills, interests };
  }

  async searchUsers(query: string, limit = 20) {
    return this.prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        profile: { discoveryEnabled: true },
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { profile: { displayName: { contains: query, mode: 'insensitive' } } },
          { userInterests: { some: { interest: { name: { contains: query, mode: 'insensitive' } } } } },
          { userSkills: { some: { skill: { name: { contains: query, mode: 'insensitive' } } } } },
        ],
      },
      select: {
        id: true,
        username: true,
        profile: { select: { displayName: true, avatarUrl: true } },
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
          { tags: { has: query } }
        ],
      },
      include: {
        creator: { select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
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
