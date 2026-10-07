import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ParticipantStatus, UserStatus } from '@prisma/client';

/**
 * PeopleVisibilityService — single source of truth for activity-based user visibility.
 *
 * Visibility rule:
 *   A can see B  iff  there exists an activity where both A and B participated
 *   (as creator OR active participant).
 *
 * "Participated" means:
 *   - creator (creatorId on Activity)
 *   - participant with status JOINED | ACCEPTED | INVITED
 *
 * Past / completed activities count.
 * Blocks / suspensions / bans always take precedence.
 */

/** Statuses that count as "active participation" in an activity */
const ACTIVE_PARTICIPANT_STATUSES: ParticipantStatus[] = [
  ParticipantStatus.JOINED,
  ParticipantStatus.ACCEPTED,
  ParticipantStatus.INVITED,
];

/** User statuses that should NEVER be visible */
const HIDDEN_STATUSES: UserStatus[] = [
  UserStatus.BANNED,
  UserStatus.SUSPENDED,
  UserStatus.DELETED,
];

@Injectable()
export class PeopleVisibilityService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Core: resolve visible user IDs for a viewer (efficient batched queries)
  // -------------------------------------------------------------------------

  /**
   * Returns the set of userIds that `viewerId` is allowed to see,
   * based purely on shared activity participation.
   * No N+1 queries, no full table scan.
   */
  async getVisibleUserIds(viewerId: string): Promise<string[]> {
    // Step 1: get all activity IDs where viewer participated (as creator or participant)
    const [createdActivities, joinedActivities] = await Promise.all([
      this.prisma.activity.findMany({
        where: { creatorId: viewerId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.activityParticipant.findMany({
        where: {
          userId: viewerId,
          status: { in: ACTIVE_PARTICIPANT_STATUSES },
        },
        select: { activityId: true },
      }),
    ]);

    const activityIds = [
      ...createdActivities.map((a) => a.id),
      ...joinedActivities.map((ap) => ap.activityId),
    ];

    if (activityIds.length === 0) return [];

    // Step 2: get all user IDs who participated in any of those activities
    const [creatorRows, participantRows] = await Promise.all([
      this.prisma.activity.findMany({
        where: { id: { in: activityIds }, deletedAt: null },
        select: { creatorId: true },
      }),
      this.prisma.activityParticipant.findMany({
        where: {
          activityId: { in: activityIds },
          status: { in: ACTIVE_PARTICIPANT_STATUSES },
        },
        select: { userId: true },
      }),
    ]);

    const candidateIds = new Set<string>([
      ...creatorRows.map((r) => r.creatorId),
      ...participantRows.map((r) => r.userId),
    ]);

    // Remove self
    candidateIds.delete(viewerId);

    if (candidateIds.size === 0) return [];

    const candidateArr = [...candidateIds];

    // Step 3: filter out hidden / blocked users
    const [blockedRows, hiddenUsers] = await Promise.all([
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: viewerId, blockedUserId: { in: candidateArr } },
            { blockedUserId: viewerId, blockerId: { in: candidateArr } },
          ],
        },
        select: { blockerId: true, blockedUserId: true },
      }),
      this.prisma.user.findMany({
        where: {
          id: { in: candidateArr },
          OR: [
            { status: { in: HIDDEN_STATUSES } },
            { deletedAt: { not: null } },
          ],
        },
        select: { id: true },
      }),
    ]);

    const blockedIds = new Set<string>(
      blockedRows.flatMap((b) => [b.blockerId, b.blockedUserId]),
    );
    const hiddenIds = new Set<string>(hiddenUsers.map((u) => u.id));

    return candidateArr.filter(
      (id) => !blockedIds.has(id) && !hiddenIds.has(id),
    );
  }

  // -------------------------------------------------------------------------
  // Per-user check (used for profile access guard)
  // -------------------------------------------------------------------------

  /**
   * Returns true if `viewerId` is allowed to see `targetUserId`'s profile.
   * A viewer can always see themselves.
   */
  async canViewUser(viewerId: string, targetUserId: string): Promise<boolean> {
    if (viewerId === targetUserId) return true;
    const visibleIds = await this.getVisibleUserIds(viewerId);
    return visibleIds.includes(targetUserId);
  }

  // -------------------------------------------------------------------------
  // Enrichment: shared activity context between viewer and a target user
  // -------------------------------------------------------------------------

  /**
   * Returns a summary of activities shared between viewer and target.
   */
  async getSharedActivityContext(
    viewerId: string,
    targetUserId: string,
  ): Promise<{
    sharedCount: number;
    sharedActivities: Array<{ id: string; title: string; status: string }>;
  }> {
    const [viewerCreated, viewerJoined] = await Promise.all([
      this.prisma.activity.findMany({
        where: { creatorId: viewerId, deletedAt: null },
        select: { id: true },
      }),
      this.prisma.activityParticipant.findMany({
        where: { userId: viewerId, status: { in: ACTIVE_PARTICIPANT_STATUSES } },
        select: { activityId: true },
      }),
    ]);

    const viewerActivityIds = [
      ...viewerCreated.map((a) => a.id),
      ...viewerJoined.map((ap) => ap.activityId),
    ];

    if (viewerActivityIds.length === 0) {
      return { sharedCount: 0, sharedActivities: [] };
    }

    const [targetCreated, targetJoined] = await Promise.all([
      this.prisma.activity.findMany({
        where: {
          id: { in: viewerActivityIds },
          creatorId: targetUserId,
          deletedAt: null,
        },
        select: { id: true, title: true, status: true },
      }),
      this.prisma.activityParticipant.findMany({
        where: {
          activityId: { in: viewerActivityIds },
          userId: targetUserId,
          status: { in: ACTIVE_PARTICIPANT_STATUSES },
        },
        select: {
          activity: { select: { id: true, title: true, status: true } },
        },
      }),
    ]);

    const seenIds = new Set<string>();
    const sharedActivities: Array<{ id: string; title: string; status: string }> = [];

    for (const a of targetCreated) {
      if (!seenIds.has(a.id)) {
        seenIds.add(a.id);
        sharedActivities.push(a);
      }
    }
    for (const ap of targetJoined) {
      if (!seenIds.has(ap.activity.id)) {
        seenIds.add(ap.activity.id);
        sharedActivities.push(ap.activity);
      }
    }

    return { sharedCount: sharedActivities.length, sharedActivities };
  }

  // -------------------------------------------------------------------------
  // People list with pagination and shared context
  // -------------------------------------------------------------------------

  /**
   * Returns a paginated list of users visible to `viewerId`,
   * enriched with the number of shared activities.
   * All filtering at DB layer — no full table scan.
   */
  async getPeopleWithContext(
    viewerId: string,
    opts: { page?: number; limit?: number; search?: string } = {},
  ): Promise<{
    items: Array<{
      id: string;
      username: string;
      profile: { displayName: string | null; avatarUrl: string | null; city: string | null } | null;
      reputationSummary: { averageScore: number; totalRatings: number } | null;
      sharedActivityCount: number;
      sharedActivities: Array<{ id: string; title: string; status: string }>;
    }>;
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(50, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const visibleIds = await this.getVisibleUserIds(viewerId);

    if (visibleIds.length === 0) {
      return { items: [], total: 0, page, limit, hasMore: false };
    }

    const searchWhere = opts.search
      ? {
          OR: [
            { username: { contains: opts.search, mode: 'insensitive' as const } },
            {
              profile: {
                displayName: { contains: opts.search, mode: 'insensitive' as const },
              },
            },
          ],
        }
      : {};

    const baseWhere = {
      id: { in: visibleIds },
      status: UserStatus.ACTIVE,
      deletedAt: null,
      ...searchWhere,
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: baseWhere,
        select: {
          id: true,
          username: true,
          profile: {
            select: { displayName: true, avatarUrl: true, city: true },
          },
          reputationSummary: {
            select: { averageScore: true, totalRatings: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: baseWhere }),
    ]);

    // Enrich each user with shared activity context (batched per user)
    const enriched = await Promise.all(
      users.map(async (u) => {
        const ctx = await this.getSharedActivityContext(viewerId, u.id);
        return {
          ...u,
          sharedActivityCount: ctx.sharedCount,
          sharedActivities: ctx.sharedActivities.slice(0, 3),
        };
      }),
    );

    return { items: enriched, total, page, limit, hasMore: skip + limit < total };
  }
}
