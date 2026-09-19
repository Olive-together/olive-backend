import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType, Prisma } from '@prisma/client';
import type { Server } from 'socket.io';

/** Structured payload stored in notification.data JSON */
export interface NotificationData {
  actorId?: string;
  actorName?: string;
  referenceId?: string;
  referenceType?: 'ACTIVITY' | 'CONNECTION' | 'CONVERSATION' | 'MESSAGE' | 'USER';
  [key: string]: unknown;
}

export interface UpdateNotifPrefsDto {
  activityJoins?: boolean;
  connectionRequests?: boolean;
  messages?: boolean;
  activityReminders?: boolean;
  recommendations?: boolean;
  ratings?: boolean;
}

/**
 * Maps each NotificationType enum value to the user-pref key that gates it.
 * Unmapped types (e.g. SYSTEM) are always delivered.
 */
const TYPE_TO_PREF: Partial<Record<NotificationType, keyof UpdateNotifPrefsDto>> = {
  [NotificationType.ACTIVITY_JOIN]:      'activityJoins',
  [NotificationType.ACTIVITY_REQUEST]:   'activityJoins',
  [NotificationType.ACTIVITY_ACCEPTED]:  'activityJoins',
  [NotificationType.ACTIVITY_REJECTED]:  'activityJoins',
  [NotificationType.ACTIVITY_INVITE]:    'activityJoins',
  [NotificationType.ACTIVITY_CANCELLED]: 'activityJoins',
  [NotificationType.ACTIVITY_REMINDER]:  'activityReminders',
  [NotificationType.CONNECTION_REQUEST]: 'connectionRequests',
  [NotificationType.CONNECTION_ACCEPTED]:'connectionRequests',
  [NotificationType.MESSAGE_NEW]:        'messages',
  [NotificationType.MATCH_SUGGESTION]:   'recommendations',
  [NotificationType.RATING_RECEIVED]:    'ratings',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  /**
   * Reference to the Socket.IO server injected by ChatGateway after it boots.
   * Using setter injection avoids a circular module dependency.
   */
  private ioServer?: Server;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Gateway Integration ──────────────────────────────────────────────────

  setGatewayRef(server: Server): void {
    this.ioServer = server;
  }

  // ─── Notification Preferences ─────────────────────────────────────────────

  /** Get (or lazily create) notification prefs for a user. */
  async getPrefs(userId: string) {
    const prefs = await this.prisma.userNotificationPrefs.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    return prefs;
  }

  /** Update notification prefs — only provided fields are changed. */
  async updatePrefs(userId: string, dto: UpdateNotifPrefsDto) {
    const prefs = await this.prisma.userNotificationPrefs.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
    return prefs;
  }

  // ─── Core CRUD ────────────────────────────────────────────────────────────

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { items, total, page: Number(page), limit: take };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
    return { message: 'Marked as read' };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { message: 'All notifications marked as read' };
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  // ─── Notification Creation ─────────────────────────────────────────────────

  /**
   * Creates a notification if the recipient has that notification type enabled.
   * Always delivers SYSTEM notifications regardless of prefs.
   */
  async createNotification(
    recipientId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: NotificationData,
  ) {
    // Check user pref for this notification type
    const prefKey = TYPE_TO_PREF[type];
    if (prefKey) {
      try {
        const prefs = await this.getPrefs(recipientId);
        if (!prefs[prefKey]) {
          this.logger.debug(
            `Skipping ${type} notification for user ${recipientId} — pref '${prefKey}' is disabled`,
          );
          return null;
        }
      } catch (err) {
        // If prefs lookup fails, fail open (deliver the notification)
        this.logger.warn(`Could not load notif prefs for ${recipientId}: ${(err as Error).message}`);
      }
    }

    const notification = await this.prisma.notification.create({
      data: {
        userId: recipientId,
        type,
        title,
        body,
        data: (data ?? {}) as Prisma.InputJsonValue,
      },
    });

    // ── Real-time push ─────────────────────────────────────────────────────
    if (this.ioServer) {
      this.ioServer.to(`user:${recipientId}`).emit('notification:new', {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        isRead: false,
        createdAt: notification.createdAt,
      });
    }

    return notification;
  }

  // ─── Convenience Helpers ──────────────────────────────────────────────────

  async notifyActivityJoin(
    creatorId: string,
    actorId: string,
    actorName: string,
    activityId: string,
    activityTitle: string,
  ) {
    if (creatorId === actorId) return;
    return this.createNotification(
      creatorId,
      NotificationType.ACTIVITY_JOIN,
      'New participant joined',
      `${actorName} joined your activity "${activityTitle}"`,
      { actorId, actorName, referenceId: activityId, referenceType: 'ACTIVITY' },
    );
  }

  async notifyConnectionAccepted(
    requesterId: string,
    acceptorId: string,
    acceptorName: string,
    connectionId: string,
  ) {
    return this.createNotification(
      requesterId,
      NotificationType.CONNECTION_ACCEPTED,
      'Connection accepted',
      `${acceptorName} accepted your connection request`,
      { actorId: acceptorId, actorName: acceptorName, referenceId: connectionId, referenceType: 'CONNECTION' },
    );
  }

  async notifyDirectMessage(
    recipientId: string,
    senderId: string,
    senderName: string,
    conversationId: string,
    messagePreview: string,
  ) {
    const preview =
      messagePreview.length > 60
        ? `${messagePreview.slice(0, 60)}…`
        : messagePreview;

    return this.createNotification(
      recipientId,
      NotificationType.MESSAGE_NEW,
      `New message from ${senderName}`,
      preview,
      {
        actorId: senderId,
        actorName: senderName,
        referenceId: conversationId,
        referenceType: 'CONVERSATION',
      },
    );
  }
}
