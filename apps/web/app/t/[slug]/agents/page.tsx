import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AGENT_TEMPLATES,
  getAgentSettings,
  listAgents,
  listRuns,
  MODEL_PRICING,
} from '@onyx/agents';
import { can } from '@onyx/tenancy';
import { RunForm } from '@/components/agents/agent-forms';
import { RunsTable } from '@/components/agents/runs-table';
import { SubmitOnlyForm } from '@/components/simple-forms';
import { PageHeader } from '@/components/tenant/page-header';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { runBlocker } from '@/lib/agents-env';
import { formatCents, formatMicroCents } from '@/lib/format';
import { requireTenantAccess } from '@/lib/server';
import { installTemplateAction, startRunAction } from './actions';

export const metadata: Metadata = { title: 'Agenten' };

export default async function AgentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireTenantAccess(slug);
  if (!can(access, 'agent:read')) notFound();

  const [agents, runs, settings] = await Promise.all([
    listAgents(access),
    listRuns(access, { limit: 15 }),
    getAgentSettings(access),
  ]);
  const blocker = runBlocker(settings.agentsEnabled);
  const missingTemplates = AGENT_TEMPLATES.filter((t) => !agents.some((a) => a.key === t.key));

  return (
    <>
      <PageHeader
        title="Agenten"
        description="Jeder Lauf wird Schritt für Schritt protokolliert. Agenten handeln nur über geprüfte Werkzeuge und nie mit mehr Rechten als die auslösende Person."
      />

      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <Badge tone={settings.agentsEnabled ? 'success' : 'danger'}>
          {settings.agentsEnabled ? 'Agenten aktiv' : 'Kill Switch aktiv'}
        </Badge>
        <Badge>
          Verbrauch diesen Monat: {formatMicroCents(settings.monthSpendMicroCents)}
          {settings.agentMonthlyBudgetCents !== null
            ? ` von ${formatCents(settings.agentMonthlyBudgetCents)}`
            : ''}
        </Badge>
      </div>

      {agents.length === 0 ? (
        <Card className="mb-6">
          <CardHeader title="Noch kein Agent eingerichtet" />
          {can(access, 'agent:manage') ? null : (
            <Alert tone="neutral">
              Bitte eine Person mit dem Recht „Agenten konfigurieren“ ansprechen.
            </Alert>
          )}
        </Card>
      ) : null}

      {agents.map((a) => (
        <Card key={a.id} className="mb-6">
          <CardHeader
            title={a.name}
            description={a.description ?? undefined}
            action={
              <div className="flex items-center gap-2">
                {a.activeVersion ? (
                  <Badge>
                    v{a.activeVersion.version} ·{' '}
                    {MODEL_PRICING[a.activeVersion.model]?.label ?? a.activeVersion.model}
                  </Badge>
                ) : null}
                <Link
                  href={`/t/${slug}/agents/${a.id}`}
                  className="text-sm text-muted hover:text-text"
                >
                  Konfiguration
                </Link>
              </div>
            }
          />
          {can(access, 'agent:run') ? (
            <RunForm action={startRunAction.bind(null, slug, a.id)} disabledReason={blocker} />
          ) : null}
        </Card>
      ))}

      {can(access, 'agent:manage') && missingTemplates.length > 0 ? (
        <Card className="mb-6">
          <CardHeader
            title="Vorlagen"
            description="Vorkonfigurierte Agenten, die du als Ausgangspunkt einrichten kannst."
          />
          <ul className="space-y-4">
            {missingTemplates.map((t) => (
              <li key={t.key} className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted">{t.description}</p>
                </div>
                <SubmitOnlyForm
                  action={installTemplateAction.bind(null, slug, t.key)}
                  label="Einrichten"
                  className="w-40"
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Letzte Läufe" />
        <RunsTable slug={slug} runs={runs} />
      </Card>
    </>
  );
}
