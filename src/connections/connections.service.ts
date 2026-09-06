import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectionStatus, NotificationType } from '@prisma/client';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../common/exceptions/app.exception';

@Injectable()
export class ConnectionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async checkBlocked(userId: string, targetId: string) {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedUserId: targetId },
          { blockerId: targetId, blockedUserId: userId },
        ],
      },
    });
    if (block) throw new ForbiddenException('Cannot connect with this user');
  }

  async request(fromUserId: string, toUserId: string) {
    if (fromUserId === toUserId) throw new BadRequestException('Cannot connect to yourself');
    await this.checkBlocked(fromUserId, toUserId);

    const existing = await this.prisma.connection.findFirst({
      where: {
        OR: [
          { fromUserId, toUserId },
          { fromUserId: toUserId, toUserId: fromUserId },
        ],
      },
    });
    if (existing) throw new ConflictException('Connection already exists');

    const conn = await this.prisma.connection.create({ data: { fromUserId, toUserId } });

    const fromUser = await this.prisma.user.findUnique({ where: { id: fromUserId }, include: { profile: true } });
    const senderName = fromUser?.profile?.displayName ?? fromUser?.username ?? 'Someone';

    await this.prisma.notification.create({
      data: {
        userId: toUserId,
        type: NotificationType.CONNECTION_REQUEST,
        title: 'New Connection Request',
        body: `${senderName} wants to connect with you`,
        data: {
          referenceId: conn.id,
          referenceType: 'CONNECTION',
        }
      }
    });

    return conn;
  }

  async accept(userId: string, connectionId: string) {
    const conn = await this.prisma.connection.findFirst({
      where: { id: connectionId, toUserId: userId, status: ConnectionStatus.PENDING },
    });
    if (!conn) throw new NotFoundException('Connection request');
    return this.prisma.connection.update({
      where: { id: connectionId },
      data: { status: ConnectionStatus.ACCEPTED, respondedAt: new Date() },
    });
  }

  async reject(userId: string, connectionId: string) {
    const conn = await this.prisma.connection.findFirst({
      where: { id: connectionId, toUserId: userId, status: ConnectionStatus.PENDING },
    });
    if (!conn) throw new NotFoundException('Connection request');
    return this.prisma.connection.update({
      where: { id: connectionId },
      data: { status: ConnectionStatus.REJECTED, respondedAt: new Date() },
    });
  }

  async remove(userId: string, connectionId: string) {
    const conn = await this.prisma.connection.findFirst({
      where: { id: connectionId, OR: [{ fromUserId: userId }, { toUserId: userId }] },
    });
    if (!conn) throw new NotFoundException('Connection');
    await this.prisma.connection.delete({ where: { id: connectionId } });
    return { message: 'Connection removed' };
  }

  async list(userId: string) {
    return this.prisma.connection.findMany({
      where: {
        OR: [{ fromUserId: userId }, { toUserId: userId }],
        status: ConnectionStatus.ACCEPTED,
      },
      include: {
        fromUser: { select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        toUser: { select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
    });
  }

  async listPending(userId: string) {
    return this.prisma.connection.findMany({
      where: {
        OR: [{ toUserId: userId }, { fromUserId: userId }],
        status: ConnectionStatus.PENDING,
      },
      include: {
        fromUser: { select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        toUser: { select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
      },
    });
  }
}
