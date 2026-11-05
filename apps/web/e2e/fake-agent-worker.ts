/**
 * NUR FÜR E2E-TESTS: Agent-Worker mit skriptgesteuertem Modell statt Anthropic-API.
 * Prüft den vollständigen Weg UI → Queue → Runtime → DB → UI ohne echte Modellkosten.
 * Wird ausschließlich von playwright.config.ts gestartet.
 */
import { Worker } from 'bullmq';
import {
  AGENT_QUEUE,
  executeRun,
  redisConnectionFromUrl,
  type AgentRunJobData,
  type LlmClient,
  type LlmMessage,
} from '@onyx/agents';

const scripted: LlmClient = {
  async create(params) {
    const last = params.messages.at(-1);
    const toolResult = Array.isArray(last?.content)
      ? last.content.find((b) => b.type === 'tool_result')
      : undefined;
    const base = {
      id: 'msg_e2e',
      type: 'message',
      role: 'assistant',
      model: params.model,
      stop_sequence: null,
      stop_details: null,
    };
    const usage = {
      input_tokens: 1200,
      output_tokens: 150,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };
    if (!toolResult) {
      return {
        ...base,
        usage,
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'tu_1', name: 'onyx_members_list', input: {} }],
      } as unknown as LlmMessage;
    }
    const raw =
      'content' in toolResult && typeof toolResult.content === 'string' ? toolResult.content : '[]';
    const count = (JSON.parse(raw) as unknown[]).length;
    return {
      ...base,
      usage,
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: `Das Unternehmen hat ${count} Mitglied(er).` }],
    } as unknown as LlmMessage;
  },
};

new Worker<AgentRunJobData>(
  AGENT_QUEUE,
  (job) => executeRun(job.data.runId, job.data.tenantId, scripted),
  {
    connection: redisConnectionFromUrl(process.env.REDIS_URL ?? 'redis://localhost:6379'),
  },
);
// Port für Playwrights Bereitschaftsprüfung
import('node:http').then(({ createServer }) =>
  createServer((_q, s) => s.end('ok')).listen(3199, '127.0.0.1'),
);
