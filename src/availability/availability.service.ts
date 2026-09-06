import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityType, DayOfWeek } from '@prisma/client';
import { NotFoundException } from '../common/exceptions/app.exception';

export class UpsertAvailabilityDto {
  type: AvailabilityType;
  dayOfWeek?: DayOfWeek;
  date?: string;
  startTime: string;
  endTime: string;
  timezone?: string;
  isActive?: boolean;
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.availability.findMany({ where: { userId, isActive: true } });
  }

  async create(userId: string, dto: UpsertAvailabilityDto) {
    return this.prisma.availability.create({
      data: {
        userId,
        type: dto.type,
        dayOfWeek: dto.dayOfWeek,
        date: dto.date ? new Date(dto.date) : undefined,
        startTime: dto.startTime,
        endTime: dto.endTime,
        timezone: dto.timezone ?? 'UTC',
      },
    });
  }

  async update(userId: string, id: string, dto: Partial<UpsertAvailabilityDto>) {
    const slot = await this.prisma.availability.findFirst({ where: { id, userId } });
    if (!slot) throw new NotFoundException('Availability slot', id);
    return this.prisma.availability.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    const slot = await this.prisma.availability.findFirst({ where: { id, userId } });
    if (!slot) throw new NotFoundException('Availability slot', id);
    await this.prisma.availability.delete({ where: { id } });
    return { message: 'Availability slot removed' };
  }
}
