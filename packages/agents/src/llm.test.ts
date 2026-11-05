import { describe, expect, it } from 'vitest';
import { supportsServerFallback } from './llm.ts';

describe('supportsServerFallback', () => {
  it('nur für Modelle mit server-seitigem Fallback', () => {
    expect(supportsServerFallback('claude-opus-5-5')).toBe(true);
    expect(supportsServerFallback('claude-sonnet-5-5')).toBe(true);
    expect(supportsServerFallback('claude-haiku-5-5')).toBe(false);
  });
});
