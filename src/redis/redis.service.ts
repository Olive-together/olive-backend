import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const password = this.config.get<string>('redis.password');

    this.client = new Redis({
      host:     this.config.get<string>('redis.host') ?? 'localhost',
      port:     this.config.get<number>('redis.port') ?? 6379,
      // Only send password if it's actually set — avoids auth errors on no-auth Redis
      password: password && password.trim() !== '' ? password : undefined,
      db:       this.config.get<number>('redis.db') ?? 0,

      // ── Connection resilience ──────────────────────────────────────────────
      lazyConnect:        true,
      // Send TCP keep-alive every 10s to prevent idle-connection drops
      keepAlive:          10000,
      // Don't pile up commands while reconnecting — fail fast instead
      enableOfflineQueue: false,
      // Reconnect when the server resets the connection (ECONNRESET)
      reconnectOnError: (err) => {
        const resetErrors = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
        return resetErrors.some((code) => err.message.includes(code));
      },
      // Exponential back-off: 50ms, 100ms, 200ms … capped at 5s
      retryStrategy: (times) => {
        if (times > 20) {
          this.logger.error(`Redis: giving up after ${times} reconnect attempts`);
          return null; // stop retrying — but DON'T throw (process stays alive)
        }
        const delay = Math.min(50 * 2 ** times, 5000);
        this.logger.warn(`Redis: reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
    });

    this.client.on('connect',      () => this.logger.log('Connected to Redis'));
    this.client.on('ready',        () => this.logger.log('Redis ready'));
    this.client.on('reconnecting', () => this.logger.warn('Redis reconnecting…'));
    this.client.on('close',        () => this.logger.warn('Redis connection closed'));
    // Log the error but NEVER re-throw — keeps the NestJS process alive
    this.client.on('error', (err: Error) =>
      this.logger.error(`Redis error: ${err.message}`),
    );

    void this.client.connect().catch((err: Error) => {
      this.logger.error(`Redis initial connect failed: ${err.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
    this.logger.log('Disconnected from Redis');
  }

  getClient(): Redis {
    return this.client;
  }

  // ── Safe wrappers — return null/undefined instead of throwing ────────────

  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      this.logger.warn(`Redis op failed (${err?.message ?? err}) — using fallback`);
      return fallback;
    }
  }

  // ── Convenience Methods ──────────────────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.safe(() => this.client.get(key), null);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.safe(async () => {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    }, undefined);
  }

  async del(...keys: string[]): Promise<void> {
    await this.safe(() => this.client.del(...keys), 0);
  }

  async exists(...keys: string[]): Promise<number> {
    return this.safe(() => this.client.exists(...keys), 0);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.safe(() => this.client.expire(key, ttlSeconds), 0);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.safe(() => this.client.hset(key, field, value), 0);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.safe(() => this.client.hget(key, field), null);
  }

  async hdel(key: string, ...fields: string[]): Promise<void> {
    await this.safe(() => this.client.hdel(key, ...fields), 0);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.safe(() => this.client.hgetall(key), {});
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    await this.safe(() => this.client.sadd(key, ...members), 0);
  }

  async srem(key: string, ...members: string[]): Promise<void> {
    await this.safe(() => this.client.srem(key, ...members), 0);
  }

  async smembers(key: string): Promise<string[]> {
    return this.safe(() => this.client.smembers(key), []);
  }

  async incr(key: string): Promise<number> {
    return this.safe(() => this.client.incr(key), 0);
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.safe(() => this.client.publish(channel, message), 0);
  }

  /**
   * Create a dedicated subscriber client for pub/sub.
   * The caller is responsible for managing the subscriber lifecycle.
   */
  createSubscriber(): Redis {
    return this.client.duplicate();
  }
}
