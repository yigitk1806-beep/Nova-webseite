import { describe, expect, it } from 'vitest';
import { ForbiddenError, hashIp, isOnyxError, NotFoundError } from './index.ts';

describe('OnyxError', () => {
  it('trennt öffentliche und interne Meldung', () => {
    const e = new ForbiddenError(undefined, 'missing member:invite');
    expect(e.status).toBe(403);
    expect(e.publicMessage).not.toContain('member:invite');
    expect(e.message).toContain('member:invite');
    expect(isOnyxError(e)).toBe(true);
    expect(new NotFoundError().status).toBe(404);
  });
});

describe('hashIp', () => {
  it('speichert keine Klartext-IP', () => {
    const h = hashIp('203.0.113.7', 'salt');
    expect(h).not.toContain('203');
    expect(hashIp(null, 'salt')).toBeNull();
  });
});
