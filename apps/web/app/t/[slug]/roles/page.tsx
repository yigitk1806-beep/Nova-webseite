import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { canGrant, PERMISSION_LABELS, PERMISSIONS, toPermissions } from '@onyx/permissions';
import { can, listRoles } from '@onyx/tenancy';
import { ConfirmButtonForm } from '@/components/tenant/members-client';
import { PageHeader } from '@/components/tenant/page-header';
import { CreateRoleForm, EditRoleForm } from '@/components/tenant/roles-client';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { requireTenantAccess } from '@/lib/server';
import { createRoleAction, deleteRoleAction, updateRoleAction } from '../actions';

export const metadata: Metadata = { title: 'Rollen' };

export default async function RolesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireTenantAccess(slug);
  if (!can(access, 'role:read')) notFound();
  const roles = await listRoles(access);
  const canManage = can(access, 'role:manage');
  const grantable = PERMISSIONS.filter((p) => access.permissions.includes(p)).map((p) => ({
    key: p,
    label: PERMISSION_LABELS[p],
  }));

  return (
    <>
      <PageHeader
        title="Rollen & Berechtigungen"
        description="Systemrollen sind fest. Eigene Rollen können höchstens deine eigenen Rechte enthalten."
      />
      <div className="space-y-4">
        {roles.map((r) => (
          <Card key={r.id}>
            <CardHeader
              title={r.name}
              description={r.description ?? undefined}
              action={
                <div className="flex items-center gap-2">
                  <Badge tone={r.isSystem ? 'neutral' : 'accent'}>
                    {r.isSystem ? 'System' : 'Eigene Rolle'}
                  </Badge>
                  <Badge>{r._count.memberships} Mitglieder</Badge>
                  {canManage && !r.isSystem ? (
                    <ConfirmButtonForm
                      action={deleteRoleAction.bind(null, slug, r.id)}
                      label="Löschen"
                      confirm={`Rolle „${r.name}" löschen?`}
                    />
                  ) : null}
                </div>
              }
            />
            <ul className="flex flex-wrap gap-2">
              {toPermissions(r.permissions).map((p) => (
                <li key={p}>
                  <Badge>{PERMISSION_LABELS[p]}</Badge>
                </li>
              ))}
            </ul>
            {canManage && !r.isSystem && canGrant(access.permissions, r.permissions) ? (
              <EditRoleForm
                action={updateRoleAction.bind(null, slug, r.id)}
                grantable={grantable}
                role={{
                  id: r.id,
                  name: r.name,
                  description: r.description,
                  permissions: r.permissions,
                }}
              />
            ) : null}
          </Card>
        ))}
      </div>
      {canManage ? (
        <Card className="mt-8">
          <CardHeader title="Eigene Rolle anlegen" />
          <CreateRoleForm action={createRoleAction.bind(null, slug)} grantable={grantable} />
        </Card>
      ) : null}
    </>
  );
}
