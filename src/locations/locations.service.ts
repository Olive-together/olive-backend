import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async updateMyLocation(
    userId: string,
    dto: { latitude: number; longitude: number; altitude?: number; accuracy?: number; city?: string; country?: string },
  ) {
    // Set PostGIS point
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO user_locations (id, user_id, coordinates, altitude, accuracy, city, country, updated_at)
       VALUES (gen_random_uuid(), $1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET coordinates = ST_SetSRID(ST_MakePoint($2, $3), 4326),
           altitude = $4, accuracy = $5, city = $6, country = $7, updated_at = NOW()`,
      userId,
      dto.longitude,
      dto.latitude,
      dto.altitude ?? null,
      dto.accuracy ?? null,
      dto.city ?? null,
      dto.country ?? null,
    );

    return { message: 'Location updated' };
  }

  async findNearbyUsers(
    userId: string,
    lat: number,
    lng: number,
    radiusKm: number = 20,
    limit: number = 20,
  ) {
    const radiusMeters = radiusKm * 1000;

    interface NearbyUserRow {
      id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      distance_m: number;
    }

    const rows = await this.prisma.$queryRawUnsafe<NearbyUserRow[]>(
      `SELECT u.id, u.username, p.display_name, p.avatar_url,
              ST_Distance(ul.coordinates::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance_m
       FROM users u
       JOIN user_locations ul ON ul.user_id = u.id
       JOIN profiles p ON p.user_id = u.id
       WHERE u.id != $3
         AND u.status = 'ACTIVE'
         AND u.deleted_at IS NULL
         AND p.discovery_enabled = true
         AND p.location_privacy != 'PRIVATE'
         AND ST_DWithin(ul.coordinates::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $4)
         AND u.id NOT IN (
           SELECT blocked_user_id FROM blocks WHERE blocker_id = $3
           UNION
           SELECT blocker_id FROM blocks WHERE blocked_user_id = $3
         )
       ORDER BY distance_m ASC
       LIMIT $5`,
      lng,
      lat,
      userId,
      radiusMeters,
      limit,
    );

    return rows.map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      distanceKm: +(r.distance_m / 1000).toFixed(2),
    }));
  }
}
