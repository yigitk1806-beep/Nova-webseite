import { recordAudit, type AuditContext } from '@onyx/audit';
import { ForbiddenError, NotFoundError, type ActorRef } from '@onyx/core';
import { withTenant, withUser } from '@onyx/db';
import { hasPermission, toPermissions, type Permission } from '@onyx/permissions';

/**
 * Aufgelöster, geprüfter Zugriff auf einen Tenant.
 * actor = wer handelt (Nutzer oder API-Schlüssel), userId = verantwortlicher Mensch
 * (bei API-Schlüsseln der Ersteller).
 */
export interface TenantAccess {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  actor: ActorRef;
  userId: string;
  /** Nur bei Nutzerzugriff gesetzt. */
  membershipId: string | null;
  roleId: string | null;
  roleKey: string;
  permissions: Permission[];
  requestId: string | null;
  ipHash: string | null;
}

export function auditContext(access: TenantAccess): AuditContext {
  return {
    tenantId: access.tenantId,
    actor: access.actor,
    requestId: access.requestId,
    ipHash: access.ipHash,
  };
}

/**
 * Löst Mitgliedschaft und Rechte auf. Wirft NotFound (nicht Forbidden), wenn der Nutzer
 * kein aktives Mitglied ist – so wird die Existenz fremder Tenants nicht offengelegt.
 */
export async function resolveTenantAccess(
  userId: string,
  tenantSlug: string,
  meta: { requestId: string | null; ipHash: string | null } = { requestId: null, ipHash: null },
): Promise<TenantAccess> {
  const tenant = await withUser(userId, (tx) =>
    tx.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, slug: true, name: true },
    }),
  );
  if (!tenant) throw new NotFoundError('Unternehmen nicht gefunden.');

  const membership = await withTenant(tenant.id, userId, (tx) =>
    tx.membership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId } },
      include: { role: { select: { id: true, key: true, permissions: true } } },
    }),
  );
  if (!membership || membership.status !== 'ACTIVE')
    throw new NotFoundError('Unternehmen nicht gefunden.');

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    actor: { type: 'USER', id: userId },
    userId,
    membershipId: membership.id,
    roleId: membership.role.id,
    roleKey: membership.role.key,
    permissions: toPermissions(membership.role.permissions),
    ...meta,
  };
}

export function can(access: TenantAccess, permission: Permission): boolean {
  return hasPermission(access.permissions, permission);
}

/** Prüft eine Berechtigung; bei Ablehnung wird ein DENIED-Audit-Eintrag geschrieben. */
export async function requirePermission(
  access: TenantAccess,
  permission: Permission,
  attempted: { action: string; resource: string; resourceId?: string | null },
): Promise<void> {
  if (can(access, permission)) return;
  await recordAudit(auditContext(access), {
    ...attempted,
    outcome: 'DENIED',
    metadata: { requiredPermission: permission, roleKey: access.roleKey },
  });
  throw new ForbiddenError(undefined, `missing ${permission} for ${attempted.action}`);
}
