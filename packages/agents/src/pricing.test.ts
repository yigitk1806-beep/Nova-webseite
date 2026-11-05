import { afterEach, describe, expect, it } from 'vitest';
import { allowedModels, costMicroCents, microCentsToCents } from './pricing.ts';

describe('costMicroCents', () => {
  it('rechnet Listenpreise exakt (Opus 5.5: $4 / $20 pro MTok)', () => {
    // 1 Mio. Eingabe-Tokens = $4 = 400 Cent
    expect(
      microCentsToCents(
        costMicroCents('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 0 }),
      ),
    ).toBe(400);
    expect(
      microCentsToCents(
        costMicroCents('claude-opus-5-5', { input_tokens: 0, output_tokens: 1_000_000 }),
      ),
    ).toBe(2000);
    expect(
      microCentsToCents(
        costMicroCents('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 }),
      ),
    ).toBe(1200);
  });
  it('bezieht Cache-Lese- und Schreib-Tokens ein', () => {
    const c = costMicroCents('claude-opus-5-5', {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(microCentsToCents(c)).toBe(20 + 500);
  });
  it('bepreist unbekannte Modelle konservativ zum höchsten Satz', () => {
    expect(costMicroCents('unbekannt', { input_tokens: 1000, output_tokens: 1000 })).toBe(
      costMicroCents('claude-opus-5-5', { input_tokens: 1000, output_tokens: 1000 }),
    );
  });
});

describe('allowedModels', () => {
  afterEach(() => {
    delete process.env.ONYX_AGENT_MODELS;
  });
  it('lässt nur bepreiste Modelle zu', () => {
    process.env.ONYX_AGENT_MODELS = 'claude-haiku-5-5, irgendwas';
    expect(allowedModels()).toEqual(['claude-haiku-5-5']);
  });
});
