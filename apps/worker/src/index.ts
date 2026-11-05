/**
 * ONYX Worker – führt asynchrone Jobs aus (ab Phase 2: Agent-Runs, ab Phase 3: Workflows).
 * Phase 1: Infrastruktur-Skelett mit Redis-Verbindung, System-Queue und sauberem Shutdown.
 * Es werden bewusst noch keine fachlichen Jobs registriert.
 */
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { z } from 'zod';
import { logger } from '@onyx/core';

const env = z.object({ REDIS_URL: z.url() }).parse(process.env);
const url = new URL(env.REDIS_URL);
const connection: ConnectionOptions = {
  host: url.hostname,
  port: Number(url.port || 6379),
  ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
  ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
  ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
};

export const SYSTEM_QUEUE = 'onyx-system';
const log = logger.child({ component: 'worker' });

const worker = new Worker(
  SYSTEM_QUEUE,
  async (job) => {
    switch (job.name) {
      case 'ping':
        return { pong: true, at: new Date().toISOString() };
      default:
        throw new Error(`Unbekannter Job-Typ: ${job.name}`);
    }
  },
  { connection, concurrency: 5 },
);

worker.on('ready', () => log.info({ queue: SYSTEM_QUEUE }, 'worker ready'));
worker.on('failed', (job, err) =>
  log.error({ jobId: job?.id, name: job?.name, err }, 'job failed'),
);

// Selbsttest beim Start: bestätigt, dass Queue → Worker → Ergebnis funktioniert.
const queue = new Queue(SYSTEM_QUEUE, { connection });
await queue.add('ping', {}, { removeOnComplete: 100, removeOnFail: 1000 });

async function shutdown(signal: string) {
  log.info({ signal }, 'shutting down');
  await worker.close();
  await queue.close();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
worker.on('completed', (job, result) =>
  log.debug({ jobId: job.id, name: job.name, result }, 'job completed'),
);
