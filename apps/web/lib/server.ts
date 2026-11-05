import 'server-only';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { serverEnv } from '@onyx/config';
import { hashIp, isOnyxError, logger, newRequestId, NotFoundError } from '@onyx/core';
import { resolveTenantAccess, type TenantAccess } from '@onyx/tenancy';
import { getAuth } from './auth';

export interface RequestMeta {
  requestId: string;
  ipHash: string | null;
}

export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip');
  return {
    requestId: h.get('x-request-id') ?? newRequestId(),
    ipHash: hashIp(ip, serverEnv().BETTER_AUTH_SECRET),
  };
}

export const getSession = cache(async () => {
  // headers() zuerst: markiert die Route als dynamisch, bevor Laufzeit-Konfiguration geladen wird.
  const h = await headers();
  return getAuth().api.getSession({ headers: h });
});

/** Angemeldeter Nutzer oder Weiterleitung zum Login. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect('/login');
  return session.user;
}

/**
 * Serverseitige Prüfung der Mitgliedschaft. Nicht-Mitglieder erhalten 404,
 * damit die Existenz fremder Unternehmen nicht offengelegt wird.
 */
export const requireTenantAccess = cache(async (slug: string): Promise<TenantAccess> => {
  const user = await requireUser();
  try {
    return await resolveTenantAccess(user.id, slug, await getRequestMeta());
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
});

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fields?: Record<string, string> };

/**
 * Einheitliche Fehlerbehandlung für Server Actions:
 * bekannte Fehler → öffentliche Meldung, unbekannte → generische Meldung + Log mit requestId.
 */
export async function runAction<T>(
  fn: () => Promise<T>,
  message?: string,
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return message ? { ok: true, data, message } : { ok: true, data };
  } catch (e) {
    // redirect()/notFound() von Next.js weiterreichen
    if (
      e &&
      typeof e === 'object' &&
      'digest' in e &&
      typeof e.digest === 'string' &&
      e.digest.startsWith('NEXT_')
    )
      throw e;
    if (isOnyxError(e)) {
      if (e.code === 'INTERNAL') logger.error({ err: e }, 'action failed');
      const fields = e.details?.fields as Record<string, string> | undefined;
      return fields
        ? { ok: false, error: e.publicMessage, fields }
        : { ok: false, error: e.publicMessage };
    }
    const requestId = newRequestId();
    logger.error({ err: e, requestId }, 'unexpected action error');
    return { ok: false, error: `Unerwarteter Fehler. Referenz: ${requestId}` };
  }
}
