import type { Metadata } from 'next';
import { can, listInvitations, listMembers, listRoles } from '@onyx/tenancy';
import { canGrant } from '@onyx/permissions';
import { PageHeader } from '@/components/tenant/page-header';
import { ConfirmButtonForm, InviteForm, RoleSelectForm } from '@/components/tenant/members-client';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { requireTenantAccess } from '@/lib/server';
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
} from '../actions';

export const metadata: Metadata = { title: 'Mitglieder' };

const dateFmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireTenantAccess(slug);
  const canInvite = can(access, 'member:invite');
  const canUpdate = can(access, 'member:update');
  const canRemove = can(access, 'member:remove');

  const [members, roles, invitations] = await Promise.all([
    listMembers(access),
    can(access, 'role:read') ? listRoles(access) : Promise.resolve([]),
    canInvite ? listInvitations(access) : Promise.resolve([]),
  ]);
  const assignable = roles
    .filter((r) => canGrant(access.permissions, r.permissions))
    .map((r) => ({ id: r.id, name: r.name }));
  const roleById = new Map(roles.map((r) => [r.id, r]));

  return (
    <>
      <PageHeader
        title="Mitglieder"
        description={`${members.length} Mitglied${members.length === 1 ? '' : 'er'}`}
      />

      {canInvite ? (
        <Card className="mb-6">
          <CardHeader
            title="Mitglied einladen"
            description="Du kannst nur Rollen vergeben, deren Rechte du selbst hast."
          />
          <InviteForm action={inviteMemberAction.bind(null, slug)} roles={assignable} />
        </Card>
      ) : null}

      <Card>
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const role = roleById.get(m.roleId);
            const manageable = role ? canGrant(access.permissions, role.permissions) : false;
            const isSelf = m.id === access.membershipId;
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.user.name} {isSelf ? <Badge tone="accent">Du</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-muted">{m.user.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {canUpdate && manageable && !isSelf ? (
                    <RoleSelectForm
                      action={changeRoleAction.bind(null, slug, m.id)}
                      roles={assignable}
                      currentRoleId={m.roleId}
                      disabled={false}
                      id={`role-${m.id}`}
                    />
                  ) : (
                    <Badge>{m.role.name}</Badge>
                  )}
                  {(canRemove && manageable && !isSelf) || isSelf ? (
                    <ConfirmButtonForm
                      action={removeMemberAction.bind(null, slug, m.id)}
                      label={isSelf ? 'Verlassen' : 'Entfernen'}
                      confirm={
                        isSelf
                          ? 'Unternehmen wirklich verlassen?'
                          : `${m.user.name} wirklich entfernen?`
                      }
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {canInvite && invitations.length > 0 ? (
        <Card className="mt-6">
          <CardHeader title="Offene Einladungen" />
          <ul className="divide-y divide-border">
            {invitations.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{i.email}</p>
                  <p className="text-xs text-muted">
                    {i.role.name} · gültig bis {dateFmt.format(i.expiresAt)}
                  </p>
                </div>
                <ConfirmButtonForm
                  action={revokeInvitationAction.bind(null, slug, i.id)}
                  label="Widerrufen"
                  confirm="Einladung widerrufen?"
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
