import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { SkillsModule } from './skills/skills.module';
import { InterestsModule } from './interests/interests.module';
import { AvailabilityModule } from './availability/availability.module';
import { ActivitiesModule } from './activities/activities.module';
import { LocationsModule } from './locations/locations.module';
import { MatchingModule } from './matching/matching.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { SearchModule } from './search/search.module';
import { ConnectionsModule } from './connections/connections.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';
import { JobsModule } from './jobs/jobs.module';
import { MediaModule } from './media/media.module';
import { RatingsModule } from './ratings/ratings.module';
import { BlocksModule } from './blocks/blocks.module';
import { ReportsModule } from './reports/reports.module';
import { ModerationModule } from './moderation/moderation.module';
import { AdminModule } from './admin/admin.module';
import { AiModule } from './ai/ai.module';
import { PaymentsModule } from './payments/payments.module';
import { ConfigService } from '@nestjs/config';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

@Module({
  imports: [
    // ── Configuration ───────────────────────────────────────────────────────
    ConfigModule,

    // ── Rate Limiting ───────────────────────────────────────────────────────
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('app.throttle.ttlMs') ?? 60000,
          limit: config.get<number>('app.throttle.limit') ?? 100,
        },
      ],
    }),

    // ── Core Infrastructure ─────────────────────────────────────────────────
    PrismaModule,
    RedisModule,
    HealthModule,

    // ── Feature Modules ─────────────────────────────────────────────────────
    AuthModule,
    UsersModule,
    ProfilesModule,
    SkillsModule,
    InterestsModule,
    AvailabilityModule,
    ActivitiesModule,
    LocationsModule,
    MatchingModule,
    RecommendationsModule,
    SearchModule,
    ConnectionsModule,
    ChatModule,
    NotificationsModule,
    JobsModule,
    MediaModule,
    RatingsModule,
    BlocksModule,
    ReportsModule,
    ModerationModule,
    AdminModule,
    AiModule,
    PaymentsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
