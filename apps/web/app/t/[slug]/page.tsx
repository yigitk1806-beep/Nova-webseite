import { PERMISSION_LABELS } from '@onyx/permissions';
import { PageHeader } from '@/components/tenant/page-header';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { requireTenantAccess } from '@/lib/server';

const MODULES = [
  { name: 'Konten & Anmeldung', status: 'live' },
  { name: 'Unternehmen & Mitglieder', status: 'live' },
  { name: 'Rollen & Berechtigungen', status: 'live' },
  { name: 'Audit-Log mit Hash-Kette', status: 'live' },
  { name: 'Agent Engine (lesende Werkzeuge)', status: 'live' },
  { name: 'Freigaben & Workflows', status: 'Phase 3' },
  { name: 'Integrationen & n8n', status: 'Phase 4' },
  { name: 'Analytics & DSGVO-Werkzeuge', status: 'Phase 5' },
] as const;

export default async function TenantHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireTenantAccess(slug);

  return (
    <>
      <PageHeader title={access.tenantName} description="Übersicht über dein ONYX-Arbeitsumfeld." />
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Deine Rolle" description={`Rollenschlüssel: ${access.roleKey}`} />
          <ul className="flex flex-wrap gap-2">
            {access.permissions.map((p) => (
              <li key={p}>
                <Badge>{PERMISSION_LABELS[p]}</Badge>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Module" description="Ehrlicher Status – nichts wird simuliert." />
          <ul className="space-y-2 text-sm">
            {MODULES.map((m) => (
              <li key={m.name} className="flex items-center justify-between">
                <span className={m.status === 'live' ? '' : 'text-muted'}>{m.name}</span>
                <Badge tone={m.status === 'live' ? 'success' : 'neutral'}>
                  {m.status === 'live' ? 'Aktiv' : m.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
