import Anthropic from '@anthropic-ai/sdk';

export type LlmParams = Omit<
  Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
  'betas' | 'fallbacks'
>;
export type LlmMessage = Anthropic.Beta.Messages.BetaMessage;

/** Austauschbare Schnittstelle (Tests verwenden einen skriptgesteuerten Client). */
export interface LlmClient {
  create(params: LlmParams): Promise<LlmMessage>;
}

export function isLlmConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
}

/**
 * Einziger Ort mit direktem Anthropic-Zugriff.
 * - Schlüssel ausschließlich aus der Umgebung (ANTHROPIC_API_KEY)
 * - Server-seitiger Fallback bei Ablehnung durch Sicherheitsklassifikatoren ("default")
 * - Retries für 429/5xx übernimmt das SDK (maxRetries)
 */
export function createAnthropicLlm(): LlmClient {
  const client = new Anthropic({ maxRetries: 2, timeout: 180_000 });
  return {
    create: (params) =>
      client.beta.messages.create({
        ...params,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      }),
  };
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY ist nicht konfiguriert');
  }
}

/** Platzhalter, wenn kein Schlüssel hinterlegt ist: jeder Aufruf schlägt ehrlich fehl. */
export const unconfiguredLlm: LlmClient = {
  create: () => Promise.reject(new LlmNotConfiguredError()),
};

/** Öffentliche, nicht-technische Fehlermeldung für LLM-Fehler. */
export function describeLlmError(err: unknown): string {
  if (err instanceof LlmNotConfiguredError)
    return 'Kein Anthropic-API-Schlüssel konfiguriert (ANTHROPIC_API_KEY).';
  if (err instanceof Anthropic.AuthenticationError)
    return 'Der Anthropic-API-Schlüssel ist ungültig.';
  if (err instanceof Anthropic.PermissionDeniedError)
    return 'Der Anthropic-API-Schlüssel hat keine Berechtigung für dieses Modell.';
  if (err instanceof Anthropic.RateLimitError)
    return 'Das Anthropic-Ratenlimit ist erreicht. Bitte später erneut versuchen.';
  if (err instanceof Anthropic.BadRequestError) return 'Die Anfrage an das Modell war ungültig.';
  if (err instanceof Anthropic.APIConnectionError) return 'Keine Verbindung zur Anthropic-API.';
  if (err instanceof Anthropic.APIError)
    return `Anthropic-API-Fehler (${err.status ?? 'unbekannt'}).`;
  return 'Interner Fehler bei der Modellanfrage.';
}
