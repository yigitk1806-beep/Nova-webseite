import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { serverEnv } from '@onyx/config';
import { hashIp, isOnyxError, logger, newRequestId, UnauthenticatedError } from '@onyx/core';
import type { Permission } from '@onyx/permissions';
import { authenticateApiKey, requirePermission, type TenantAccess } from '@onyx/tenancy';
import { rateLimit } from './rate-limit';

const API_RATE_LIMIT = 120; // Anfragen pro Minute und Schlüssel

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new NextResponse(
    JSON.stringify(body, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
    {
      status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...headers,
      },
    },
  );
}

/**
 * Wrapper für öffentliche API-Endpunkte (/api/v1):
 * Bearer-Auth per API-Schlüssel → Rate Limit → Permission (inkl. DENIED-Audit) → Handler.
 * Fehler werden ohne interne Details mit requestId beantwortet.
 */
export function apiRoute(
  permission: Permission,
  attempted: { action: string; resource: string },
  handler: (access: TenantAccess, req: NextRequest) => Promise<unknown>,
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const requestId = req.headers.get('x-request-id') ?? newRequestId();
    const base = { 'x-request-id': requestId };
    try {
      const auth = req.headers.get('authorization') ?? '';
      const match = /^Bearer\s+(\S+)$/i.exec(auth);
      if (!match?.[1])
        throw new UnauthenticatedError('Authorization: Bearer <API-Schlüssel> fehlt.');
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
      const access = await authenticateApiKey(match[1], {
        requestId,
        ipHash: hashIp(ip, serverEnv().BETTER_AUTH_SECRET),
      });

      const rl = await rateLimit(`api:${access.actor.id}`, API_RATE_LIMIT, 60);
      const rlHeaders = {
        ...base,
        'x-ratelimit-limit': String(API_RATE_LIMIT),
        'x-ratelimit-remaining': String(rl.remaining),
      };
      if (!rl.allowed) {
        return json(
          { error: { code: 'RATE_LIMITED', message: 'Zu viele Anfragen.', requestId } },
          429,
          { ...rlHeaders, 'retry-after': String(rl.resetSeconds) },
        );
      }
      await requirePermission(access, permission, attempted);
      return json({ data: await handler(access, req) }, 200, rlHeaders);
    } catch (e) {
      if (isOnyxError(e)) {
        return json(
          { error: { code: e.code, message: e.publicMessage, requestId } },
          e.status,
          base,
        );
      }
      logger.error({ err: e, requestId }, 'api error');
      return json(
        { error: { code: 'INTERNAL', message: 'Interner Fehler.', requestId } },
        500,
        base,
      );
    }
  };
}
