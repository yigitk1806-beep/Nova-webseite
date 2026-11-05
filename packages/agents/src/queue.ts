/** Gemeinsame Queue-Konstanten für Web (Producer) und Worker (Consumer). */
export const AGENT_QUEUE = 'onyx-agents';
export const AGENT_RUN_JOB = 'agent.run';

export interface AgentRunJobData {
  runId: string;
  tenantId: string;
}

/** Redis-Verbindungsoptionen aus einer URL (BullMQ-kompatibel). */
export function redisConnectionFromUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
