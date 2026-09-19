import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActivityStatus,
  ActivityType,
  AuditAction,
  NotificationType,
  ParticipantStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { Request } from 'express';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '../common/exceptions/app.exception';
import { ChatService } from '../chat/chat.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ModerationService } from '../moderation/moderation.service';

export interface CreateActivityDto {
  title: string;
  description: string;
  category?: string;
  type?: ActivityType;
  maxParticipants?: number;
  isPrivate?: boolean;
  requiresApproval?: boolean;
  latitude?: number;
  longitude?: number;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  scheduledAt?: string;
  endsAt?: string;
  expiresAt?: string;
  tags?: string[];
  interestIds?: string[];
  skillIds?: string[];
}

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
    private readonly notifications: NotificationsService,
    private readonly moderation: ModerationService,
  ) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateActivityDto) {
    const tags = [
      ...new Set(
        [...(dto.category ? [dto.category] : []), ...(dto.tags ?? [])]
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ];

    const activity = await this.prisma.activity.create({
      data: {
        creatorId: userId,
        title: dto.title,
        description: dto.description,
        type: dto.type ?? ActivityType.ONE_TIME,
        maxParticipants: dto.maxParticipants ?? 10,
        isPrivate: dto.isPrivate ?? false,
        requiresApproval: dto.requiresApproval ?? false,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        tags,
        status: ActivityStatus.ACTIVE,
        activityInterests: dto.interestIds?.length
          ? { create: dto.interestIds.map((id) => ({ interestId: id })) }
          : undefined,
        activitySkills: dto.skillIds?.length
          ? { create: dto.skillIds.map((id) => ({ skillId: id })) }
          : undefined,
      },
      include: { activityInterests: true, activitySkills: true },
    });

    // Set PostGIS coordinates via raw SQL if provided
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE activities SET coordinates = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
        dto.longitude,
        dto.latitude,
        activity.id,
      );
    }

    // Auto-join creator as participant
    await this.prisma.activityParticipant.create({
      data: {
        activityId: activity.id,
        userId,
        status: ParticipantStatus.JOINED,
        joinedAt: new Date(),
      },
    });

    // Increment activitiesHosted in ReputationSummary
    await this.prisma.reputationSummary.update({
      where: { userId },
      data: {
        activitiesHosted: { increment: 1 },
      },
    });

    // ── Create group conversation and add creator as the first member ──────
    try {
      const convId = await this.chat.getOrCreateGroupConversation(activity.id, dto.title);
      await this.chat.addMemberToConversation(convId, userId);
    } catch (err) {
      // Non-fatal — activity is already created; log and continue
      this.logger.error(
        `Failed to create group conversation for activity ${activity.id}: ${(err as Error).message}`,
      );
    }

    return this.findOne(activity.id);
  }

  async findAll(filters: {
    status?: ActivityStatus;
    city?: string;
    state?: string;
    lat?: string;
    lng?: string;
    radiusKm?: string;
    cursor?: string;
    limit?: number;
    timeline?: 'upcoming' | 'past';
    userId?: string; // optional — enriches each item with isJoined
  }) {
    const limit = filters.limit ? Number(filters.limit) : 20;

    let geoIds: string[] | undefined;
    if (filters.lat && filters.lng) {
      const radiusMeters = (filters.radiusKm ? Number(filters.radiusKm) : 20) * 1000;
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM activities
        WHERE coordinates IS NOT NULL
          AND ST_DWithin(coordinates::geography, ST_SetSRID(ST_MakePoint(${Number(filters.lng)}, ${Number(filters.lat)}), 4326)::geography, ${radiusMeters})
      `;
      geoIds = rows.map((r) => r.id);
      if (geoIds.length === 0) {
        return { items: [], nextCursor: undefined, hasMore: false };
      }
    }

    const whereClause: Prisma.ActivityWhereInput = {
      deletedAt: null,
      isPrivate: false,
      ...(geoIds ? { id: { in: geoIds } } : {}),
      ...(filters.city ? { city: { contains: filters.city, mode: 'insensitive' } } : {}),
      ...(filters.state ? { state: { contains: filters.state, mode: 'insensitive' } } : {}),
    };

    if (filters.timeline === 'upcoming') {
      // Upcoming: only ACTIVE activities whose date is in the future
      whereClause.status = ActivityStatus.ACTIVE;
      whereClause.scheduledAt = { gte: new Date() };
    } else if (filters.timeline === 'past') {
      // Past: COMPLETED or EXPIRED, OR ACTIVE activities whose date passed (cron lag), OR TBD activities (no date)
      whereClause.OR = [
        { status: { in: [ActivityStatus.COMPLETED, ActivityStatus.EXPIRED] } },
        { status: ActivityStatus.ACTIVE, scheduledAt: { lt: new Date() } },
        { status: ActivityStatus.ACTIVE, scheduledAt: null },
      ];
    } else {
      // Default (no timeline): only ACTIVE
      whereClause.status = filters.status ?? ActivityStatus.ACTIVE;
    }

    const activities = await this.prisma.activity.findMany({
      where: whereClause,
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
        activityInterests: { include: { interest: true } },
        _count: { select: { participants: { where: { status: ParticipantStatus.JOINED } } } },
      },
      orderBy:
        filters.timeline === 'upcoming'
          ? [{ scheduledAt: 'asc' }, { id: 'asc' }]
          : filters.timeline === 'past'
            ? [{ scheduledAt: 'desc' }, { id: 'asc' }]
            : [{ createdAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    });

    const hasMore = activities.length > limit;
    const items = hasMore ? activities.slice(0, limit) : activities;
    const nextCursor = hasMore ? items[items.length - 1].id : undefined;

    if (items.length > 0) {
      const ids = items.map((a) => a.id);

      // Batch-fetch coordinates for all items in one query
      const coords = await this.prisma.$queryRaw<{ id: string; lat: number; lng: number }[]>`
        SELECT id, ST_Y(coordinates::geometry) as lat, ST_X(coordinates::geometry) as lng 
        FROM activities 
        WHERE id IN (${Prisma.join(ids)}) AND coordinates IS NOT NULL
      `;
      const coordMap = new Map(coords.map((c) => [c.id, c]));

      // Batch-fetch which of these activities the user has joined
      let joinedSet = new Set<string>();
      if (filters.userId) {
        const participations = await this.prisma.activityParticipant.findMany({
          where: {
            activityId: { in: ids },
            userId: filters.userId,
            status: { in: [ParticipantStatus.JOINED, ParticipantStatus.ACCEPTED] },
          },
          select: { activityId: true },
        });
        joinedSet = new Set(participations.map((p) => p.activityId));
      }

      (
        items as ((typeof activities)[0] & { lat?: number; lng?: number; isJoined?: boolean })[]
      ).forEach((item) => {
        const c = coordMap.get(item.id);
        if (c) {
          item.lat = c.lat;
          item.lng = c.lng;
        }
        item.isJoined = joinedSet.has(item.id);
      });
    }

    return { items, nextCursor, hasMore };
  }

  async findOne(id: string, userId?: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, deletedAt: null },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
        activityInterests: { include: { interest: { include: { category: true } } } },
        activitySkills: { include: { skill: { include: { category: true } } } },
        _count: { select: { participants: { where: { status: ParticipantStatus.JOINED } } } },
        // Include group conversation summary (id only — full details via /activities/:id/chat)
        groupConversation: { select: { id: true } },
      },
    });
    if (!activity) throw new NotFoundException('Activity', id);

    // Enrich with PostGIS coordinates (stored in geography column, not standard Prisma columns)
    const coordRows = await this.prisma.$queryRaw<{ lat: number; lng: number }[]>`
      SELECT ST_Y(coordinates::geometry) as lat, ST_X(coordinates::geometry) as lng
      FROM activities WHERE id = ${id} AND coordinates IS NOT NULL
    `;
    const coords = coordRows[0] ?? null;

    // Compute isJoined for the requesting user
    let isJoined = false;
    if (userId) {
      const participation = await this.prisma.activityParticipant.findUnique({
        where: { activityId_userId: { activityId: id, userId } },
        select: { status: true },
      });
      isJoined =
        participation?.status === ParticipantStatus.JOINED ||
        participation?.status === ParticipantStatus.ACCEPTED;
    }

    return {
      ...activity,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      isJoined,
    };
  }

  async update(userId: string, id: string, dto: Partial<CreateActivityDto>) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Activity', id);
    if (activity.creatorId !== userId)
      throw new ForbiddenException('Only the creator can update this activity');

    return this.prisma.activity.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        maxParticipants: dto.maxParticipants,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
        tags: dto.tags,
      },
    });
  }

  async remove(userId: string, userRole: string, id: string, reason?: string, req?: Request) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        title: true,
        creatorId: true,
        status: true,
      },
    });
    if (!activity) throw new NotFoundException('Activity', id);
    const isAdmin = userRole === UserRole.ADMIN;
    if (!isAdmin && activity.creatorId !== userId) {
      throw new ForbiddenException('Only the creator or an administrator can delete this activity');
    }

    await this.prisma.activity.update({
      where: { id },
      data: { deletedAt: new Date(), status: ActivityStatus.CANCELLED },
    });

    // Fetch all joined participants (excluding the actor — they already know)
    const joinedParticipants = await this.prisma.activityParticipant.findMany({
      where: { activityId: id, status: ParticipantStatus.JOINED, userId: { not: userId } },
      select: { userId: true },
    });
    const participantIds = joinedParticipants.map((p) => p.userId);

    if (isAdmin && activity.creatorId !== userId) {
      const trimmedReason = reason?.trim();

      // Notify the host
      await this.notifications.createNotification(
        activity.creatorId,
        NotificationType.ACTIVITY_CANCELLED,
        'Activity Removed',
        trimmedReason
          ? `Your activity "${activity.title}" was removed by an administrator. Reason: ${trimmedReason}`
          : `Your activity "${activity.title}" was removed by an administrator.`,
        { referenceId: id, referenceType: 'ACTIVITY', adminRemoved: true },
      );

      // Notify all joined participants (except host who was already notified above)
      const participantsToNotify = participantIds.filter((pid) => pid !== activity.creatorId);
      await Promise.allSettled(
        participantsToNotify.map((participantId) =>
          this.notifications.createNotification(
            participantId,
            NotificationType.ACTIVITY_CANCELLED,
            'Activity Cancelled',
            trimmedReason
              ? `The activity "${activity.title}" was removed by an administrator. Reason: ${trimmedReason}`
              : `The activity "${activity.title}" has been removed by an administrator.`,
            { referenceId: id, referenceType: 'ACTIVITY', adminRemoved: true },
          ),
        ),
      );

      await this.moderation.recordAuditLog({
        actorId: userId,
        action: AuditAction.ACTIVITY_REMOVE,
        targetId: id,
        targetType: 'ACTIVITY',
        metadata: {
          activityTitle: activity.title,
          previousStatus: activity.status,
          reason: trimmedReason ?? 'No reason provided',
          removedFrom: 'GLOBAL_ACTIVITY_ROUTE',
        },
        req,
      });
    } else {
      // Host deleted their own activity — notify all participants
      const trimmedMessage = reason?.trim();
      await Promise.allSettled(
        participantIds.map((participantId) =>
          this.notifications.createNotification(
            participantId,
            NotificationType.ACTIVITY_CANCELLED,
            `"${activity.title}" has been cancelled`,
            trimmedMessage
              ? `The host cancelled this activity. Their message: "${trimmedMessage}"`
              : `The host has cancelled the activity "${activity.title}".`,
            { referenceId: id, referenceType: 'ACTIVITY', hostCancelled: true },
          ),
        ),
      );
    }

    // Group conversation history is preserved — no cascade delete.
    // Members keep read access; the activity status in the conv payload signals it's cancelled.
    return { message: isAdmin ? 'Activity removed' : 'Activity cancelled' };
  }

  // ─── Participation ───────────────────────────────────────────────────────

  async join(userId: string, activityId: string) {
    const activity = await this.findOne(activityId);

    // Block joining completed or expired activities
    if (
      activity.status === ActivityStatus.COMPLETED ||
      activity.status === ActivityStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'This activity has already taken place and is no longer joinable',
      );
    }
    if (activity.status !== ActivityStatus.ACTIVE) {
      throw new BadRequestException('Activity is not accepting participants');
    }

    // Block joining if the scheduled time has passed (cron may not have run yet)
    if (activity.scheduledAt && new Date(activity.scheduledAt) < new Date()) {
      throw new BadRequestException(
        'This activity has already started or ended and is no longer joinable',
      );
    }

    const count = await this.prisma.activityParticipant.count({
      where: { activityId, status: ParticipantStatus.JOINED },
    });
    if (count >= activity.maxParticipants) throw new BadRequestException('Activity is full');

    const existing = await this.prisma.activityParticipant.findUnique({
      where: { activityId_userId: { activityId, userId } },
    });
    if (existing) throw new ConflictException('Already participating in this activity');

    if (activity.requiresApproval) {
      // Request submitted — NOT added to conv yet; added only after creator accepts
      return this.prisma.activityParticipant.create({
        data: { activityId, userId, status: ParticipantStatus.REQUESTED },
      });
    }

    const result = await this.prisma.activityParticipant.create({
      data: { activityId, userId, status: ParticipantStatus.JOINED, joinedAt: new Date() },
    });

    await this.prisma.reputationSummary.update({
      where: { userId },
      data: { activitiesJoined: { increment: 1 } },
    });

    // ── Add to group conversation ──────────────────────────────────────────
    await this.syncGroupConvMembership(activityId, userId, 'add');

    // ── Notify activity creator ────────────────────────────────────────────
    try {
      const joiningUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true, profile: { select: { displayName: true } } },
      });
      const joinerName = joiningUser?.profile?.displayName ?? joiningUser?.username ?? 'Someone';
      await this.notifications.notifyActivityJoin(
        activity.creatorId,
        userId,
        joinerName,
        activityId,
        activity.title,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send join notification for activity ${activityId}: ${(err as Error).message}`,
      );
    }

    return result;
  }

  async leave(userId: string, activityId: string) {
    const participant = await this.prisma.activityParticipant.findUnique({
      where: { activityId_userId: { activityId, userId } },
    });
    if (!participant) throw new NotFoundException('Participation record');
    if (userId === (await this.findOne(activityId)).creatorId) {
      throw new BadRequestException('Creator cannot leave their own activity');
    }
    await this.prisma.activityParticipant.update({
      where: { activityId_userId: { activityId, userId } },
      data: { status: ParticipantStatus.LEFT, leftAt: new Date() },
    });

    if (participant.status === ParticipantStatus.JOINED) {
      await this.prisma.reputationSummary.update({
        where: { userId },
        data: { activitiesJoined: { decrement: 1 } },
      });
    }

    // ── Remove from group conversation ─────────────────────────────────────
    await this.syncGroupConvMembership(activityId, userId, 'remove');

    return { message: 'Left activity' };
  }

  async acceptRequest(creatorId: string, activityId: string, requestUserId: string) {
    const activity = await this.findOne(activityId);
    if (activity.creatorId !== creatorId)
      throw new ForbiddenException('Only creator can accept requests');

    await this.prisma.activityParticipant.update({
      where: { activityId_userId: { activityId, userId: requestUserId } },
      data: { status: ParticipantStatus.JOINED, joinedAt: new Date() },
    });

    await this.prisma.reputationSummary.update({
      where: { userId: requestUserId },
      data: { activitiesJoined: { increment: 1 } },
    });

    // ── Add accepted user to group conversation ────────────────────────────
    await this.syncGroupConvMembership(activityId, requestUserId, 'add');

    return { message: 'Request accepted' };
  }

  async rejectRequest(creatorId: string, activityId: string, requestUserId: string) {
    const activity = await this.findOne(activityId);
    if (activity.creatorId !== creatorId)
      throw new ForbiddenException('Only creator can reject requests');

    await this.prisma.activityParticipant.update({
      where: { activityId_userId: { activityId, userId: requestUserId } },
      data: { status: ParticipantStatus.REJECTED },
    });
    return { message: 'Request rejected' };
  }

  async invite(creatorId: string, activityId: string, invitedUserId: string) {
    const activity = await this.findOne(activityId);
    if (activity.creatorId !== creatorId) throw new ForbiddenException('Only creator can invite');

    return this.prisma.activityParticipant.upsert({
      where: { activityId_userId: { activityId, userId: invitedUserId } },
      create: {
        activityId,
        userId: invitedUserId,
        status: ParticipantStatus.INVITED,
        invitedBy: creatorId,
      },
      update: { status: ParticipantStatus.INVITED, invitedBy: creatorId },
    });
  }

  async getParticipants(activityId: string) {
    return this.prisma.activityParticipant.findMany({
      where: { activityId, status: { in: [ParticipantStatus.JOINED, ParticipantStatus.ACCEPTED] } },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
    });
  }

  async findNearby(lat: number, lng: number, radiusKm: number, _userId: string) {
    const radiusMeters = radiusKm * 1000;

    interface NearbyActivityRow {
      id: string;
      title: string;
      status: string;
      scheduled_at: Date;
      city: string;
      distance_m: number;
    }

    const rows = await this.prisma.$queryRawUnsafe<NearbyActivityRow[]>(
      `SELECT a.id, a.title, a.status, a.scheduled_at, a.city,
              ST_Distance(a.coordinates::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
       FROM activities a
       WHERE a.deleted_at IS NULL
         AND a.status = 'ACTIVE'
         AND a.is_private = false
         AND a.coordinates IS NOT NULL
         AND ST_DWithin(a.coordinates::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)
       ORDER BY distance_m ASC
       LIMIT 50`,
      lng,
      lat,
      radiusMeters,
    );

    return rows.map((r) => ({ ...r, distanceKm: r.distance_m / 1000 }));
  }

  async markExpired(): Promise<number> {
    const result = await this.prisma.activity.updateMany({
      where: {
        status: ActivityStatus.ACTIVE,
        expiresAt: { lt: new Date() },
      },
      data: { status: ActivityStatus.EXPIRED },
    });
    return result.count;
  }

  // ─── Chat Access ─────────────────────────────────────────────────────────

  /**
   * Returns the group conversation for an activity. Delegates auth check
   * (must be an active participant) to ChatService.
   */
  async getActivityChat(userId: string, activityId: string) {
    return this.chat.getActivityGroupConversation(userId, activityId);
  }

  // ─── Internal Helpers ────────────────────────────────────────────────────

  /**
   * Looks up the group conversation for an activity and either adds or removes
   * a user from it. Non-fatal — errors are logged but not re-thrown, so the
   * primary activity operation still succeeds if chat is temporarily unavailable.
   */
  private async syncGroupConvMembership(
    activityId: string,
    userId: string,
    action: 'add' | 'remove',
  ): Promise<void> {
    try {
      const conv = await this.prisma.conversation.findUnique({
        where: { activityId },
        select: { id: true },
      });
      if (!conv) {
        this.logger.warn(`No group conversation found for activity ${activityId} during ${action}`);
        return;
      }
      if (action === 'add') {
        await this.chat.addMemberToConversation(conv.id, userId);
      } else {
        await this.chat.removeMemberFromConversation(conv.id, userId);
      }
    } catch (err) {
      this.logger.error(
        `Failed to ${action} user ${userId} in group conv for activity ${activityId}: ${(err as Error).message}`,
      );
    }
  }
}
