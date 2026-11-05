/**
 * Preise in USD pro 1 Mio. Tokens (Anthropic-Listenpreise, Stand 2026-10).
 * Interne Kostenerfassung dient Budgets und Transparenz. Maßgeblich für die Abrechnung
 * bleibt die Anthropic-Konsole.
 */
export interface ModelPricing {
  label: string;
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-5-5': {
    label: 'Claude Opus 5.5',
    inputPerMTok: 4,
    outputPerMTok: 20,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 5,
  },
  'claude-sonnet-5-5': {
    label: 'Claude Sonnet 5.5',
    inputPerMTok: 2,
    outputPerMTok: 10,
    cacheReadPerMTok: 0.2,
    cacheWritePerMTok: 2.5,
  },
  // Haiku: Preis bis 100K Eingabe-Tokens; Cache-Preise als 10 % / 125 % der Eingabe angesetzt.
  'claude-haiku-5-5': {
    label: 'Claude Haiku 5.5',
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    cacheReadPerMTok: 0.01,
    cacheWritePerMTok: 0.125,
  },
};

export const DEFAULT_MODEL = 'claude-opus-5-5';

/** Konservativ: Unbekannte Modelle (z. B. nach Fallback) werden zum höchsten Satz bepreist. */
const MOST_EXPENSIVE: ModelPricing = Object.values(MODEL_PRICING).reduce((a, b) =>
  b.outputPerMTok > a.outputPerMTok ? b : a,
);

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Kosten in Mikro-Cent (1e-8 USD) als Ganzzahl.
 * USD pro MTok × 100 (Cent) × 1e6 (Mikro) / 1e6 (Tokens) = Preis × 100 Mikro-Cent pro Token.
 */
export function costMicroCents(model: string, usage: TokenUsage): bigint {
  const p = MODEL_PRICING[model] ?? MOST_EXPENSIVE;
  const micro = (tokens: number | null | undefined, perMTok: number) =>
    BigInt(Math.round((tokens ?? 0) * perMTok * 100));
  return (
    micro(usage.input_tokens, p.inputPerMTok) +
    micro(usage.output_tokens, p.outputPerMTok) +
    micro(usage.cache_read_input_tokens, p.cacheReadPerMTok) +
    micro(usage.cache_creation_input_tokens, p.cacheWritePerMTok)
  );
}

export function microCentsToCents(v: bigint): number {
  return Number(v) / 1e6;
}

/** Erlaubte Modelle: ONYX_AGENT_MODELS (kommagetrennt) ∩ bekannte Preisliste. */
export function allowedModels(): string[] {
  const configured = (process.env.ONYX_AGENT_MODELS ?? Object.keys(MODEL_PRICING).join(','))
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return configured.filter((m) => m in MODEL_PRICING);
}
