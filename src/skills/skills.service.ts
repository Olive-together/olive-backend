import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '../common/exceptions/app.exception';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(search?: string) {
    return this.prisma.skill.findMany({
      where: {
        isActive: true,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const skill = await this.prisma.skill.findUnique({ where: { id }, include: { category: true } });
    if (!skill) throw new NotFoundException('Skill', id);
    return skill;
  }

  async findCategories() {
    return this.prisma.skillCategory.findMany({ include: { skills: { where: { isActive: true } } } });
  }

  async create(dto: { name: string; slug: string; categoryId: string; description?: string }) {
    const exists = await this.prisma.skill.findUnique({ where: { slug: dto.slug } });
    if (exists) throw new ConflictException('Skill with this slug already exists');
    return this.prisma.skill.create({ data: dto });
  }

  async update(id: string, dto: Partial<{ name: string; description: string; isActive: boolean }>) {
    return this.prisma.skill.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.skill.update({ where: { id }, data: { isActive: false } });
    return { message: 'Skill deactivated' };
  }

  async createCategory(dto: { name: string; description?: string; iconUrl?: string }) {
    return this.prisma.skillCategory.create({ data: dto });
  }
}
