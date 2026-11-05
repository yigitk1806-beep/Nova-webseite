import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenError, UnauthenticatedError, ValidationError } from '@onyx/core';
import { getPrisma } from '@onyx/db';
import { SYSTEM_ROLE_IDS } from '@onyx/permissions';
import {
  acceptInvitation,
  authenticateApiKey,
  changeMemberRole,
  createApiKey,
  createTenant,
  inviteMember,
  listMembers,
  queryAuditLog,
  resolveTenantAccess,
  revokeApiKey,
} from '../src/index.ts';

const app = getPrisma();
const run = randomUUID().slice(0, 8);
const meta = { requestId: 'test', ipHash: null };
let slug: string;
let owner: { id: string; email: string };
let admin: { id: string; email: string };

beforeAll(async () => {
  owner = await app.user.create({
    data: { id: `ko_${run}`, name: 'Owner', email: `ko-${run}@example.test`, emailVerified: true },
  });
  admin = await app.user.create({
    data: { id: `ka_${run}`, name: 'Admin', email: `ka-${run}@example.test`, emailVerified: true },
  });
  slug = (await createTenant(owner.id, { name: 'Keys AG', slug: `keys-${run}` }, meta)).slug;
  const access = await resolveTenantAccess(owner.id, slug);
  const { token } = await inviteMember(access, {
    email: admin.email,
    roleId: SYSTEM_ROLE_IDS.admin,
  });
  await acceptInvitation({ ...admin, emailVerified: true }, token, meta);
});

afterAll(() => app.$disconnect());

describe('API-Schlüssel', () => {
  it('verbietet apikey:manage und tenant:delete für Schlüssel', async () => {
    const access = await resolveTenantAccess(owner.id, slug);
    await expect(
      createApiKey(access, { name: 'Böse', permissions: ['apikey:manage'] }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      createApiKey(access, { name: 'Böse', permissions: ['tenant:delete'] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('authentifiziert, protokolliert als API_KEY und speichert nur den Hash', async () => {
    const access = await resolveTenantAccess(owner.id, slug);
    const { apiKey, key } = await createApiKey(access, {
      name: 'Reporting',
      permissions: ['audit:read', 'member:read'],
    });
    expect(key.startsWith(apiKey.prefix)).toBe(true);
    const stored = await app.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*)::bigint AS n FROM "ApiKey" WHERE hash = ${key}`.catch(() => [{ n: 0n }]);
    expect(Number(stored[0]?.n ?? 0)).toBe(0);

    const keyAccess = await authenticateApiKey(key, meta);
    expect(keyAccess.actor).toEqual({ type: 'API_KEY', id: apiKey.id });
    expect(keyAccess.permissions.sort()).toEqual(['audit:read', 'member:read']);
    expect((await listMembers(keyAccess)).length).toBe(2);

    // Nicht erlaubte Aktion → DENIED mit Akteur API_KEY
    await expect(
      inviteMember(keyAccess, { email: 'x@example.test', roleId: SYSTEM_ROLE_IDS.viewer }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const { items } = await queryAuditLog(access, { action: 'member.invited' });
    expect(items.some((i) => i.actorType === 'API_KEY' && i.outcome === 'DENIED')).toBe(true);
  });

  it('Rechte des Schlüssels sinken mit den Rechten des Erstellers', async () => {
    const adminAccess = await resolveTenantAccess(admin.id, slug);
    const { key } = await createApiKey(adminAccess, {
      name: 'Admin-Key',
      permissions: ['audit:read', 'member:invite'],
    });
    expect((await authenticateApiKey(key, meta)).permissions.sort()).toEqual([
      'audit:read',
      'member:invite',
    ]);

    const ownerAccess = await resolveTenantAccess(owner.id, slug);
    const adminMembership = (await listMembers(ownerAccess)).find((m) => m.userId === admin.id)!;
    await changeMemberRole(ownerAccess, {
      membershipId: adminMembership.id,
      roleId: SYSTEM_ROLE_IDS.viewer,
    });
    expect((await authenticateApiKey(key, meta)).permissions).toEqual([]);
  });

  it('widerrufene, unbekannte und fremd formatierte Schlüssel werden abgelehnt', async () => {
    const access = await resolveTenantAccess(owner.id, slug);
    const { apiKey, key } = await createApiKey(access, {
      name: 'Kurzlebig',
      permissions: ['audit:read'],
    });
    await revokeApiKey(access, apiKey.id);
    await expect(authenticateApiKey(key, meta)).rejects.toBeInstanceOf(UnauthenticatedError);
    await expect(authenticateApiKey('onyx_sk_00000000_nope', meta)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    await expect(authenticateApiKey('Bearer whatever', meta)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it('Schlüssel können keine Schlüssel erzeugen', async () => {
    const access = await resolveTenantAccess(owner.id, slug);
    const { key } = await createApiKey(access, { name: 'Read', permissions: ['audit:read'] });
    const keyAccess = await authenticateApiKey(key, meta);
    await expect(
      createApiKey(keyAccess, { name: 'x', permissions: ['audit:read'] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
