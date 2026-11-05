import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '@onyx/core';
import { createPrismaClient, getPrisma, withScope, withTenant } from '@onyx/db';
import { SYSTEM_ROLE_IDS } from '@onyx/permissions';
import {
  acceptInvitation,
  changeMemberRole,
  createRole,
  createTenant,
  inviteMember,
  listMembers,
  listMyTenants,
  removeMember,
  resolveTenantAccess,
  verifyTenantAuditChain,
  queryAuditLog,
} from '../src/index.ts';

// Eigentümer-Client nur für Testaufbau (Nutzer anlegen, Manipulation simulieren).
const owner = createPrismaClient(process.env.MIGRATION_DATABASE_URL!);
const app = getPrisma();
const run = randomUUID().slice(0, 8);
const meta = { requestId: 'test', ipHash: null };

async function makeUser(label: string, verified = true) {
  const id = `u_${label}_${run}`;
  return app.user.create({
    data: { id, name: label, email: `${label}-${run}@example.test`, emailVerified: verified },
  });
}

let alice: Awaited<ReturnType<typeof makeUser>>;
let bob: Awaited<ReturnType<typeof makeUser>>;
let carol: Awaited<ReturnType<typeof makeUser>>;
let tenantA: { id: string; slug: string };
let tenantB: { id: string; slug: string };

beforeAll(async () => {
  alice = await makeUser('alice');
  bob = await makeUser('bob');
  carol = await makeUser('carol');
  tenantA = await createTenant(alice.id, { name: 'Alpha GmbH', slug: `alpha-${run}` }, meta);
  tenantB = await createTenant(bob.id, { name: 'Beta AG', slug: `beta-${run}` }, meta);
});

afterAll(async () => {
  await owner.$disconnect();
  await app.$disconnect();
});

describe('Tenant-Isolation (RLS)', () => {
  it('ohne Kontext sieht die App-Rolle keine fachlichen Daten', async () => {
    const result = await withScope({ tenantId: null, userId: null }, async (tx) => ({
      tenants: await tx.tenant.count(),
      memberships: await tx.membership.count(),
      audit: await tx.auditLog.count(),
    }));
    expect(result).toEqual({ tenants: 0, memberships: 0, audit: 0 });
  });

  it('Kontext Tenant B sieht keine Daten von Tenant A', async () => {
    const rows = await withTenant(tenantB.id, bob.id, (tx) =>
      tx.membership.findMany({ where: { tenantId: tenantA.id } }),
    );
    expect(rows).toHaveLength(0);
    const audit = await withTenant(tenantB.id, bob.id, (tx) =>
      tx.auditLog.count({ where: { tenantId: tenantA.id } }),
    );
    expect(audit).toBe(0);
  });

  it('Schreiben in fremden Tenant wird von der DB abgelehnt', async () => {
    await expect(
      withTenant(tenantB.id, bob.id, (tx) =>
        tx.membership.create({
          data: { tenantId: tenantA.id, userId: bob.id, roleId: SYSTEM_ROLE_IDS.owner },
        }),
      ),
    ).rejects.toThrow();
  });

  it('Nicht-Mitglied erhält NotFound statt Zugriff', async () => {
    await expect(resolveTenantAccess(bob.id, tenantA.slug)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('listMyTenants zeigt nur eigene Tenants', async () => {
    const mine = await listMyTenants(alice.id);
    expect(mine.map((m) => m.tenant.slug)).toEqual([tenantA.slug]);
  });
});

describe('Einladungen & Rollen', () => {
  it('Einladung annehmen: falsche E-Mail und unbestätigte Adresse werden abgelehnt', async () => {
    const access = await resolveTenantAccess(alice.id, tenantA.slug);
    const { token } = await inviteMember(access, {
      email: carol.email,
      roleId: SYSTEM_ROLE_IDS.viewer,
    });

    await expect(
      acceptInvitation({ id: bob.id, email: bob.email, emailVerified: true }, token, meta),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      acceptInvitation({ id: carol.id, email: carol.email, emailVerified: false }, token, meta),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const tenant = await acceptInvitation(
      { id: carol.id, email: carol.email, emailVerified: true },
      token,
      meta,
    );
    expect(tenant.id).toBe(tenantA.id);
    await expect(
      acceptInvitation({ id: carol.id, email: carol.email, emailVerified: true }, token, meta),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('Viewer darf nicht einladen – Versuch wird als DENIED protokolliert', async () => {
    const carolAccess = await resolveTenantAccess(carol.id, tenantA.slug);
    expect(carolAccess.roleKey).toBe('viewer');
    await expect(
      inviteMember(carolAccess, { email: 'x@example.test', roleId: SYSTEM_ROLE_IDS.viewer }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const aliceAccess = await resolveTenantAccess(alice.id, tenantA.slug);
    const { items } = await queryAuditLog(aliceAccess, { action: 'member.invited' });
    expect(items.some((i) => i.outcome === 'DENIED' && i.actorId === carol.id)).toBe(true);
  });

  it('Admin kann niemanden zum Inhaber machen (keine Rechteausweitung)', async () => {
    const aliceAccess = await resolveTenantAccess(alice.id, tenantA.slug);
    const members = await listMembers(aliceAccess);
    const carolM = members.find((m) => m.userId === carol.id)!;
    await changeMemberRole(aliceAccess, { membershipId: carolM.id, roleId: SYSTEM_ROLE_IDS.admin });

    const carolAccess = await resolveTenantAccess(carol.id, tenantA.slug);
    await expect(
      changeMemberRole(carolAccess, { membershipId: carolM.id, roleId: SYSTEM_ROLE_IDS.owner }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const aliceM = members.find((m) => m.userId === alice.id)!;
    await expect(removeMember(carolAccess, aliceM.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      createRole(carolAccess, { key: 'super', name: 'Super', permissions: ['tenant:delete'] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('der letzte Inhaber kann nicht entfernt oder herabgestuft werden', async () => {
    const aliceAccess = await resolveTenantAccess(alice.id, tenantA.slug);
    await expect(removeMember(aliceAccess, aliceAccess.membershipId)).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(
      changeMemberRole(aliceAccess, {
        membershipId: aliceAccess.membershipId,
        roleId: SYSTEM_ROLE_IDS.admin,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('eigene Rollen sind für andere Tenants unsichtbar', async () => {
    const aliceAccess = await resolveTenantAccess(alice.id, tenantA.slug);
    const role = await createRole(aliceAccess, {
      key: 'buchhaltung',
      name: 'Buchhaltung',
      permissions: ['audit:read'],
    });
    const visibleInB = await withTenant(tenantB.id, bob.id, (tx) =>
      tx.role.findUnique({ where: { id: role.id } }),
    );
    expect(visibleInB).toBeNull();
  });
});

describe('Audit', () => {
  it('App-Rolle kann Audit-Einträge weder ändern noch löschen', async () => {
    await expect(
      withTenant(tenantA.id, alice.id, (tx) =>
        tx.auditLog.updateMany({ where: { tenantId: tenantA.id }, data: { action: 'x' } }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(tenantA.id, alice.id, (tx) =>
        tx.auditLog.deleteMany({ where: { tenantId: tenantA.id } }),
      ),
    ).rejects.toThrow();
  });

  it('Hash-Kette ist gültig und erkennt Manipulation', async () => {
    const access = await resolveTenantAccess(alice.id, tenantA.slug);
    const ok = await verifyTenantAuditChain(access);
    expect(ok.ok).toBe(true);
    expect(ok.checked).toBeGreaterThan(3);

    // Manipulation simulieren (nur als Eigentümer mit deaktiviertem Trigger möglich).
    await owner.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "AuditLog" DISABLE TRIGGER audit_log_immutable');
      const first = await tx.auditLog.findFirstOrThrow({
        where: { tenantId: tenantA.id },
        orderBy: { id: 'asc' },
      });
      await tx.auditLog.update({ where: { id: first.id }, data: { action: 'tampered' } });
      await tx.$executeRawUnsafe('ALTER TABLE "AuditLog" ENABLE TRIGGER audit_log_immutable');
    });
    const broken = await verifyTenantAuditChain(access);
    expect(broken.ok).toBe(false);
  });
});
