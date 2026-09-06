import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { NotFoundException, ForbiddenException, BadRequestException } from '../common/exceptions/app.exception';
import { ConnectionStatus, UserStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        userSkills: { include: { skill: true } },
        userInterests: { include: { interest: true } },
        reputationSummary: true,
      },
    });
    if (!user) throw new NotFoundException('User', userId);

    const connectionsCount = await this.prisma.connection.count({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        status: ConnectionStatus.ACCEPTED,
      },
    });

    const { ...safeUser } = user;
    return {
      ...safeUser,
      reputationSummary: {
        ...(safeUser.reputationSummary ?? { level: 1, activitiesJoined: 0, activitiesHosted: 0, totalPoints: 0 }),
        connectionsCount,
      },
    };
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User', userId);

    if (dto.username && dto.username !== user.username) {
      const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
      if (exists) throw new BadRequestException('Username already taken');
    }

    if (dto.interests) {
      let category = await this.prisma.interestCategory.findFirst({ where: { name: 'General' } });
      if (!category) category = await this.prisma.interestCategory.create({ data: { name: 'General' } });
      
      const interestIds = await Promise.all(dto.interests.map(async (name) => {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        let interest = await this.prisma.interest.findUnique({ where: { slug } });
        if (!interest) interest = await this.prisma.interest.create({ data: { name, slug, categoryId: category.id } });
        return interest.id;
      }));

      await this.prisma.userInterest.deleteMany({ where: { userId } });
      if (interestIds.length > 0) {
        await this.prisma.userInterest.createMany({
          data: interestIds.map(id => ({ userId, interestId: id }))
        });
      }
    }

    if (dto.skills) {
      let category = await this.prisma.skillCategory.findFirst({ where: { name: 'General' } });
      if (!category) category = await this.prisma.skillCategory.create({ data: { name: 'General' } });
      
      const skillIds = await Promise.all(dto.skills.map(async (name) => {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
        let skill = await this.prisma.skill.findUnique({ where: { slug } });
        if (!skill) skill = await this.prisma.skill.create({ data: { name, slug, categoryId: category.id } });
        return skill.id;
      }));

      await this.prisma.userSkill.deleteMany({ where: { userId } });
      if (skillIds.length > 0) {
        await this.prisma.userSkill.createMany({
          data: skillIds.map(id => ({ userId, skillId: id }))
        });
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { 
        username: dto.username,
        profile: {
          update: {
            displayName: dto.displayName,
            bio: dto.bio,
            city: dto.city,
            state: dto.state,
            country: dto.country,
          }
        }
      },
      include: { profile: true },
    });
  }

  async deactivate(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.INACTIVE },
    });
    return { message: 'Account deactivated' };
  }

  async reactivate(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ACTIVE },
    });
    return { message: 'Account reactivated' };
  }

  async softDelete(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.DELETED, deletedAt: new Date() },
    });
    // TODO: queue account-deletion job for cascading cleanup
    return { message: 'Account scheduled for deletion' };
  }

  async updatePrivacy(userId: string, dto: { profilePrivacy?: string; locationPrivacy?: string }) {
    return this.prisma.profile.update({
      where: { userId },
      data: dto as any,
    });
  }

  async updateDiscovery(userId: string, dto: { discoveryEnabled?: boolean; maxDiscoveryDistance?: number }) {
    return this.prisma.profile.update({
      where: { userId },
      data: dto,
    });
  }

  async getPublicProfile(username: string, requesterId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        profile: true,
        userSkills: { include: { skill: { include: { category: true } } } },
        userInterests: { include: { interest: { include: { category: true } } } },
        reputationSummary: true,
      },
    });

    if (!user || user.deletedAt || user.status === UserStatus.BANNED) {
      throw new NotFoundException('User');
    }

    // Check block
    if (requesterId) {
      const block = await this.prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: requesterId, blockedUserId: user.id },
            { blockerId: user.id, blockedUserId: requesterId },
          ],
        },
      });
      if (block) throw new ForbiddenException('User not available');
    }

    const connectionsCount = await this.prisma.connection.count({
      where: {
        OR: [{ fromUserId: user.id }, { toUserId: user.id }],
        status: ConnectionStatus.ACCEPTED,
      },
    });

    const { ...safeUser } = user;
    return {
      ...safeUser,
      reputationSummary: {
        ...(safeUser.reputationSummary ?? { level: 1, activitiesJoined: 0, activitiesHosted: 0, totalPoints: 0 }),
        connectionsCount,
      },
    };
  }
}
