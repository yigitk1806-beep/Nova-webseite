import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NotFoundError } from '@onyx/core';
import { allowedModels, getAgent, listRuns, MODEL_PRICING, TOOLS } from '@onyx/agents';
import { PERMISSION_LABELS, PERMISSIONS } from '@onyx/permissions';
import { can } from '@onyx/tenancy';
import { VersionForm } from '@/components/agents/agent-forms';
import { RunsTable } from '@/components/agents/runs-table';
import { PageHeader } from '@/components/tenant/page-header';
import { Badge, Card, CardHeader } from '@/components/ui/card';
import { dateTime } from '@/lib/format';
import { requireTenantAccess } from '@/lib/server';
import { createVersionAction } from '../actions';

export const metadata: Metadata = { title: 'Agent' };

export default async function AgentPage({
  params,
}: {
  params: Promise<{ slug: string; agentId: string }>;
}) {
  const { slug, agentId } = await params;
  const access = await requireTenantAccess(slug);
  if (!can(access, 'agent:read')) notFound();
  const agent = await getAgent(access, agentId).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const runs = await listRuns(access, { agentId, limit: 20 });
  const v = agent.activeVersion;

  return (
    <>
      <Link href={`/t/${slug}/agents`} className="text-sm text-muted hover:text-text">
        ← Agenten
      </Link>
      <div className="mt-4">
        <PageHeader title={agent.name} description={agent.description ?? undefined} />
      </div>

      {v ? (
        <Card className="mb-6">
          <CardHeader
            title={`Aktive Version v${v.version}`}
            description={`Erstellt ${dateTime.format(v.createdAt)} · Versionen sind unveränderlich, jede Änderung erzeugt eine neue.`}
          />
          {can(access, 'agent:manage') ? (
            <VersionForm
              action={createVersionAction.bind(null, slug, agent.id)}
              defaults={{
                systemPrompt: v.systemPrompt,
                model: v.model,
                effort: v.effort,
                tools: v.tools,
                permissions: v.permissions,
                maxSteps: v.maxSteps,
                budgetCents: v.budgetCents,
              }}
              models={allowedModels().map((id) => ({ id, label: MODEL_PRICING[id]?.label ?? id }))}
              tools={TOOLS.map((t) => ({ key: t.key, label: t.label, risk: t.riskClass }))}
              permissions={PERMISSIONS.filter((p) => access.permissions.includes(p)).map((p) => ({
                key: p,
                label: PERMISSION_LABELS[p],
              }))}
            />
          ) : (
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-muted">Modell</dt>
                <dd>{MODEL_PRICING[v.model]?.label ?? v.model}</dd>
              </div>
              <div>
                <dt className="text-muted">Werkzeuge</dt>
                <dd className="flex flex-wrap gap-1">
                  {v.tools.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </dd>
              </div>
            </dl>
          )}
        </Card>
      ) : null}

      <Card className="mb-6">
        <CardHeader title="Versionshistorie" />
        <ul className="divide-y divide-border text-sm">
          {agent.versions.map((ver) => (
            <li key={ver.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                v{ver.version} · {MODEL_PRICING[ver.model]?.label ?? ver.model} · {ver.tools.length}{' '}
                Werkzeuge
              </span>
              <span className="text-xs text-muted">
                {dateTime.format(ver.createdAt)}{' '}
                {ver.id === agent.activeVersionId ? <Badge tone="success">aktiv</Badge> : null}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Läufe" />
        <RunsTable slug={slug} runs={runs} />
      </Card>
    </>
  );
}
