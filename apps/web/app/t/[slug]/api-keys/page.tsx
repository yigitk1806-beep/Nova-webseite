import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  isApiKeyGrantable,
  PERMISSION_LABELS,
  PERMISSIONS,
  toPermissions,
} from '@onyx/permissions';
import { can, listApiKeys } from '@onyx/tenancy';
import { CreateApiKeyForm } from '@/components/tenant/apikeys-client';
import { ConfirmButtonForm } from '@/components/tenant/members-client';
import { PageHeader } from '@/components/tenant/page-header';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { requireTenantAccess } from '@/lib/server';
import { createApiKeyAction, revokeApiKeyAction } from '../actions';

export const metadata: Metadata = { title: 'API-Schlüssel' };

const fmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });

export default async function ApiKeysPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireTenantAccess(slug);
  if (!can(access, 'apikey:manage')) notFound();
  const keys = await listApiKeys(access);
  const grantable = PERMISSIONS.filter(
    (p) => isApiKeyGrantable(p) && access.permissions.includes(p),
  ).map((p) => ({
    key: p,
    label: PERMISSION_LABELS[p],
  }));

  return (
    <>
      <PageHeader
        title="API-Schlüssel"
        description="Für Integrationen über die REST-API (/api/v1). Ein Schlüssel hat nie mehr Rechte als die Person, die ihn erstellt hat."
      />
      <Card className="mb-6">
        <CardHeader
          title="Neuer Schlüssel"
          description="Gespeichert wird nur ein Hash. Der Schlüssel wird genau einmal angezeigt."
        />
        <CreateApiKeyForm action={createApiKeyAction.bind(null, slug)} grantable={grantable} />
      </Card>
      <Card>
        <CardHeader title="Aktive Schlüssel" />
        {keys.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Schlüssel.</p>
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((k) => {
              const expired = k.expiresAt !== null && k.expiresAt < new Date();
              return (
                <li key={k.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium">
                      {k.name} <code className="ml-1 text-xs text-muted">{k.prefix}…</code>{' '}
                      {expired ? <Badge tone="danger">Abgelaufen</Badge> : null}
                    </p>
                    <p className="text-xs text-muted">
                      Erstellt {fmt.format(k.createdAt)} ·{' '}
                      {k.expiresAt ? `gültig bis ${fmt.format(k.expiresAt)}` : 'unbegrenzt gültig'}{' '}
                      ·{' '}
                      {k.lastUsedAt
                        ? `zuletzt genutzt ${fmt.format(k.lastUsedAt)}`
                        : 'noch nie genutzt'}
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {toPermissions(k.permissions).map((p) => (
                        <li key={p}>
                          <Badge>{PERMISSION_LABELS[p]}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <ConfirmButtonForm
                    action={revokeApiKeyAction.bind(null, slug, k.id)}
                    label="Widerrufen"
                    confirm={`Schlüssel „${k.name}" widerrufen?`}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card className="mt-6">
        <CardHeader title="Verwendung" />
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs">{`curl -H "Authorization: Bearer <SCHLÜSSEL>" \\
  ${'$'}{APP_URL}/api/v1/members

GET /api/v1/members   (member:read)
GET /api/v1/audit     (audit:read)  ?action=member.&limit=50&cursor=<id>`}</pre>
      </Card>
    </>
  );
}
