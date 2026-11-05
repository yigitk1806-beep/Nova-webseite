import { describe, expect, it } from 'vitest';
import { canonicalJson, computeAuditHash, sanitizeMetadata } from './hash.ts';

describe('canonicalJson', () => {
  it('ist unabhängig von der Schlüsselreihenfolge', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe('computeAuditHash', () => {
  const entry = {
    tenantId: 't1', actorType: 'USER', actorId: 'u1', action: 'x', resource: 'R', resourceId: null,
    outcome: 'SUCCESS', metadata: { a: 1 }, requestId: null, ipHash: null, createdAt: new Date(0),
  };
  it('ändert sich bei jeder Feldänderung', () => {
    const h = computeAuditHash(null, entry);
    expect(computeAuditHash(null, { ...entry, action: 'y' })).not.toBe(h);
    expect(computeAuditHash('prev', entry)).not.toBe(h);
  });
});

describe('sanitizeMetadata', () => {
  it('entfernt sensible Schlüssel', () => {
    expect(sanitizeMetadata({ roleKey: 'admin', token: 'x', nested: { password: 'p', ok: 1 } })).toEqual({
      roleKey: 'admin',
      nested: { ok: 1 },
    });
  });
});
