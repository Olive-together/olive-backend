import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { NotFoundException } from '../common/exceptions/app.exception';

@Injectable()
export class ProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Profile');
    return profile;
  }

  async updateMyProfile(userId: string, dto: UpdateProfileDto) {
    const profile = await this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
    // Recalculate completeness
    await this.recalculateCompleteness(userId);
    return profile;
  }

  private async recalculateCompleteness(userId: string): Promise<void> {
    const [profile, skillCount, interestCount] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.userSkill.count({ where: { userId } }),
      this.prisma.userInterest.count({ where: { userId } }),
    ]);

    if (!profile) return;

    let score = 0;
    if (profile.displayName) score += 10;
    if (profile.bio) score += 20;
    if (profile.avatarUrl) score += 20;
    if (profile.city) score += 10;
    if (skillCount > 0) score += 20;
    if (interestCount > 0) score += 20;

    await this.prisma.profile.update({
      where: { userId },
      data: { completenessScore: score },
    });
  }

  async getMySkills(userId: string) {
    return this.prisma.userSkill.findMany({
      where: { userId },
      include: { skill: { include: { category: true } } },
    });
  }

  async addSkill(userId: string, dto: { skillId: string; level?: string; yearsExp?: number }) {
    return this.prisma.userSkill.upsert({
      where: { userId_skillId: { userId, skillId: dto.skillId } },
      create: { userId, skillId: dto.skillId, level: dto.level as never, yearsExp: dto.yearsExp },
      update: { level: dto.level as never, yearsExp: dto.yearsExp },
    });
  }

  async removeSkill(userId: string, skillId: string) {
    await this.prisma.userSkill.delete({
      where: { userId_skillId: { userId, skillId } },
    });
    return { message: 'Skill removed' };
  }

  async getMyInterests(userId: string) {
    return this.prisma.userInterest.findMany({
      where: { userId },
      include: { interest: { include: { category: true } } },
    });
  }

  async addInterest(userId: string, interestId: string) {
    return this.prisma.userInterest.upsert({
      where: { userId_interestId: { userId, interestId } },
      create: { userId, interestId },
      update: {},
    });
  }

  async removeInterest(userId: string, interestId: string) {
    await this.prisma.userInterest.delete({
      where: { userId_interestId: { userId, interestId } },
    });
    return { message: 'Interest removed' };
  }
}
