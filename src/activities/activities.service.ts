import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityStatus, ActivityType, ParticipantStatus, Prisma } from '@prisma/client';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '../common/exceptions/app.exception';
import { ChatService } from '../chat/chat.service';

export interface CreateActivityDto {
  title: string;
  description: string;
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
  ) {}

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateActivityDto) {
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
        tags: dto.tags ?? [],
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
      this.logger.error(`Failed to create group conversation for activity ${activity.id}: ${(err as Error).message}`);
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
      ...(filters.status ? { status: filters.status } : { status: ActivityStatus.ACTIVE }),
      ...(filters.city ? { city: { contains: filters.city, mode: 'insensitive' } } : {}),
      ...(filters.state ? { state: { contains: filters.state, mode: 'insensitive' } } : {}),
    };

    if (filters.timeline === 'upcoming') {
      whereClause.OR = [
        { scheduledAt: { gte: new Date() } },
        { scheduledAt: null }
      ];
    } else if (filters.timeline === 'past') {
      whereClause.scheduledAt = { lt: new Date() };
    }

    const activities = await this.prisma.activity.findMany({
      where: whereClause,
      include: {
        creator: { select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        activityInterests: { include: { interest: true } },
        _count: { select: { participants: { where: { status: ParticipantStatus.JOINED } } } },
      },
      orderBy: filters.timeline === 'upcoming' 
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
      const ids = items.map(a => a.id);
      const coords = await this.prisma.$queryRaw<{ id: string, lat: number, lng: number }[]>`
        SELECT id, ST_Y(coordinates::geometry) as lat, ST_X(coordinates::geometry) as lng 
        FROM activities 
        WHERE id IN (${Prisma.join(ids)}) AND coordinates IS NOT NULL
      `;
      const coordMap = new Map(coords.map(c => [c.id, c]));
      items.forEach((item: any) => {
        const c = coordMap.get(item.id);
        if (c) {
          item.lat = c.lat;
          item.lng = c.lng;
        }
      });
    }

    return { items, nextCursor, hasMore };
  }

  async findOne(id: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, deletedAt: null },
      include: {
        creator: { select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } } },
        activityInterests: { include: { interest: { include: { category: true } } } },
        activitySkills: { include: { skill: { include: { category: true } } } },
        _count: { select: { participants: { where: { status: ParticipantStatus.JOINED } } } },
        // Include group conversation summary (id only — full details via /activities/:id/chat)
        groupConversation: { select: { id: true } },
      },
    });
    if (!activity) throw new NotFoundException('Activity', id);
    return activity;
  }

  async update(userId: string, id: string, dto: Partial<CreateActivityDto>) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Activity', id);
    if (activity.creatorId !== userId) throw new ForbiddenException('Only the creator can update this activity');

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

  async remove(userId: string, id: string) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Activity', id);
    if (activity.creatorId !== userId) throw new ForbiddenException('Only the creator can delete this activity');
    await this.prisma.activity.update({ where: { id }, data: { deletedAt: new Date(), status: ActivityStatus.CANCELLED } });
    // Group conversation history is preserved (option a) — no cascade delete.
    // Members keep read access; the activity status in the conv payload signals it's cancelled.
    return { message: 'Activity cancelled' };
  }

  // ─── Participation ───────────────────────────────────────────────────────

  async join(userId: string, activityId: string) {
    const activity = await this.findOne(activityId);
    if (activity.status !== ActivityStatus.ACTIVE) throw new BadRequestException('Activity is not accepting participants');

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
    if (activity.creatorId !== creatorId) throw new ForbiddenException('Only creator can accept requests');

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
    if (activity.creatorId !== creatorId) throw new ForbiddenException('Only creator can reject requests');

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
      create: { activityId, userId: invitedUserId, status: ParticipantStatus.INVITED, invitedBy: creatorId },
      update: { status: ParticipantStatus.INVITED, invitedBy: creatorId },
    });
  }

  async getParticipants(activityId: string) {
    return this.prisma.activityParticipant.findMany({
      where: { activityId, status: { in: [ParticipantStatus.JOINED, ParticipantStatus.ACCEPTED] } },
      include: {
        user: {
          select: { id: true, username: true, profile: { select: { displayName: true, avatarUrl: true } } },
        },
      },
    });
  }

  async findNearby(lat: number, lng: number, radiusKm: number, userId: string) {
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
