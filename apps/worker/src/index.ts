/**
 * ONYX Worker – führt asynchrone Jobs aus.
 * - onyx-system: Infrastruktur (Selbsttest)
 * - onyx-agents: Agent-Läufe (Phase 2)
 */
import { Queue, Worker } from 'bullmq';
import { z } from 'zod';
import {
  AGENT_QUEUE,
  AGENT_RUN_JOB,
  createAnthropicLlm,
  executeRun,
  isLlmConfigured,
  redisConnectionFromUrl,
  unconfiguredLlm,
  type AgentRunJobData,
} from '@onyx/agents';
import { logger } from '@onyx/core';

const env = z.object({ REDIS_URL: z.url(), DATABASE_URL: z.url() }).parse(process.env);
const connection = redisConnectionFromUrl(env.REDIS_URL);
const log = logger.child({ component: 'worker' });

export const SYSTEM_QUEUE = 'onyx-system';

const llm = isLlmConfigured() ? createAnthropicLlm() : unconfiguredLlm;
if (!isLlmConfigured())
  log.warn('ANTHROPIC_API_KEY fehlt – Agent-Läufe werden mit Hinweis abgelehnt');

const systemWorker = new Worker(
  SYSTEM_QUEUE,
  async (job) => {
    if (job.name === 'ping') return { pong: true, at: new Date().toISOString() };
    throw new Error(`Unbekannter Job-Typ: ${job.name}`);
  },
  { connection, concurrency: 5 },
);

const jobSchema = z.object({ runId: z.string().min(1), tenantId: z.string().min(1) });

const agentWorker = new Worker<AgentRunJobData>(
  AGENT_QUEUE,
  async (job) => {
    if (job.name !== AGENT_RUN_JOB) throw new Error(`Unbekannter Job-Typ: ${job.name}`);
    const { runId, tenantId } = jobSchema.parse(job.data);
    const outcome = await executeRun(runId, tenantId, llm);
    log.info({ runId, tenantId, ...outcome }, 'agent run finished');
    return outcome;
  },
  // Agent-Läufe verursachen Kosten: keine automatischen Wiederholungen (attempts beim Einreihen = 1).
  { connection, concurrency: 4 },
);

for (const w of [systemWorker, agentWorker]) {
  w.on('ready', () => log.info({ queue: w.name }, 'worker ready'));
  w.on('failed', (job, err) => log.error({ queue: w.name, jobId: job?.id, err }, 'job failed'));
}

const systemQueue = new Queue(SYSTEM_QUEUE, { connection });
await systemQueue.add('ping', {}, { removeOnComplete: 100, removeOnFail: 1000 });

async function shutdown(signal: string) {
  log.info({ signal }, 'shutting down');
  await Promise.all([systemWorker.close(), agentWorker.close(), systemQueue.close()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
