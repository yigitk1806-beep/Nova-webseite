import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRun } from '@onyx/agents';
import { NotFoundError } from '@onyx/core';
import { can } from '@onyx/tenancy';
import { AutoRefresh } from '@/components/agents/agent-forms';
import { ConfirmButtonForm } from '@/components/tenant/members-client';
import { PageHeader } from '@/components/tenant/page-header';
import { Alert, Badge, Card, CardHeader } from '@/components/ui/card';
import { dateTime, formatMicroCents, RUN_STATUS } from '@/lib/format';
import { requireTenantAccess } from '@/lib/server';
import { cancelRunAction } from '../../actions';

export const metadata: Metadata = { title: 'Agent-Lauf' };

const STEP_LABEL = {
  LLM_CALL: 'Modellaufruf',
  TOOL_CALL: 'Werkzeug',
  POLICY_DENIED: 'Verweigert (Policy)',
} as const;
const STEP_TONE = { SUCCEEDED: 'success', FAILED: 'danger', DENIED: 'warning' } as const;

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default async function RunPage({
  params,
}: {
  params: Promise<{ slug: string; runId: string }>;
}) {
  const { slug, runId } = await params;
  const access = await requireTenantAccess(slug);
  if (!can(access, 'agent:read')) notFound();
  const run = await getRun(access, runId).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const active = ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'].includes(run.status);
  const status = RUN_STATUS[run.status] ?? { label: run.status, tone: 'neutral' as const };
  const prompt = (run.input as { prompt?: string }).prompt ?? '';
  const answer = (run.output as { text?: string } | null)?.text ?? null;
  const mayCancel =
    active &&
    (run.triggeredById === access.actor.id || can(access, 'agent:manage')) &&
    can(access, 'agent:run');

  return (
    <>
      <AutoRefresh active={active} />
      <Link href={`/t/${slug}/agents`} className="text-sm text-muted hover:text-text">
        ← Agenten
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={`${run.version.agent.name} · Lauf`}
          description={`Version v${run.version.version} · gestartet ${dateTime.format(run.createdAt)}`}
        />
        <div className="flex items-center gap-3">
          <Badge tone={status.tone}>{status.label}</Badge>
          {mayCancel ? (
            <ConfirmButtonForm
              action={cancelRunAction.bind(null, slug, run.id)}
              label="Abbrechen"
              confirm="Lauf abbrechen?"
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Aufgabe" />
          <p className="whitespace-pre-wrap text-sm">{prompt}</p>
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold">Ergebnis</h3>
            {answer ? (
              <p data-testid="run-answer" className="whitespace-pre-wrap text-sm">
                {answer}
              </p>
            ) : run.error ? (
              <Alert>{run.error}</Alert>
            ) : (
              <p className="text-sm text-muted">{active ? 'Der Agent arbeitet …' : '—'}</p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Verbrauch" />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Modell</dt>
              <dd className="font-mono text-xs">{run.servedModel ?? run.version.model}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Eingabe-Tokens</dt>
              <dd>{run.inputTokens.toLocaleString('de-DE')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Ausgabe-Tokens</dt>
              <dd>{run.outputTokens.toLocaleString('de-DE')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Kosten (geschätzt)</dt>
              <dd className="font-mono text-xs">{formatMicroCents(run.costMicroCents)}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Schritt-Protokoll"
          description="Jeder Modellaufruf und jede Werkzeugnutzung, unverändert gespeichert."
        />
        {run.steps.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Schritte.</p>
        ) : (
          <ol className="space-y-4">
            {run.steps.map((s) => (
              <li key={s.id} data-testid="run-step" className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted">#{s.index + 1}</span>
                  <span className="font-medium">{STEP_LABEL[s.type]}</span>
                  {s.toolKey ? <code className="text-xs">{s.toolKey}</code> : null}
                  <Badge tone={STEP_TONE[s.status]}>{s.status}</Badge>
                  {s.riskClass ? <Badge>{s.riskClass}</Badge> : null}
                  <span className="ml-auto text-xs text-muted">
                    {s.inputTokens !== null ? `${s.inputTokens}/${s.outputTokens} Tokens · ` : ''}
                    {s.costMicroCents !== null ? `${formatMicroCents(s.costMicroCents)} · ` : ''}
                    {s.durationMs !== null ? `${s.durationMs} ms` : ''}
                  </span>
                </div>
                {s.type !== 'LLM_CALL' ? <Json value={s.input} /> : null}
                <Json value={s.output} />
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
