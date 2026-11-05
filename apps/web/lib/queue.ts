import 'server-only';
import { Queue } from 'bullmq';
import {
  AGENT_QUEUE,
  AGENT_RUN_JOB,
  redisConnectionFromUrl,
  type AgentRunJobData,
} from '@onyx/agents';
import { serverEnv } from '@onyx/config';
import { OnyxError } from '@onyx/core';

const g = globalThis as unknown as { __onyxAgentQueue?: Queue<AgentRunJobData> };

function agentQueue(): Queue<AgentRunJobData> {
  if (!g.__onyxAgentQueue) {
    const url = serverEnv().REDIS_URL;
    if (!url)
      throw new OnyxError(
        'EXTERNAL_SERVICE',
        'Die Job-Warteschlange (Redis) ist nicht konfiguriert.',
      );
    g.__onyxAgentQueue = new Queue<AgentRunJobData>(AGENT_QUEUE, {
      connection: redisConnectionFromUrl(url),
    });
  }
  return g.__onyxAgentQueue;
}

/** Reiht einen Agent-Lauf ein. Keine automatischen Wiederholungen (Kosten). jobId = runId (idempotent). */
export async function enqueueAgentRun(data: AgentRunJobData) {
  await agentQueue().add(AGENT_RUN_JOB, data, {
    jobId: data.runId,
    attempts: 1,
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
}
