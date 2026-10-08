import type { ThrottlerStorage } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';

// Shared counters keep enforcement consistent across API instances and restarts.
export class PostgresThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly db: PrismaService) {}
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const id = createHash('sha256')
      .update(`${throttlerName}:${key}`)
      .digest('hex');
    const now = new Date();
    const expires = new Date(now.getTime() + ttl);
    const blocked = new Date(now.getTime() + blockDuration);
    const [row] = await this.db.$queryRaw<
      { hits: number; expiresAt: Date; blockedUntil: Date | null }[]
    >`
      INSERT INTO rate_limit_buckets (key,hits,expires_at,blocked_until) VALUES (${id},1,${expires},NULL)
      ON CONFLICT(key) DO UPDATE SET
        hits=CASE WHEN rate_limit_buckets.expires_at<=${now} THEN 1 ELSE LEAST(rate_limit_buckets.hits+1,${limit + 1}) END,
        blocked_until=CASE WHEN rate_limit_buckets.blocked_until>${now} THEN rate_limit_buckets.blocked_until
          WHEN rate_limit_buckets.expires_at<=${now} THEN NULL
          WHEN rate_limit_buckets.hits+1>${limit} THEN ${blocked} ELSE NULL END,
        expires_at=CASE WHEN rate_limit_buckets.expires_at<=${now} THEN ${expires} ELSE rate_limit_buckets.expires_at END
      RETURNING hits,expires_at AS "expiresAt",blocked_until AS "blockedUntil"`;
    if (!row) throw new Error('Unable to enforce rate limit');
    return {
      totalHits: row.hits,
      timeToExpire: Math.max(
        0,
        Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000),
      ),
      isBlocked: !!row.blockedUntil && row.blockedUntil > now,
      timeToBlockExpire: Math.max(
        0,
        Math.ceil(
          ((row.blockedUntil?.getTime() ?? now.getTime()) - now.getTime()) /
            1000,
        ),
      ),
    };
  }
}
