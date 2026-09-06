import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationType } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '../common/exceptions/app.exception';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Membership Helpers ───────────────────────────────────────────────────

  /**
   * Returns true if the user is an active member of the conversation
   * (leftAt is null = they haven't left or been removed).
   */
  async isMember(userId: string, conversationId: string): Promise<boolean> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    return !!member && member.leftAt === null;
  }

  /** Add a user to a conversation (idempotent — safe to call multiple times). */
  async addMemberToConversation(conversationId: string, userId: string): Promise<void> {
    await this.prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId },
      // Re-activate if they previously left
      update: { leftAt: null, joinedAt: new Date() },
    });
  }

  /** Remove a user from a conversation by setting leftAt. */
  async removeMemberFromConversation(conversationId: string, userId: string): Promise<void> {
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId, leftAt: null },
      data: { leftAt: new Date() },
    });
  }

  // ─── Direct Conversations ─────────────────────────────────────────────────

  async getOrCreateDirectConversation(userId: string, targetUserId: string) {
    // Find existing DM conversation between two users
    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        members: { every: { userId: { in: [userId, targetUserId] } } },
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: targetUserId } } },
        ],
      },
      include: { members: true },
    });

    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        type: ConversationType.DIRECT,
        isGroup: false,
        members: { create: [{ userId }, { userId: targetUserId }] },
      },
      include: { members: true },
    });
  }

  // ─── Group Conversations ──────────────────────────────────────────────────

  /**
   * Idempotent — creates a group conversation for an activity if one doesn't
   * exist. The @unique constraint on activityId enforces this at DB level.
   */
  async getOrCreateGroupConversation(activityId: string, name: string): Promise<string> {
    // Use upsert with the unique activityId to prevent races
    const conv = await this.prisma.conversation.upsert({
      where: { activityId },
      create: {
        type: ConversationType.GROUP,
        isGroup: true,
        name,
        activityId,
      },
      update: {},   // Already exists — leave it as-is
    });
    return conv.id;
  }

  /**
   * Returns the group conversation for an activity, verifying that the
   * requesting user is a valid participant of that activity.
   */
  async getActivityGroupConversation(userId: string, activityId: string) {
    // Verify user is an active participant of the activity
    const participation = await this.prisma.activityParticipant.findUnique({
      where: { activityId_userId: { activityId, userId } },
    });
    if (
      !participation ||
      !['JOINED', 'ACCEPTED'].includes(participation.status as string)
    ) {
      throw new ForbiddenException('You are not an active participant of this activity');
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { activityId },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profile: { select: { displayName: true, avatarUrl: true } },
              },
            },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        activity: {
          select: { id: true, title: true, status: true, creatorId: true },
        },
      },
    });

    if (!conversation) throw new NotFoundException('Group conversation', activityId);
    return conversation;
  }

  // ─── Conversation Listing ─────────────────────────────────────────────────

  /**
   * Returns all conversations the user is an active member of.
   * Pass `type` to filter to DIRECT or GROUP only.
   */
  async getConversations(userId: string, type?: ConversationType) {
    return this.prisma.conversation.findMany({
      where: {
        members: { some: { userId, leftAt: null } },
        ...(type ? { type } : {}),
      },
      include: {
        // For DIRECT: show the other participant's info
        // For GROUP: show up to 5 member previews
        members: {
          where: { userId: { not: userId }, leftAt: null },
          take: 5,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profile: { select: { displayName: true, avatarUrl: true } },
              },
            },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        activity: {
          select: { id: true, title: true, status: true, coverUrl: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // ─── Messages ─────────────────────────────────────────────────────────────

  async getMessages(
    userId: string,
    conversationId: string,
    options: { cursor?: string; limit?: number },
  ) {
    // Verify active membership
    const isMember = await this.isMember(userId, conversationId);
    if (!isMember) throw new ForbiddenException('Not a member of this conversation');

    const limit = options.limit ?? 30;
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(options.cursor ? { id: { lt: options.cursor } } : {}),
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : undefined, hasMore };
  }

  async sendMessage(userId: string, conversationId: string, content: string) {
    // Verify active membership (leftAt null)
    const isMember = await this.isMember(userId, conversationId);
    if (!isMember) throw new ForbiddenException('Not a member of this conversation');

    const message = await this.prisma.message.create({
      data: { conversationId, senderId: userId, content },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
    });

    // Bump conversation's updatedAt so it floats to top of list
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  async markRead(userId: string, conversationId: string) {
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });
    return { message: 'Marked as read' };
  }
}
