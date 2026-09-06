import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface MatchingConfig {
  interestWeight: number;
  skillWeight: number;
  distanceWeight: number;
  reputationWeight: number;
  profileCompletenessWeight: number;
  maxDistanceKm: number;
}

export interface RankingStrategy {
  score(candidate: CandidateProfile, viewer: ViewerContext): number;
}

export interface CandidateProfile {
  id: string;
  username: string;
  distanceKm: number;
  interestOverlap: number;
  skillOverlap: number;
  averageScore: number;
  completenessScore: number;
}

export interface ViewerContext {
  userId: string;
  interestIds: string[];
  skillIds: string[];
  latitude?: number;
  longitude?: number;
}

@Injectable()
export class DefaultRankingStrategy implements RankingStrategy {
  constructor(private readonly config: MatchingConfig) {}

  score(candidate: CandidateProfile): number {
    const distanceScore =
      Math.max(0, 1 - candidate.distanceKm / this.config.maxDistanceKm) *
      this.config.distanceWeight;
    const interestScore = candidate.interestOverlap * this.config.interestWeight;
    const skillScore = candidate.skillOverlap * this.config.skillWeight;
    const reputationScore = (candidate.averageScore / 5) * this.config.reputationWeight;
    const completenessScore =
      (candidate.completenessScore / 100) * this.config.profileCompletenessWeight;

    return distanceScore + interestScore + skillScore + reputationScore + completenessScore;
  }
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  private readonly defaultConfig: MatchingConfig = {
    interestWeight: 0.35,
    skillWeight: 0.25,
    distanceWeight: 0.2,
    reputationWeight: 0.1,
    profileCompletenessWeight: 0.1,
    maxDistanceKm: 50,
  };

  constructor(private readonly prisma: PrismaService) {}

  async getCandidates(
    userId: string,
    options: {
      latitude?: number;
      longitude?: number;
      radiusKm?: number;
      cursor?: string;
      limit?: number;
    },
  ) {
    const limit = options.limit ?? 20;
    const radiusKm = options.radiusKm ?? this.defaultConfig.maxDistanceKm;

    // Get viewer context
    const [viewerInterests, viewerSkills, viewer] = await Promise.all([
      this.prisma.userInterest.findMany({ where: { userId }, select: { interestId: true } }),
      this.prisma.userSkill.findMany({ where: { userId }, select: { skillId: true } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        include: { location: true, profile: true },
      }),
    ]);

    const viewerInterestIds = viewerInterests.map((i) => i.interestId);
    const viewerSkillIds = viewerSkills.map((s) => s.skillId);

    // Hard filter (SQL): active users, not blocked, not self, with discovery enabled
    const blockedIds = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedUserId: userId }] },
      select: { blockerId: true, blockedUserId: true },
    });
    const blockedUserIds = [
      ...new Set(blockedIds.flatMap((b) => [b.blockerId, b.blockedUserId])),
    ].filter((id) => id !== userId);

    let candidatesQuery = `
      SELECT DISTINCT u.id, u.username,
             p.completeness_score,
             rs.average_score,
             COALESCE(ST_Distance(
               ul.coordinates::geography,
               ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
             ) / 1000.0, 999) AS distance_km
      FROM users u
      JOIN profiles p ON p.user_id = u.id
      LEFT JOIN user_locations ul ON ul.user_id = u.id
      LEFT JOIN reputation_summaries rs ON rs.user_id = u.id
      WHERE u.id != $3
        AND u.status = 'ACTIVE'
        AND u.deleted_at IS NULL
        AND p.discovery_enabled = true
    `;

    const params: unknown[] = [
      options.longitude ?? 0,
      options.latitude ?? 0,
      userId,
    ];
    let paramIdx = 4;

    if (blockedUserIds.length > 0) {
      candidatesQuery += ` AND u.id NOT IN (${blockedUserIds.map((_, i) => `$${paramIdx + i}`).join(',')})`;
      params.push(...blockedUserIds);
      paramIdx += blockedUserIds.length;
    }

    if (options.latitude && options.longitude) {
      candidatesQuery += ` AND (ul.coordinates IS NULL OR ST_DWithin(ul.coordinates::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $${paramIdx}))`;
      params.push(radiusKm * 1000);
      paramIdx++;
    }

    candidatesQuery += ` ORDER BY distance_km ASC LIMIT $${paramIdx}`;
    params.push(limit * 3); // fetch more to score and re-rank

    interface CandidateRow {
      id: string;
      username: string;
      completeness_score: number;
      average_score: number;
      distance_km: number;
    }

    const rawCandidates = await this.prisma.$queryRawUnsafe<CandidateRow[]>(
      candidatesQuery,
      ...params,
    );

    if (rawCandidates.length === 0) return { items: [], nextCursor: undefined, hasMore: false };

    // Load interests/skills for all candidates in bulk
    const candidateIds = rawCandidates.map((c) => c.id);
    const [candidateInterests, candidateSkills] = await Promise.all([
      this.prisma.userInterest.findMany({
        where: { userId: { in: candidateIds } },
        select: { userId: true, interestId: true },
      }),
      this.prisma.userSkill.findMany({
        where: { userId: { in: candidateIds } },
        select: { userId: true, skillId: true },
      }),
    ]);

    const interestsByUser = new Map<string, Set<string>>();
    candidateInterests.forEach((i) => {
      if (!interestsByUser.has(i.userId)) interestsByUser.set(i.userId, new Set());
      interestsByUser.get(i.userId)!.add(i.interestId);
    });

    const skillsByUser = new Map<string, Set<string>>();
    candidateSkills.forEach((s) => {
      if (!skillsByUser.has(s.userId)) skillsByUser.set(s.userId, new Set());
      skillsByUser.get(s.userId)!.add(s.skillId);
    });

    const strategy = new DefaultRankingStrategy(this.defaultConfig);

    const scored = rawCandidates
      .map((c) => {
        const cInterests = interestsByUser.get(c.id) ?? new Set();
        const cSkills = skillsByUser.get(c.id) ?? new Set();
        const interestOverlap =
          viewerInterestIds.length > 0
            ? viewerInterestIds.filter((id) => cInterests.has(id)).length /
              viewerInterestIds.length
            : 0;
        const skillOverlap =
          viewerSkillIds.length > 0
            ? viewerSkillIds.filter((id) => cSkills.has(id)).length / viewerSkillIds.length
            : 0;

        const candidate: CandidateProfile = {
          id: c.id,
          username: c.username,
          distanceKm: c.distance_km,
          interestOverlap,
          skillOverlap,
          averageScore: c.average_score ?? 0,
          completenessScore: c.completeness_score ?? 0,
        };
        return { ...candidate, matchScore: strategy.score(candidate) };
      })
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);

    return { items: scored, hasMore: rawCandidates.length > limit };
  }
}
