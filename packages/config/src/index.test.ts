import { describe, expect, it } from 'vitest';
import { parseServerEnv } from './index.ts';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  APP_URL: 'http://localhost:3000',
};

describe('parseServerEnv', () => {
  it('akzeptiert gültige Werte', () => {
    expect(parseServerEnv(base).APP_URL).toBe('http://localhost:3000');
  });
  it('lehnt zu kurze Secrets ab', () => {
    expect(() => parseServerEnv({ ...base, BETTER_AUTH_SECRET: 'kurz' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });
  it('verlangt SMTP in Produktion', () => {
    expect(() => parseServerEnv({ ...base, NODE_ENV: 'production' })).toThrow(/SMTP_URL/);
  });
});
