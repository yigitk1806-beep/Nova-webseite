import 'server-only';
import { Redis } from 'ioredis';
import { serverEnv } from '@onyx/config';
import { logger } from '@onyx/core';

const g = globalThis as unknown as { __onyxRedis?: Redis | null };

/** Gemeinsame Redis-Verbindung (null in Entwicklung ohne REDIS_URL). */
export function getRedis(): Redis | null {
  if (g.__onyxRedis === undefined) {
    const url = serverEnv().REDIS_URL;
    g.__onyxRedis = url
      ? new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: true, lazyConnect: false })
      : null;
    g.__onyxRedis?.on('error', (err) => logger.error({ err }, 'redis error'));
  }
  return g.__onyxRedis;
}
