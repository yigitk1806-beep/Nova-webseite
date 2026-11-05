import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAgentSettings } from '@onyx/agents';
import { can } from '@onyx/tenancy';
import { AgentSettingsForm } from '@/components/agents/agent-forms';
import { TenantSettingsForm } from '@/components/simple-forms';
import { PageHeader } from '@/components/tenant/page-header';
import { Card, CardHeader } from '@/components/ui/card';
import { requireTenantAccess } from '@/lib/server';
import { updateAgentSettingsAction } from '../agents/actions';
import { updateTenantAction } from '../actions';

export const metadata: Metadata = { title: 'Einstellungen' };

export default async function SettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireTenantAccess(slug);
  if (!can(access, 'tenant:update')) notFound();
  const agentSettings = can(access, 'agent:read') ? await getAgentSettings(access) : null;

  return (
    <>
      <PageHeader title="Einstellungen" />
      <Card>
        <CardHeader
          title="Unternehmen"
          description={`Adresse: /t/${access.tenantSlug} (nicht änderbar)`}
        />
        <TenantSettingsForm action={updateTenantAction.bind(null, slug)} name={access.tenantName} />
      </Card>
      {agentSettings ? (
        <Card className="mt-6">
          <CardHeader
            title="Agenten: Kill Switch & Budget"
            description="Gilt sofort für alle Agenten dieses Unternehmens."
          />
          <AgentSettingsForm
            action={updateAgentSettingsAction.bind(null, slug)}
            enabled={agentSettings.agentsEnabled}
            budgetCents={agentSettings.agentMonthlyBudgetCents}
          />
        </Card>
      ) : null}
    </>
  );
}
