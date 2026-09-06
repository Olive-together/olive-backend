import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async submitRating(userId: string, targetId: string, activityId: string, score: number, review?: string) {
    return this.prisma.rating.create({
      data: {
        giverId: userId,
        receiverId: targetId,
        activityId,
        score,
        comment: review,
      }
    });
  }
}
