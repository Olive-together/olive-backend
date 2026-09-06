import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '../common/exceptions/app.exception';

@Injectable()
export class InterestsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(search?: string) {
    return this.prisma.interest.findMany({
      where: {
        isActive: true,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: { category: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const interest = await this.prisma.interest.findUnique({ where: { id }, include: { category: true } });
    if (!interest) throw new NotFoundException('Interest', id);
    return interest;
  }

  async findCategories() {
    return this.prisma.interestCategory.findMany({ include: { interests: { where: { isActive: true } } } });
  }

  async create(dto: { name: string; slug: string; categoryId: string; description?: string }) {
    const exists = await this.prisma.interest.findUnique({ where: { slug: dto.slug } });
    if (exists) throw new ConflictException('Interest with this slug already exists');
    return this.prisma.interest.create({ data: dto });
  }

  async update(id: string, dto: Partial<{ name: string; description: string; isActive: boolean }>) {
    return this.prisma.interest.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.prisma.interest.update({ where: { id }, data: { isActive: false } });
    return { message: 'Interest deactivated' };
  }

  async createCategory(dto: { name: string; description?: string; iconUrl?: string }) {
    return this.prisma.interestCategory.create({ data: dto });
  }
}
