import type { ActorRef } from '@onyx/core';
import { logger } from '@onyx/core';
import { withTenant, type Outcome, type Prisma, type ScopedTx } from '@onyx/db';
import { computeAuditHash, sanitizeMetadata } from './hash.ts';

export { canonicalJson, computeAuditHash, sanitizeMetadata } from './hash.ts';

export interface AuditContext {
  tenantId: string;
  actor: ActorRef;
  requestId: string | null;
  ipHash: string | null;
}

export interface AuditEntry {
  /** Punktnotation, z. B. "member.invited" */
  action: string;
  resource: string;
  resourceId?: string | null;
  outcome?: Outcome;
  /** Keine Klartext-PII, nur Referenzen und fachliche Eckdaten. */
  metadata?: Record<string, unknown>;
}

/**
 * Hängt einen Audit-Eintrag an die Hash-Kette des Tenants an.
 * Muss in derselben Transaktion wie die fachliche Änderung laufen (atomar).
 * Ein Advisory-Lock pro Tenant serialisiert parallele Schreibvorgänge, damit die Kette nicht verzweigt.
 */
export async function appendAudit(
  tx: ScopedTx,
  ctx: AuditContext,
  entry: AuditEntry,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ctx.tenantId}, 0))`;
  const last = await tx.auditLog.findFirst({
    where: { tenantId: ctx.tenantId },
    orderBy: { id: 'desc' },
    select: { hash: true },
  });
  const prevHash = last?.hash ?? null;
  const record = {
    tenantId: ctx.tenantId,
    actorType: ctx.actor.type,
    actorId: ctx.actor.id,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId ?? null,
    outcome: entry.outcome ?? 'SUCCESS',
    // JSON-Roundtrip: exakt das, was jsonb speichert (z. B. Date → String)
    metadata: JSON.parse(
      JSON.stringify(sanitizeMetadata(entry.metadata ?? {})),
    ) as Prisma.InputJsonObject,
    requestId: ctx.requestId,
    ipHash: ctx.ipHash,
    createdAt: new Date(),
  } as const;
  const hash = computeAuditHash(prevHash, record);
  await tx.auditLog.create({ data: { ...record, prevHash, hash } });
}

/**
 * Protokolliert in einer eigenen Transaktion – für Ereignisse, deren fachliche Aktion
 * abgebrochen wird (z. B. DENIED), damit der Eintrag trotzdem bestehen bleibt.
 */
export async function recordAudit(ctx: AuditContext, entry: AuditEntry): Promise<void> {
  try {
    await withTenant(ctx.tenantId, ctx.actor.type === 'USER' ? ctx.actor.id : null, (tx) =>
      appendAudit(tx, ctx, entry),
    );
  } catch (err) {
    // Audit-Ausfall darf nicht verschwiegen werden.
    logger.error({ err, action: entry.action, tenantId: ctx.tenantId }, 'audit write failed');
    throw err;
  }
}

export interface ChainVerification {
  ok: boolean;
  checked: number;
  brokenAtId: string | null;
}

/** Prüft die gesamte Hash-Kette eines Tenants. */
export async function verifyAuditChain(tx: ScopedTx, tenantId: string): Promise<ChainVerification> {
  let prevHash: string | null = null;
  let cursor: bigint | undefined;
  let checked = 0;
  for (;;) {
    const batch = await tx.auditLog.findMany({
      where: { tenantId, ...(cursor !== undefined ? { id: { gt: cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: 500,
    });
    if (batch.length === 0) break;
    for (const row of batch) {
      const expected = computeAuditHash(prevHash, row);
      if (row.prevHash !== prevHash || row.hash !== expected) {
        return { ok: false, checked, brokenAtId: row.id.toString() };
      }
      prevHash = row.hash;
      checked++;
      cursor = row.id;
    }
  }
  return { ok: true, checked, brokenAtId: null };
}

export interface AuditQuery {
  action?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  cursor?: bigint;
  limit?: number;
}

export async function listAudit(tx: ScopedTx, tenantId: string, q: AuditQuery = {}) {
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const rows = await tx.auditLog.findMany({
    where: {
      tenantId,
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lte: q.to } : {}) } }
        : {}),
      ...(q.cursor !== undefined ? { id: { lt: q.cursor } } : {}),
    },
    orderBy: { id: 'desc' },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}
