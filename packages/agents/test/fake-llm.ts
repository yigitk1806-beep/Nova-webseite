import type { LlmClient, LlmMessage, LlmParams } from '../src/llm.ts';

type Block =
  { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

export interface ScriptedTurn {
  content: Block[];
  stop_reason: string;
  stop_details?: { type: 'refusal'; category: string | null; explanation: string | null };
  usage?: { input_tokens: number; output_tokens: number };
  model?: string;
}

/** Skriptgesteuerter LLM-Client für Tests. Zeichnet alle Anfragen auf. */
export class FakeLlm implements LlmClient {
  readonly requests: LlmParams[] = [];
  constructor(private readonly turns: ScriptedTurn[]) {}

  async create(params: LlmParams): Promise<LlmMessage> {
    // Tiefe Kopie, da die Runtime das messages-Array weiterverwendet.
    this.requests.push(structuredClone(params));
    const turn = this.turns.shift();
    if (!turn) throw new Error('FakeLlm: keine weiteren Antworten im Skript');
    return {
      id: `msg_${this.requests.length}`,
      type: 'message',
      role: 'assistant',
      model: turn.model ?? params.model,
      content: turn.content,
      stop_reason: turn.stop_reason,
      stop_details: turn.stop_details ?? null,
      stop_sequence: null,
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        ...turn.usage,
      },
    } as unknown as LlmMessage;
  }
}

export const toolUse = (id: string, name: string, input: unknown = {}): Block => ({
  type: 'tool_use',
  id,
  name,
  input,
});
export const text = (t: string): Block => ({ type: 'text', text: t });
