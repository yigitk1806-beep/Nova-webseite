import 'server-only';
import { logger } from '@onyx/core';
import { getRedis } from './redis';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

const memory = new Map<string, { count: number; resetAt: number }>();

/**
 * Fixed-Window-Limiter. Mit Redis instanzübergreifend, ohne Redis (nur Entwicklung) pro Prozess.
 * Bei Redis-Ausfall wird fail-closed geantwortet: lieber ablehnen als ungebremst durchlassen.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const bucket = `rl:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  if (redis) {
    try {
      const [[, count], [, ttl]] = (await redis.multi().incr(bucket).ttl(bucket).exec()) as [
        [null, number],
        [null, number],
      ];
      if (ttl < 0) await redis.expire(bucket, windowSeconds);
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
        resetSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    } catch (err) {
      logger.error({ err }, 'rate limit backend unavailable');
      return { allowed: false, remaining: 0, resetSeconds: windowSeconds };
    }
  }
  const now = Date.now();
  const entry = memory.get(bucket) ?? { count: 0, resetAt: now + windowSeconds * 1000 };
  entry.count++;
  memory.set(bucket, entry);
  if (memory.size > 10_000) for (const [k, v] of memory) if (v.resetAt < now) memory.delete(k);
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}
