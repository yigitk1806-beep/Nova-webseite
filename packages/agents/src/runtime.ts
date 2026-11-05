import type Anthropic from '@anthropic-ai/sdk';
import { appendAudit, type AuditContext } from '@onyx/audit';
import { logger, NotFoundError } from '@onyx/core';
import { Prisma, withTenant, type RunStatus } from '@onyx/db';
import { intersectPermissions } from '@onyx/permissions';
import { resolveTenantAccess, type TenantAccess } from '@onyx/tenancy';
import { describeLlmError, type LlmClient, type LlmMessage } from './llm.ts';
import { costMicroCents } from './pricing.ts';
import { monthSpend } from './services.ts';
import { SAFETY_PREAMBLE } from './templates.ts';
import { getTool, toApiTool } from './tools.ts';

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam;

/** Phase 2: nur lesende Werkzeuge. Höhere Risikoklassen benötigen Freigaben (Phase 3). */
const ALLOWED_RISK = new Set(['READ']);
const MAX_TOOL_RESULT_CHARS = 20_000;

interface RunContext {
  runId: string;
  tenantId: string;
  userId: string;
  audit: AuditContext;
}

class RunAbort extends Error {
  constructor(
    readonly status: Extract<RunStatus, 'FAILED' | 'CANCELLED'>,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

export interface RunOutcome {
  status: RunStatus;
  error?: string;
}

/**
 * Führt einen Agent-Lauf aus (im Worker). Idempotent: nur Läufe im Status QUEUED werden gestartet.
 *
 * Ablauf je Schritt: Abbruch/Kill-Switch prüfen → Budget prüfen → LLM-Aufruf (protokolliert, bepreist)
 * → je Tool-Aufruf: Validierung → Policy Gate (Tool erlaubt? Risikoklasse? Berechtigung?) → Ausführung
 * → Protokoll + Audit. Effektive Rechte = Agent-Version ∩ aktuelle Rechte der auslösenden Person.
 */
export async function executeRun(
  runId: string,
  tenantId: string,
  llm: LlmClient,
): Promise<RunOutcome> {
  // 1. Lauf atomar übernehmen (QUEUED → RUNNING)
  const claimed = await withTenant(tenantId, null, async (tx) => {
    const res = await tx.agentRun.updateMany({
      where: { id: runId, tenantId, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    if (res.count === 0) return null;
    return tx.agentRun.findUniqueOrThrow({
      where: { id: runId },
      include: {
        version: { include: { agent: true } },
        tenant: { select: { slug: true, agentsEnabled: true } },
      },
    });
  });
  if (!claimed) return { status: 'CANCELLED', error: 'Lauf nicht (mehr) in der Warteschlange.' };

  const { version } = claimed;
  const ctx: RunContext = {
    runId,
    tenantId,
    userId: claimed.triggeredById,
    audit: { tenantId, actor: { type: 'AGENT', id: runId }, requestId: null, ipHash: null },
  };
  const totals = { input: 0, output: 0, cost: 0n, servedModel: null as string | null };
  let stepIndex = 0;

  const finish = async (
    status: RunStatus,
    output: Prisma.InputJsonValue | null,
    error: string | null,
  ) => {
    await withTenant(tenantId, null, async (tx) => {
      await tx.agentRun.updateMany({
        // Ein zwischenzeitlicher Abbruch (Kill Switch/Benutzer) wird nicht überschrieben.
        where: { id: runId, status: 'RUNNING' },
        data: {
          status,
          output: output ?? Prisma.DbNull,
          error,
          servedModel: totals.servedModel,
          inputTokens: totals.input,
          outputTokens: totals.output,
          costMicroCents: totals.cost,
          finishedAt: new Date(),
        },
      });
      // Bei bereits abgebrochenen Läufen trotzdem Verbrauch nachtragen.
      await tx.agentRun.updateMany({
        where: { id: runId, status: { not: 'RUNNING' } },
        data: {
          servedModel: totals.servedModel,
          inputTokens: totals.input,
          outputTokens: totals.output,
          costMicroCents: totals.cost,
        },
      });
      await appendAudit(tx, ctx.audit, {
        action: 'agent.run.finished',
        resource: 'AgentRun',
        resourceId: runId,
        outcome: status === 'SUCCEEDED' ? 'SUCCESS' : 'FAILED',
        metadata: {
          status,
          steps: stepIndex,
          inputTokens: totals.input,
          outputTokens: totals.output,
          costMicroCents: totals.cost.toString(),
          error,
        },
      });
    });
    return error ? { status, error } : { status };
  };

  try {
    if (!claimed.tenant.agentsEnabled)
      throw new RunAbort('CANCELLED', 'Agenten sind deaktiviert (Kill Switch).');

    // 2. Rechte der auslösenden Person zum Startzeitpunkt
    let userAccess: TenantAccess;
    try {
      userAccess = await resolveTenantAccess(ctx.userId, claimed.tenant.slug);
    } catch (e) {
      if (e instanceof NotFoundError)
        throw new RunAbort('FAILED', 'Die auslösende Person ist kein Mitglied mehr.');
      throw e;
    }
    const agentAccess: TenantAccess = {
      ...userAccess,
      actor: { type: 'AGENT', id: runId },
      membershipId: null,
      roleId: null,
      roleKey: `agent:${version.agent.key}`,
      permissions: intersectPermissions(version.permissions, userAccess.permissions),
      requestId: null,
      ipHash: null,
    };

    await withTenant(tenantId, null, (tx) =>
      appendAudit(tx, ctx.audit, {
        action: 'agent.run.started',
        resource: 'AgentRun',
        resourceId: runId,
        metadata: {
          agentKey: version.agent.key,
          version: version.version,
          model: version.model,
          effectivePermissions: agentAccess.permissions,
          triggeredBy: ctx.userId,
        },
      }),
    );

    const tools = version.tools.map(getTool).filter((t) => t !== undefined);
    const prompt = (claimed.input as { prompt?: unknown }).prompt;
    if (typeof prompt !== 'string') throw new RunAbort('FAILED', 'Ungültige Eingabe.');
    const messages: MessageParam[] = [{ role: 'user', content: prompt }];
    const runBudget = BigInt(version.budgetCents) * 1_000_000n;

    for (let llmCalls = 0; ; llmCalls++) {
      if (llmCalls >= version.maxSteps)
        throw new RunAbort('FAILED', `Maximale Schrittzahl (${version.maxSteps}) erreicht.`);
      await assertMayContinue(ctx, totals.cost, runBudget);

      // 3. Modellaufruf
      const started = Date.now();
      let response: LlmMessage;
      try {
        response = await llm.create({
          model: version.model,
          max_tokens: version.maxTokens,
          system: `${SAFETY_PREAMBLE}\n\n${version.systemPrompt}`,
          tools: tools.map(toApiTool),
          messages,
          output_config: { effort: version.effort as 'low' | 'medium' | 'high' | 'xhigh' | 'max' },
        });
      } catch (err) {
        logger.error({ err, runId }, 'llm call failed');
        await recordStep(ctx, stepIndex++, {
          type: 'LLM_CALL',
          status: 'FAILED',
          model: version.model,
          output: { error: describeLlmError(err) },
          durationMs: Date.now() - started,
        });
        throw new RunAbort('FAILED', describeLlmError(err));
      }

      const cost = costMicroCents(response.model, response.usage);
      totals.input += response.usage.input_tokens;
      totals.output += response.usage.output_tokens;
      totals.cost += cost;
      totals.servedModel = response.model;
      const text = response.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      const toolUses = response.content.filter(
        (b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use',
      );

      await recordStep(ctx, stepIndex++, {
        type: 'LLM_CALL',
        status: 'SUCCEEDED',
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        costMicroCents: cost,
        durationMs: Date.now() - started,
        output: {
          stopReason: response.stop_reason,
          text: text || null,
          toolCalls: toolUses.map((t) => t.name),
        },
      });
      await withTenant(tenantId, null, (tx) =>
        tx.usageRecord.create({
          data: {
            tenantId,
            kind: 'llm',
            model: response.model,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            costMicroCents: cost,
            refId: runId,
          },
        }),
      );

      // 4. Stop-Gründe auswerten
      switch (response.stop_reason) {
        case 'refusal': {
          const category = response.stop_details?.category ?? 'unbekannt';
          throw new RunAbort(
            'FAILED',
            `Das Modell hat die Anfrage abgelehnt (Kategorie: ${category}).`,
          );
        }
        case 'max_tokens':
        case 'model_context_window_exceeded':
          throw new RunAbort('FAILED', 'Die Antwort hat das Token-Limit erreicht.');
        case 'pause_turn':
          messages.push({ role: 'assistant', content: response.content });
          continue;
        case 'tool_use':
          break;
        default:
          return await finish('SUCCEEDED', { text }, null);
      }
      if (toolUses.length === 0) return await finish('SUCCEEDED', { text }, null);

      // 5. Werkzeuge: alle Ergebnisse in genau einer User-Nachricht zurückgeben
      messages.push({ role: 'assistant', content: response.content });
      const results: ToolResult[] = [];
      for (const call of toolUses) {
        results.push(await runTool(ctx, stepIndex++, agentAccess, version.tools, call));
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (err) {
    if (err instanceof RunAbort) return finish(err.status, null, err.publicMessage);
    logger.error({ err, runId }, 'agent run crashed');
    return finish('FAILED', null, 'Interner Fehler im Agenten-Lauf.');
  }
}

async function assertMayContinue(ctx: RunContext, spent: bigint, runBudget: bigint) {
  const state = await withTenant(ctx.tenantId, null, async (tx) => {
    const run = await tx.agentRun.findUniqueOrThrow({
      where: { id: ctx.runId },
      select: { status: true },
    });
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: ctx.tenantId },
      select: { agentsEnabled: true, agentMonthlyBudgetCents: true },
    });
    const month =
      tenant.agentMonthlyBudgetCents === null ? null : await monthSpend(tx, ctx.tenantId);
    return { run, tenant, month };
  });
  if (state.run.status !== 'RUNNING')
    throw new RunAbort('CANCELLED', 'Der Lauf wurde abgebrochen.');
  if (!state.tenant.agentsEnabled)
    throw new RunAbort('CANCELLED', 'Agenten wurden deaktiviert (Kill Switch).');
  if (spent >= runBudget)
    throw new RunAbort('FAILED', 'Das Kostenlimit dieses Laufs ist erreicht.');
  if (
    state.month !== null &&
    state.month >= BigInt(state.tenant.agentMonthlyBudgetCents!) * 1_000_000n
  ) {
    throw new RunAbort(
      'FAILED',
      'Das monatliche Agenten-Budget des Unternehmens ist ausgeschöpft.',
    );
  }
}

async function runTool(
  ctx: RunContext,
  index: number,
  access: TenantAccess,
  allowedTools: string[],
  call: Anthropic.Beta.Messages.BetaToolUseBlock,
): Promise<ToolResult> {
  const deny = async (reason: string, extra: Record<string, unknown> = {}) => {
    await recordStep(ctx, index, {
      type: 'POLICY_DENIED',
      status: 'DENIED',
      toolKey: call.name,
      input: call.input as Prisma.InputJsonValue,
      output: { reason },
    });
    await withTenant(ctx.tenantId, null, (tx) =>
      appendAudit(tx, ctx.audit, {
        action: 'agent.tool.denied',
        resource: 'AgentRun',
        resourceId: ctx.runId,
        outcome: 'DENIED',
        metadata: { tool: call.name, reason, ...extra },
      }),
    );
    return {
      type: 'tool_result' as const,
      tool_use_id: call.id,
      is_error: true,
      content: `Nicht erlaubt: ${reason}`,
    };
  };

  const tool = getTool(call.name);
  if (!tool || !allowedTools.includes(call.name))
    return deny('Werkzeug ist für diesen Agenten nicht freigegeben.');
  if (!ALLOWED_RISK.has(tool.riskClass))
    return deny(`Risikoklasse ${tool.riskClass} erfordert eine Freigabe (noch nicht verfügbar).`);
  if (!access.permissions.includes(tool.requiredPermission)) {
    return deny('Fehlende Berechtigung.', { requiredPermission: tool.requiredPermission });
  }
  const parsed = tool.input.safeParse(call.input);
  if (!parsed.success) {
    await recordStep(ctx, index, {
      type: 'TOOL_CALL',
      status: 'FAILED',
      toolKey: call.name,
      riskClass: tool.riskClass,
      input: call.input as Prisma.InputJsonValue,
      output: { error: 'invalid_input' },
    });
    return {
      type: 'tool_result',
      tool_use_id: call.id,
      is_error: true,
      content: `Ungültige Eingabe: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    };
  }

  const started = Date.now();
  try {
    const result = await tool.execute(access, parsed.data);
    const json = JSON.stringify(result);
    const content =
      json.length > MAX_TOOL_RESULT_CHARS
        ? `${json.slice(0, MAX_TOOL_RESULT_CHARS)}… [gekürzt]`
        : json;
    await recordStep(ctx, index, {
      type: 'TOOL_CALL',
      status: 'SUCCEEDED',
      toolKey: call.name,
      riskClass: tool.riskClass,
      input: parsed.data as Prisma.InputJsonValue,
      output: JSON.parse(JSON.stringify(result ?? null)) as Prisma.InputJsonValue,
      durationMs: Date.now() - started,
    });
    await withTenant(ctx.tenantId, null, (tx) =>
      appendAudit(tx, ctx.audit, {
        action: 'agent.tool.executed',
        resource: 'AgentRun',
        resourceId: ctx.runId,
        metadata: { tool: call.name, riskClass: tool.riskClass, input: parsed.data },
      }),
    );
    return { type: 'tool_result', tool_use_id: call.id, content };
  } catch (err) {
    logger.warn({ err, runId: ctx.runId, tool: call.name }, 'tool failed');
    const message =
      err instanceof Error && 'publicMessage' in err
        ? String((err as { publicMessage: unknown }).publicMessage)
        : 'Werkzeug-Fehler.';
    await recordStep(ctx, index, {
      type: 'TOOL_CALL',
      status: 'FAILED',
      toolKey: call.name,
      riskClass: tool.riskClass,
      input: parsed.data as Prisma.InputJsonValue,
      output: { error: message },
      durationMs: Date.now() - started,
    });
    return { type: 'tool_result', tool_use_id: call.id, is_error: true, content: message };
  }
}

interface StepData {
  type: 'LLM_CALL' | 'TOOL_CALL' | 'POLICY_DENIED';
  status: 'SUCCEEDED' | 'FAILED' | 'DENIED';
  toolKey?: string;
  riskClass?: 'READ' | 'WRITE' | 'EXTERNAL_COMMUNICATION' | 'FINANCIAL' | 'DESTRUCTIVE';
  model?: string;
  input?: Prisma.InputJsonValue;
  output?: Prisma.InputJsonValue;
  inputTokens?: number;
  outputTokens?: number;
  costMicroCents?: bigint;
  durationMs?: number;
}

function recordStep(ctx: RunContext, index: number, data: StepData) {
  return withTenant(ctx.tenantId, null, (tx) =>
    tx.agentStep.create({ data: { tenantId: ctx.tenantId, runId: ctx.runId, index, ...data } }),
  );
}
