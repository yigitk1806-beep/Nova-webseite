'use server';
import { revalidatePath } from 'next/cache';
import { serverEnv } from '@onyx/config';
import { logger } from '@onyx/core';
import {
  changeMemberRole,
  createApiKey,
  createRole,
  deleteRole,
  inviteMember,
  removeMember,
  revokeApiKey,
  revokeInvitation,
  updateRole,
  updateTenant,
  verifyTenantAuditChain,
} from '@onyx/tenancy';
import { sendMail } from '@/lib/mail';
import { requireTenantAccess, runAction, type ActionResult } from '@/lib/server';

type Prev<T = void> = ActionResult<T> | null;

export async function inviteMemberAction(
  slug: string,
  _prev: Prev<{ link: string; emailed: boolean }>,
  fd: FormData,
) {
  const access = await requireTenantAccess(slug);
  const result = await runAction(async () => {
    const email = fd.get('email');
    const { invitation, token } = await inviteMember(access, { email, roleId: fd.get('roleId') });
    const link = `${serverEnv().APP_URL}/invite/${token}`;
    let emailed = false;
    try {
      emailed = await sendMail({
        to: invitation.email,
        subject: `Einladung zu ${access.tenantName} auf ONYX`,
        text: `Du wurdest zu ${access.tenantName} auf ONYX eingeladen.\n\nEinladung annehmen:\n${link}\n\nDer Link ist 7 Tage gültig.`,
      });
    } catch (err) {
      logger.error({ err, invitationId: invitation.id }, 'invitation mail failed');
    }
    return { link, emailed };
  });
  revalidatePath(`/t/${slug}/members`);
  return result;
}

export async function revokeInvitationAction(slug: string, invitationId: string, _prev: Prev) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(() => revokeInvitation(access, invitationId), 'Einladung widerrufen.');
  revalidatePath(`/t/${slug}/members`);
  return r;
}

export async function changeRoleAction(
  slug: string,
  membershipId: string,
  _prev: Prev,
  fd: FormData,
) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(async () => {
    await changeMemberRole(access, { membershipId, roleId: fd.get('roleId') });
  }, 'Rolle geändert.');
  revalidatePath(`/t/${slug}/members`);
  return r;
}

export async function removeMemberAction(slug: string, membershipId: string, _prev: Prev) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(() => removeMember(access, membershipId), 'Mitglied entfernt.');
  revalidatePath(`/t/${slug}/members`);
  return r;
}

export async function createRoleAction(slug: string, _prev: Prev, fd: FormData) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(async () => {
    await createRole(access, {
      key: fd.get('key'),
      name: fd.get('name'),
      description: fd.get('description') || undefined,
      permissions: fd.getAll('permissions'),
    });
  }, 'Rolle angelegt.');
  revalidatePath(`/t/${slug}/roles`);
  return r;
}

export async function deleteRoleAction(slug: string, roleId: string, _prev: Prev) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(() => deleteRole(access, roleId), 'Rolle gelöscht.');
  revalidatePath(`/t/${slug}/roles`);
  return r;
}

export async function updateTenantAction(slug: string, _prev: Prev, fd: FormData) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(async () => {
    await updateTenant(access, { name: fd.get('name') });
  }, 'Gespeichert.');
  revalidatePath(`/t/${slug}`, 'layout');
  return r;
}

export async function verifyAuditAction(
  slug: string,
  _prev: Prev<{ ok: boolean; checked: number }>,
) {
  const access = await requireTenantAccess(slug);
  return runAction(async () => {
    const r = await verifyTenantAuditChain(access);
    return { ok: r.ok, checked: r.checked };
  });
}

export async function createApiKeyAction(
  slug: string,
  _prev: Prev<{ key: string; prefix: string }>,
  fd: FormData,
) {
  const access = await requireTenantAccess(slug);
  const expires = fd.get('expiresInDays');
  const r = await runAction(async () => {
    const { apiKey, key } = await createApiKey(access, {
      name: fd.get('name'),
      permissions: fd.getAll('permissions'),
      expiresInDays: expires === 'never' ? null : expires,
    });
    return { key, prefix: apiKey.prefix };
  });
  revalidatePath(`/t/${slug}/api-keys`);
  return r;
}

export async function revokeApiKeyAction(slug: string, apiKeyId: string, _prev: Prev) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(() => revokeApiKey(access, apiKeyId), 'Schlüssel widerrufen.');
  revalidatePath(`/t/${slug}/api-keys`);
  return r;
}

export async function updateRoleAction(slug: string, roleId: string, _prev: Prev, fd: FormData) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(async () => {
    await updateRole(access, roleId, {
      name: fd.get('name'),
      description: fd.get('description') || undefined,
      permissions: fd.getAll('permissions'),
    });
  }, 'Rolle gespeichert.');
  revalidatePath(`/t/${slug}/roles`);
  return r;
}
