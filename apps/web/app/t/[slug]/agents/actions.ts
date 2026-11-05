'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  cancelRun,
  createAgentVersion,
  installTemplate,
  startRun,
  updateAgentSettings,
} from '@onyx/agents';
import { logger } from '@onyx/core';
import { withTenant } from '@onyx/db';
import { enqueueAgentRun } from '@/lib/queue';
import { requireTenantAccess, runAction, type ActionResult } from '@/lib/server';

type Prev<T = void> = ActionResult<T> | null;

export async function installTemplateAction(slug: string, templateKey: string, _prev: Prev) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(async () => {
    await installTemplate(access, templateKey);
  }, 'Agent eingerichtet.');
  revalidatePath(`/t/${slug}/agents`);
  return r;
}

export async function startRunAction(
  slug: string,
  agentId: string,
  _prev: Prev<{ runId: string }>,
  fd: FormData,
) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(async () => {
    const run = await startRun(access, agentId, { prompt: fd.get('prompt') });
    try {
      await enqueueAgentRun({ runId: run.id, tenantId: access.tenantId });
    } catch (err) {
      // Ohne Queue kann der Lauf nie starten: ehrlich als fehlgeschlagen markieren.
      logger.error({ err, runId: run.id }, 'enqueue failed');
      await withTenant(access.tenantId, access.userId, (tx) =>
        tx.agentRun.update({
          where: { id: run.id },
          data: {
            status: 'FAILED',
            error: 'Der Lauf konnte nicht eingereiht werden (Warteschlange nicht erreichbar).',
            finishedAt: new Date(),
          },
        }),
      );
      throw err;
    }
    return { runId: run.id };
  });
  if (r.ok) redirect(`/t/${slug}/agents/runs/${r.data.runId}`);
  return r;
}

export async function cancelRunAction(slug: string, runId: string, _prev: Prev) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(() => cancelRun(access, runId), 'Lauf abgebrochen.');
  revalidatePath(`/t/${slug}/agents/runs/${runId}`);
  return r;
}

export async function createVersionAction(
  slug: string,
  agentId: string,
  _prev: Prev,
  fd: FormData,
) {
  const access = await requireTenantAccess(slug);
  const r = await runAction(async () => {
    await createAgentVersion(access, agentId, {
      systemPrompt: fd.get('systemPrompt'),
      model: fd.get('model'),
      effort: fd.get('effort'),
      tools: fd.getAll('tools'),
      permissions: fd.getAll('permissions'),
      maxSteps: fd.get('maxSteps'),
      budgetCents: fd.get('budgetCents'),
    });
  }, 'Neue Version gespeichert und aktiviert.');
  revalidatePath(`/t/${slug}/agents/${agentId}`);
  return r;
}

export async function updateAgentSettingsAction(
  slug: string,
  _prev: Prev<{ cancelled: number }>,
  fd: FormData,
) {
  const access = await requireTenantAccess(slug);
  const budget = String(fd.get('monthlyBudgetUsd') ?? '').trim();
  const r = await runAction(() =>
    updateAgentSettings(access, {
      agentsEnabled: fd.get('agentsEnabled') === 'on',
      monthlyBudgetCents: budget === '' ? null : Math.round(Number(budget.replace(',', '.')) * 100),
    }),
  );
  revalidatePath(`/t/${slug}`, 'layout');
  return r;
}
