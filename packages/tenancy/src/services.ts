import { createId } from '@paralleldrive/cuid2';
import { appendAudit, listAudit, verifyAuditChain, type AuditQuery } from '@onyx/audit';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@onyx/core';
import { Prisma, withTenant, withUser, type ScopedTx } from '@onyx/db';
import { canGrant, SYSTEM_ROLE_IDS } from '@onyx/permissions';
import type { z } from 'zod';
import { auditContext, requirePermission, type TenantAccess } from './access.ts';
import {
  changeRoleSchema,
  createTenantSchema,
  inviteMemberSchema,
  roleInputSchema,
  updateTenantSchema,
} from './schemas.ts';
import { generateToken, hashToken, tokenMatches } from './tokens.ts';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ValidationError('Eingabe ungültig.', {
      fields: Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message])),
    });
  }
  return r.data;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

interface ActorMeta {
  requestId: string | null;
  ipHash: string | null;
}

// ───────────── Tenants ─────────────

export async function createTenant(userId: string, input: unknown, meta: ActorMeta) {
  const data = parse(createTenantSchema, input);
  const tenantId = createId();
  try {
    return await withTenant(tenantId, userId, async (tx) => {
      const tenant = await tx.tenant.create({
        data: { id: tenantId, name: data.name, slug: data.slug },
      });
      const membership = await tx.membership.create({
        data: { tenantId, userId, roleId: SYSTEM_ROLE_IDS.owner },
      });
      const ctx = { tenantId, actor: { type: 'USER' as const, id: userId }, ...meta };
      await appendAudit(tx, ctx, {
        action: 'tenant.created',
        resource: 'Tenant',
        resourceId: tenantId,
        metadata: { slug: tenant.slug },
      });
      await appendAudit(tx, ctx, {
        action: 'member.added',
        resource: 'Membership',
        resourceId: membership.id,
        metadata: { roleKey: 'owner', via: 'tenant.created' },
      });
      return tenant;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ConflictError('Diese Adresse ist bereits vergeben.');
    throw e;
  }
}

export function listMyTenants(userId: string) {
  return withUser(userId, (tx) =>
    tx.membership.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { id: true, tenant: { select: { id: true, slug: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  );
}

export async function updateTenant(access: TenantAccess, input: unknown) {
  await requirePermission(access, 'tenant:update', {
    action: 'tenant.updated',
    resource: 'Tenant',
    resourceId: access.tenantId,
  });
  const data = parse(updateTenantSchema, input);
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const before = await tx.tenant.findUniqueOrThrow({
      where: { id: access.tenantId },
      select: { name: true },
    });
    const tenant = await tx.tenant.update({
      where: { id: access.tenantId },
      data: { name: data.name },
    });
    await appendAudit(tx, auditContext(access), {
      action: 'tenant.updated',
      resource: 'Tenant',
      resourceId: access.tenantId,
      metadata: { changes: { name: { from: before.name, to: data.name } } },
    });
    return tenant;
  });
}

// ───────────── Roles ─────────────

export async function listRoles(access: TenantAccess) {
  await requirePermission(access, 'role:read', { action: 'role.listed', resource: 'Role' });
  return withTenant(access.tenantId, access.userId, (tx) =>
    tx.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { memberships: { where: { tenantId: access.tenantId } } } } },
    }),
  );
}

async function loadAssignableRole(tx: ScopedTx, access: TenantAccess, roleId: string) {
  // RLS liefert nur Systemrollen und Rollen des eigenen Tenants.
  const role = await tx.role.findUnique({ where: { id: roleId } });
  if (!role) throw new NotFoundError('Rolle nicht gefunden.');
  if (!canGrant(access.permissions, role.permissions)) {
    throw new ForbiddenError(
      'Du kannst keine Rolle vergeben, die mehr Rechte hat als deine eigene.',
    );
  }
  return role;
}

export async function createRole(access: TenantAccess, input: unknown) {
  await requirePermission(access, 'role:manage', { action: 'role.created', resource: 'Role' });
  const data = parse(roleInputSchema, input);
  if (!canGrant(access.permissions, data.permissions)) {
    throw new ForbiddenError('Eine Rolle kann nicht mehr Rechte haben als deine eigene.');
  }
  try {
    return await withTenant(access.tenantId, access.userId, async (tx) => {
      const role = await tx.role.create({
        data: {
          tenantId: access.tenantId,
          key: data.key,
          name: data.name,
          description: data.description ?? null,
          permissions: data.permissions,
        },
      });
      await appendAudit(tx, auditContext(access), {
        action: 'role.created',
        resource: 'Role',
        resourceId: role.id,
        metadata: { key: role.key, permissions: role.permissions },
      });
      return role;
    });
  } catch (e) {
    if (isUniqueViolation(e))
      throw new ConflictError('Eine Rolle mit diesem Schlüssel existiert bereits.');
    throw e;
  }
}

export async function updateRole(access: TenantAccess, roleId: string, input: unknown) {
  await requirePermission(access, 'role:manage', {
    action: 'role.updated',
    resource: 'Role',
    resourceId: roleId,
  });
  const data = parse(roleInputSchema.omit({ key: true }), input);
  if (!canGrant(access.permissions, data.permissions)) {
    throw new ForbiddenError('Eine Rolle kann nicht mehr Rechte haben als deine eigene.');
  }
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const role = await tx.role.findFirst({ where: { id: roleId, tenantId: access.tenantId } });
    if (!role) throw new NotFoundError('Rolle nicht gefunden oder Systemrolle.');
    if (!canGrant(access.permissions, role.permissions)) throw new ForbiddenError();
    const updated = await tx.role.update({
      where: { id: roleId },
      data: {
        name: data.name,
        description: data.description ?? null,
        permissions: data.permissions,
      },
    });
    await appendAudit(tx, auditContext(access), {
      action: 'role.updated',
      resource: 'Role',
      resourceId: roleId,
      metadata: { permissions: { from: role.permissions, to: updated.permissions } },
    });
    return updated;
  });
}

export async function deleteRole(access: TenantAccess, roleId: string) {
  await requirePermission(access, 'role:manage', {
    action: 'role.deleted',
    resource: 'Role',
    resourceId: roleId,
  });
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const role = await tx.role.findFirst({
      where: { id: roleId, tenantId: access.tenantId },
      include: {
        _count: {
          select: {
            memberships: true,
            invitations: { where: { acceptedAt: null, revokedAt: null } },
          },
        },
      },
    });
    if (!role) throw new NotFoundError('Rolle nicht gefunden oder Systemrolle.');
    if (role._count.memberships > 0 || role._count.invitations > 0) {
      throw new ConflictError(
        'Die Rolle ist noch Mitgliedern oder offenen Einladungen zugewiesen.',
      );
    }
    await tx.role.delete({ where: { id: roleId } });
    await appendAudit(tx, auditContext(access), {
      action: 'role.deleted',
      resource: 'Role',
      resourceId: roleId,
      metadata: { key: role.key },
    });
  });
}

// ───────────── Members ─────────────

export async function listMembers(access: TenantAccess) {
  await requirePermission(access, 'member:read', {
    action: 'member.listed',
    resource: 'Membership',
  });
  return withTenant(access.tenantId, access.userId, (tx) =>
    tx.membership.findMany({
      where: { tenantId: access.tenantId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        role: { select: { id: true, key: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  );
}

async function countOwners(tx: ScopedTx, tenantId: string) {
  return tx.membership.count({
    where: { tenantId, roleId: SYSTEM_ROLE_IDS.owner, status: 'ACTIVE' },
  });
}

export async function changeMemberRole(access: TenantAccess, input: unknown) {
  const data = parse(changeRoleSchema, input);
  await requirePermission(access, 'member:update', {
    action: 'member.role_changed',
    resource: 'Membership',
    resourceId: data.membershipId,
  });
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const target = await tx.membership.findFirst({
      where: { id: data.membershipId, tenantId: access.tenantId },
      include: { role: true },
    });
    if (!target) throw new NotFoundError('Mitglied nicht gefunden.');
    // Niemand darf Mitglieder mit höheren Rechten herabstufen.
    if (!canGrant(access.permissions, target.role.permissions)) throw new ForbiddenError();
    const newRole = await loadAssignableRole(tx, access, data.roleId);
    if (
      target.roleId === SYSTEM_ROLE_IDS.owner &&
      newRole.id !== SYSTEM_ROLE_IDS.owner &&
      (await countOwners(tx, access.tenantId)) <= 1
    ) {
      throw new ConflictError('Das Unternehmen braucht mindestens einen Inhaber.');
    }
    const updated = await tx.membership.update({
      where: { id: target.id },
      data: { roleId: newRole.id },
    });
    await appendAudit(tx, auditContext(access), {
      action: 'member.role_changed',
      resource: 'Membership',
      resourceId: target.id,
      metadata: { userId: target.userId, from: target.role.key, to: newRole.key },
    });
    return updated;
  });
}

export async function removeMember(access: TenantAccess, membershipId: string) {
  const isSelf = access.actor.type === 'USER' && membershipId === access.membershipId;
  if (!isSelf) {
    await requirePermission(access, 'member:remove', {
      action: 'member.removed',
      resource: 'Membership',
      resourceId: membershipId,
    });
  }
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const target = await tx.membership.findFirst({
      where: { id: membershipId, tenantId: access.tenantId },
      include: { role: true },
    });
    if (!target) throw new NotFoundError('Mitglied nicht gefunden.');
    if (!isSelf && !canGrant(access.permissions, target.role.permissions))
      throw new ForbiddenError();
    if (target.roleId === SYSTEM_ROLE_IDS.owner && (await countOwners(tx, access.tenantId)) <= 1) {
      throw new ConflictError('Der letzte Inhaber kann nicht entfernt werden.');
    }
    await tx.membership.delete({ where: { id: target.id } });
    await appendAudit(tx, auditContext(access), {
      action: isSelf ? 'member.left' : 'member.removed',
      resource: 'Membership',
      resourceId: target.id,
      metadata: { userId: target.userId, roleKey: target.role.key },
    });
  });
}

// ───────────── Invitations ─────────────

export async function listInvitations(access: TenantAccess) {
  await requirePermission(access, 'member:invite', {
    action: 'invitation.listed',
    resource: 'Invitation',
  });
  return withTenant(access.tenantId, access.userId, (tx) =>
    tx.invitation.findMany({
      where: {
        tenantId: access.tenantId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { role: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  );
}

/**
 * Erstellt eine Einladung. Gibt das Klartext-Token genau einmal zurück (gespeichert wird nur der Hash).
 */
export async function inviteMember(access: TenantAccess, input: unknown) {
  await requirePermission(access, 'member:invite', {
    action: 'member.invited',
    resource: 'Invitation',
  });
  const data = parse(inviteMemberSchema, input);
  const token = generateToken();
  const invitation = await withTenant(access.tenantId, access.userId, async (tx) => {
    const role = await loadAssignableRole(tx, access, data.roleId);
    const existing = await tx.membership.findFirst({
      where: { tenantId: access.tenantId, user: { email: data.email } },
      select: { id: true },
    });
    if (existing) throw new ConflictError('Diese Person ist bereits Mitglied.');
    // Ältere offene Einladungen an dieselbe Adresse werden ersetzt.
    await tx.invitation.updateMany({
      where: { tenantId: access.tenantId, email: data.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const inv = await tx.invitation.create({
      data: {
        tenantId: access.tenantId,
        email: data.email,
        roleId: role.id,
        tokenHash: hashToken(token),
        invitedById: access.actor.id,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
    await appendAudit(tx, auditContext(access), {
      action: 'member.invited',
      resource: 'Invitation',
      resourceId: inv.id,
      metadata: { roleKey: role.key },
    });
    return inv;
  });
  return { invitation, token };
}

export async function revokeInvitation(access: TenantAccess, invitationId: string) {
  await requirePermission(access, 'member:invite', {
    action: 'invitation.revoked',
    resource: 'Invitation',
    resourceId: invitationId,
  });
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const res = await tx.invitation.updateMany({
      where: { id: invitationId, tenantId: access.tenantId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundError('Einladung nicht gefunden.');
    await appendAudit(tx, auditContext(access), {
      action: 'invitation.revoked',
      resource: 'Invitation',
      resourceId: invitationId,
    });
  });
}

export interface InvitationPreview {
  tenantName: string;
  roleName: string;
  email: string;
  expired: boolean;
}

async function lookupInvitation(userId: string, token: string) {
  const rows = await withUser(
    userId,
    (tx) =>
      tx.$queryRaw<
        { id: string; tenantId: string }[]
      >`SELECT * FROM onyx_invitation_lookup(${hashToken(token)})`,
  );
  const row = rows[0];
  if (!row) throw new NotFoundError('Einladung ungültig.');
  return row;
}

export async function previewInvitation(userId: string, token: string): Promise<InvitationPreview> {
  const { id, tenantId } = await lookupInvitation(userId, token);
  return withTenant(tenantId, userId, async (tx) => {
    const inv = await tx.invitation.findUniqueOrThrow({
      where: { id },
      include: { tenant: { select: { name: true } }, role: { select: { name: true } } },
    });
    return {
      tenantName: inv.tenant.name,
      roleName: inv.role.name,
      email: inv.email,
      expired: inv.expiresAt < new Date() || inv.acceptedAt !== null || inv.revokedAt !== null,
    };
  });
}

export async function acceptInvitation(
  user: { id: string; email: string; emailVerified: boolean },
  token: string,
  meta: ActorMeta,
) {
  if (!user.emailVerified) throw new ForbiddenError('Bitte bestätige zuerst deine E-Mail-Adresse.');
  const { id, tenantId } = await lookupInvitation(user.id, token);
  return withTenant(tenantId, user.id, async (tx) => {
    const inv = await tx.invitation.findUniqueOrThrow({
      where: { id },
      include: { tenant: true, role: true },
    });
    if (!tokenMatches(token, inv.tokenHash)) throw new NotFoundError('Einladung ungültig.');
    if (inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) {
      throw new ConflictError('Diese Einladung ist abgelaufen oder wurde bereits verwendet.');
    }
    if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new ForbiddenError('Diese Einladung gilt für eine andere E-Mail-Adresse.');
    }
    const existing = await tx.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId: user.id } },
    });
    if (existing) throw new ConflictError('Du bist bereits Mitglied.');
    const membership = await tx.membership.create({
      data: { tenantId, userId: user.id, roleId: inv.roleId },
    });
    await tx.invitation.update({ where: { id }, data: { acceptedAt: new Date() } });
    await appendAudit(
      tx,
      { tenantId, actor: { type: 'USER', id: user.id }, ...meta },
      {
        action: 'member.joined',
        resource: 'Membership',
        resourceId: membership.id,
        metadata: { invitationId: id, roleKey: inv.role.key },
      },
    );
    return inv.tenant;
  });
}

// ───────────── Audit ─────────────

export async function queryAuditLog(access: TenantAccess, q: AuditQuery) {
  await requirePermission(access, 'audit:read', { action: 'audit.read', resource: 'AuditLog' });
  return withTenant(access.tenantId, access.userId, (tx) => listAudit(tx, access.tenantId, q));
}

export async function verifyTenantAuditChain(access: TenantAccess) {
  await requirePermission(access, 'audit:read', { action: 'audit.verified', resource: 'AuditLog' });
  return withTenant(access.tenantId, access.userId, (tx) => verifyAuditChain(tx, access.tenantId));
}
