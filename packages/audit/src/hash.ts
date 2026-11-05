import { createHash } from 'node:crypto';

/** Deterministische JSON-Serialisierung (sortierte Schlüssel), unabhängig von jsonb-Reihenfolge. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export interface HashableAuditEntry {
  tenantId: string;
  actorType: string;
  actorId: string;
  action: string;
  resource: string;
  resourceId: string | null;
  outcome: string;
  metadata: unknown;
  requestId: string | null;
  ipHash: string | null;
  createdAt: Date;
}

export function computeAuditHash(prevHash: string | null, e: HashableAuditEntry): string {
  const payload = canonicalJson([
    prevHash,
    e.tenantId,
    e.actorType,
    e.actorId,
    e.action,
    e.resource,
    e.resourceId,
    e.outcome,
    e.metadata,
    e.requestId,
    e.ipHash,
    e.createdAt.toISOString(),
  ]);
  return createHash('sha256').update(payload).digest('hex');
}

const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie/i;

/** Entfernt offensichtlich sensible Felder aus Metadaten (Defense in Depth). */
export function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEY.test(k)) continue;
    out[k] =
      v !== null && typeof v === 'object' && !Array.isArray(v)
        ? sanitizeMetadata(v as Record<string, unknown>)
        : v;
  }
  return out;
}
