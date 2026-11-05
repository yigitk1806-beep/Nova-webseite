import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { appendAudit } from '@onyx/audit';
import { ForbiddenError, NotFoundError, UnauthenticatedError, ValidationError } from '@onyx/core';
import { withTenant, withUser } from '@onyx/db';
import {
  canGrant,
  intersectPermissions,
  isApiKeyGrantable,
  PERMISSIONS,
  type Permission,
} from '@onyx/permissions';
import { auditContext, requirePermission, type TenantAccess } from './access.ts';
import { hashToken } from './tokens.ts';

const KEY_PREFIX = 'onyx_sk_';
const LAST_USED_GRANULARITY_MS = 60_000;

export const createApiKeySchema = z.object({
  name: z.string().trim().min(2, 'Mindestens 2 Zeichen').max(60),
  permissions: z
    .array(z.enum(PERMISSIONS))
    .min(1, 'Mindestens eine Berechtigung')
    .refine(
      (ps) => ps.every(isApiKeyGrantable),
      'apikey:manage und tenant:delete sind für Schlüssel nicht erlaubt',
    ),
  expiresInDays: z.coerce.number().int().min(1).max(365).nullable().default(90),
});

function generateApiKey(): { key: string; prefix: string } {
  const prefix = randomBytes(4).toString('hex');
  return {
    key: `${KEY_PREFIX}${prefix}_${randomBytes(32).toString('base64url')}`,
    prefix: `${KEY_PREFIX}${prefix}`,
  };
}

export async function createApiKey(access: TenantAccess, input: unknown) {
  await requirePermission(access, 'apikey:manage', {
    action: 'apikey.created',
    resource: 'ApiKey',
  });
  if (access.actor.type !== 'USER')
    throw new ForbiddenError('API-Schlüssel können nur von Personen erstellt werden.');
  const parsed = createApiKeySchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('Eingabe ungültig.', {
      fields: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join('.') || 'permissions', i.message]),
      ),
    });
  }
  const data = parsed.data;
  if (!canGrant(access.permissions, data.permissions)) {
    throw new ForbiddenError('Ein Schlüssel kann nicht mehr Rechte haben als du selbst.');
  }
  const { key, prefix } = generateApiKey();
  const apiKey = await withTenant(access.tenantId, access.userId, async (tx) => {
    const created = await tx.apiKey.create({
      data: {
        tenantId: access.tenantId,
        name: data.name,
        prefix,
        hash: hashToken(key),
        permissions: data.permissions,
        createdById: access.actor.id,
        expiresAt: data.expiresInDays
          ? new Date(Date.now() + data.expiresInDays * 86_400_000)
          : null,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        expiresAt: true,
        createdAt: true,
      },
    });
    await appendAudit(tx, auditContext(access), {
      action: 'apikey.created',
      resource: 'ApiKey',
      resourceId: created.id,
      metadata: {
        prefix,
        permissions: data.permissions,
        expiresAt: created.expiresAt?.toISOString() ?? null,
      },
    });
    return created;
  });
  // Der Klartext-Schlüssel wird genau einmal zurückgegeben und nie gespeichert.
  return { apiKey, key };
}

export async function listApiKeys(access: TenantAccess) {
  await requirePermission(access, 'apikey:manage', { action: 'apikey.listed', resource: 'ApiKey' });
  return withTenant(access.tenantId, access.userId, (tx) =>
    tx.apiKey.findMany({
      where: { tenantId: access.tenantId, revokedAt: null },
      select: {
        id: true,
        name: true,
        prefix: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        createdAt: true,
        createdById: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  );
}

export async function revokeApiKey(access: TenantAccess, apiKeyId: string) {
  await requirePermission(access, 'apikey:manage', {
    action: 'apikey.revoked',
    resource: 'ApiKey',
    resourceId: apiKeyId,
  });
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const res = await tx.apiKey.updateMany({
      where: { id: apiKeyId, tenantId: access.tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundError('Schlüssel nicht gefunden.');
    await appendAudit(tx, auditContext(access), {
      action: 'apikey.revoked',
      resource: 'ApiKey',
      resourceId: apiKeyId,
    });
  });
}

interface KeyRow {
  id: string;
  tenantId: string;
  createdById: string;
  permissions: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/**
 * Authentifiziert einen API-Schlüssel (Bearer-Token).
 * Effektive Rechte = Schnittmenge aus Schlüssel-Rechten und den *aktuellen* Rechten des Erstellers.
 * Verliert der Ersteller Rechte oder die Mitgliedschaft, wirkt das sofort auf den Schlüssel.
 */
export async function authenticateApiKey(
  rawKey: string,
  meta: { requestId: string | null; ipHash: string | null },
): Promise<TenantAccess> {
  if (!rawKey.startsWith(KEY_PREFIX) || rawKey.length > 200)
    throw new UnauthenticatedError('Ungültiger API-Schlüssel.');
  const rows = await withUser(
    '',
    (tx) => tx.$queryRaw<KeyRow[]>`SELECT * FROM onyx_api_key_lookup(${hashToken(rawKey)})`,
  );
  const key = rows[0];
  const now = new Date();
  if (!key || key.revokedAt || (key.expiresAt && key.expiresAt < now)) {
    throw new UnauthenticatedError('Ungültiger API-Schlüssel.');
  }
  return withTenant(key.tenantId, key.createdById, async (tx) => {
    // Sequentiell: Abfragen innerhalb einer Transaktion teilen sich eine Verbindung.
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: key.tenantId },
      select: { slug: true, name: true },
    });
    const creator = await tx.membership.findUnique({
      where: { tenantId_userId: { tenantId: key.tenantId, userId: key.createdById } },
      include: { role: { select: { permissions: true } } },
    });
    const current = await tx.apiKey.findUniqueOrThrow({
      where: { id: key.id },
      select: { lastUsedAt: true },
    });
    if (!creator || creator.status !== 'ACTIVE')
      throw new UnauthenticatedError('Ungültiger API-Schlüssel.');
    if (
      !current.lastUsedAt ||
      now.getTime() - current.lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS
    ) {
      await tx.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: now } });
    }
    const permissions: Permission[] = intersectPermissions(
      key.permissions,
      creator.role.permissions,
    ).filter(isApiKeyGrantable);
    return {
      tenantId: key.tenantId,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      actor: { type: 'API_KEY' as const, id: key.id },
      userId: key.createdById,
      membershipId: null,
      roleId: null,
      roleKey: 'apikey',
      permissions,
      ...meta,
    };
  });
}
