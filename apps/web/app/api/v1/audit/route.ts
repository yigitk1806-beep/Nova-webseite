import { z } from 'zod';
import { ValidationError } from '@onyx/core';
import { queryAuditLog } from '@onyx/tenancy';
import { apiRoute } from '@/lib/api';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  action: z.string().max(64).optional(),
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET = apiRoute(
  'audit:read',
  { action: 'api.audit.list', resource: 'AuditLog' },
  async (access, req) => {
    const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) throw new ValidationError('Ungültige Abfrageparameter.');
    const q = parsed.data;
    const { items, nextCursor } = await queryAuditLog(access, {
      ...(q.action ? { action: q.action } : {}),
      ...(q.cursor ? { cursor: BigInt(q.cursor) } : {}),
      limit: q.limit,
    });
    return {
      items: items.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        actor: { type: e.actorType, id: e.actorId },
        action: e.action,
        resource: e.resource,
        resourceId: e.resourceId,
        outcome: e.outcome,
        metadata: e.metadata,
        hash: e.hash,
      })),
      nextCursor,
    };
  },
);
