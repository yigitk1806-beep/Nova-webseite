import { z } from 'zod';
import { appendAudit } from '@onyx/audit';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@onyx/core';
import { Prisma, withTenant } from '@onyx/db';
import { canGrant, PERMISSIONS } from '@onyx/permissions';
import { auditContext, requirePermission, type TenantAccess } from '@onyx/tenancy';
import { allowedModels } from './pricing.ts';
import { AGENT_TEMPLATES } from './templates.ts';
import { TOOL_KEYS } from './tools.ts';

function parse<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    throw new ValidationError('Eingabe ungültig.', {
      fields: Object.fromEntries(
        r.error.issues.map((i) => [i.path.join('.') || 'input', i.message]),
      ),
    });
  }
  return r.data;
}

export const versionInputSchema = z.object({
  systemPrompt: z.string().trim().min(20, 'Mindestens 20 Zeichen').max(8000),
  model: z.string().refine((m) => allowedModels().includes(m), 'Modell ist nicht freigegeben'),
  effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('medium'),
  tools: z.array(z.string().refine((t) => TOOL_KEYS.includes(t), 'Unbekanntes Werkzeug')).max(20),
  permissions: z.array(z.enum(PERMISSIONS)),
  maxSteps: z.coerce.number().int().min(1).max(30).default(12),
  budgetCents: z.coerce.number().int().min(1).max(10_000).default(100),
});

export const startRunSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(2, 'Bitte eine Aufgabe eingeben')
    .max(4000, 'Höchstens 4000 Zeichen'),
});

// ───────────── Agenten ─────────────

export async function listAgents(access: TenantAccess) {
  await requirePermission(access, 'agent:read', {
    action: 'agent.listed',
    resource: 'AgentDefinition',
  });
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const agents = await tx.agentDefinition.findMany({
      where: { tenantId: access.tenantId },
      orderBy: { createdAt: 'asc' },
    });
    const versionIds = agents.map((a) => a.activeVersionId).filter((v): v is string => Boolean(v));
    const versions = await tx.agentVersion.findMany({ where: { id: { in: versionIds } } });
    return agents.map((a) => ({
      ...a,
      activeVersion: versions.find((v) => v.id === a.activeVersionId) ?? null,
    }));
  });
}

export async function getAgent(access: TenantAccess, agentId: string) {
  await requirePermission(access, 'agent:read', {
    action: 'agent.read',
    resource: 'AgentDefinition',
    resourceId: agentId,
  });
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const agent = await tx.agentDefinition.findFirst({
      where: { id: agentId, tenantId: access.tenantId },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!agent) throw new NotFoundError('Agent nicht gefunden.');
    return {
      ...agent,
      activeVersion: agent.versions.find((v) => v.id === agent.activeVersionId) ?? null,
    };
  });
}

export async function installTemplate(access: TenantAccess, templateKey: string) {
  await requirePermission(access, 'agent:manage', {
    action: 'agent.created',
    resource: 'AgentDefinition',
  });
  const tpl = AGENT_TEMPLATES.find((t) => t.key === templateKey);
  if (!tpl) throw new NotFoundError('Vorlage nicht gefunden.');
  if (!canGrant(access.permissions, tpl.permissions)) {
    throw new ForbiddenError('Die Vorlage benötigt Rechte, die du selbst nicht hast.');
  }
  try {
    return await withTenant(access.tenantId, access.userId, async (tx) => {
      const agent = await tx.agentDefinition.create({
        data: {
          tenantId: access.tenantId,
          key: tpl.key,
          name: tpl.name,
          description: tpl.description,
          createdById: access.actor.id,
        },
      });
      const version = await tx.agentVersion.create({
        data: {
          tenantId: access.tenantId,
          agentId: agent.id,
          version: 1,
          systemPrompt: tpl.systemPrompt,
          model: tpl.model,
          effort: tpl.effort,
          budgetCents: tpl.budgetCents,
          tools: tpl.tools,
          permissions: tpl.permissions,
          createdById: access.actor.id,
        },
      });
      await tx.agentDefinition.update({
        where: { id: agent.id },
        data: { activeVersionId: version.id },
      });
      await appendAudit(tx, auditContext(access), {
        action: 'agent.created',
        resource: 'AgentDefinition',
        resourceId: agent.id,
        metadata: {
          template: tpl.key,
          versionId: version.id,
          model: tpl.model,
          tools: tpl.tools,
          permissions: tpl.permissions,
        },
      });
      return agent;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new ConflictError('Dieser Agent ist bereits eingerichtet.');
    }
    throw e;
  }
}

/** Jede Konfigurationsänderung erzeugt eine neue, unveränderliche Version. */
export async function createAgentVersion(access: TenantAccess, agentId: string, input: unknown) {
  await requirePermission(access, 'agent:manage', {
    action: 'agent.version_created',
    resource: 'AgentDefinition',
    resourceId: agentId,
  });
  const data = parse(versionInputSchema, input);
  if (!canGrant(access.permissions, data.permissions)) {
    throw new ForbiddenError('Ein Agent kann nicht mehr Rechte erhalten als du selbst hast.');
  }
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const agent = await tx.agentDefinition.findFirst({
      where: { id: agentId, tenantId: access.tenantId },
    });
    if (!agent) throw new NotFoundError('Agent nicht gefunden.');
    const last = await tx.agentVersion.findFirst({
      where: { agentId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = await tx.agentVersion.create({
      data: {
        tenantId: access.tenantId,
        agentId,
        version: (last?.version ?? 0) + 1,
        ...data,
        createdById: access.actor.id,
      },
    });
    await tx.agentDefinition.update({
      where: { id: agentId },
      data: { activeVersionId: version.id },
    });
    await appendAudit(tx, auditContext(access), {
      action: 'agent.version_created',
      resource: 'AgentDefinition',
      resourceId: agentId,
      metadata: {
        versionId: version.id,
        version: version.version,
        model: data.model,
        tools: data.tools,
        permissions: data.permissions,
      },
    });
    return version;
  });
}

// ───────────── Läufe ─────────────

/** Legt einen Lauf an (QUEUED). Das Einreihen in die Queue übernimmt der Aufrufer. */
export async function startRun(access: TenantAccess, agentId: string, input: unknown) {
  await requirePermission(access, 'agent:run', {
    action: 'agent.run.queued',
    resource: 'AgentRun',
  });
  if (access.actor.type !== 'USER')
    throw new ForbiddenError('Agenten können derzeit nur von Personen gestartet werden.');
  const data = parse(startRunSchema, input);
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: access.tenantId },
      select: { agentsEnabled: true },
    });
    if (!tenant.agentsEnabled)
      throw new ConflictError('Agenten sind für dieses Unternehmen deaktiviert (Kill Switch).');
    const agent = await tx.agentDefinition.findFirst({
      where: { id: agentId, tenantId: access.tenantId },
    });
    if (!agent?.activeVersionId) throw new NotFoundError('Agent nicht gefunden.');
    const run = await tx.agentRun.create({
      data: {
        tenantId: access.tenantId,
        agentVersionId: agent.activeVersionId,
        triggeredByType: 'USER',
        triggeredById: access.actor.id,
        input: { prompt: data.prompt },
      },
    });
    await appendAudit(tx, auditContext(access), {
      action: 'agent.run.queued',
      resource: 'AgentRun',
      resourceId: run.id,
      metadata: { agentId, versionId: agent.activeVersionId },
    });
    return run;
  });
}

export async function listRuns(
  access: TenantAccess,
  filter: { agentId?: string; limit?: number } = {},
) {
  await requirePermission(access, 'agent:read', {
    action: 'agent.run.listed',
    resource: 'AgentRun',
  });
  return withTenant(access.tenantId, access.userId, (tx) =>
    tx.agentRun.findMany({
      where: {
        tenantId: access.tenantId,
        ...(filter.agentId ? { version: { agentId: filter.agentId } } : {}),
      },
      include: {
        version: {
          select: { version: true, model: true, agent: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 25, 100),
    }),
  );
}

export async function getRun(access: TenantAccess, runId: string) {
  await requirePermission(access, 'agent:read', {
    action: 'agent.run.read',
    resource: 'AgentRun',
    resourceId: runId,
  });
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const run = await tx.agentRun.findFirst({
      where: { id: runId, tenantId: access.tenantId },
      include: {
        steps: { orderBy: { index: 'asc' } },
        version: { include: { agent: { select: { id: true, name: true } } } },
      },
    });
    if (!run) throw new NotFoundError('Lauf nicht gefunden.');
    return run;
  });
}

export async function cancelRun(access: TenantAccess, runId: string) {
  await requirePermission(access, 'agent:run', {
    action: 'agent.run.cancelled',
    resource: 'AgentRun',
    resourceId: runId,
  });
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const run = await tx.agentRun.findFirst({ where: { id: runId, tenantId: access.tenantId } });
    if (!run) throw new NotFoundError('Lauf nicht gefunden.');
    const own = run.triggeredById === access.actor.id;
    if (!own && !access.permissions.includes('agent:manage'))
      throw new ForbiddenError('Nur eigene Läufe können abgebrochen werden.');
    const res = await tx.agentRun.updateMany({
      where: { id: runId, status: { in: ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'] } },
      data: { status: 'CANCELLED', error: 'Manuell abgebrochen.', finishedAt: new Date() },
    });
    if (res.count === 0) throw new ConflictError('Der Lauf ist bereits beendet.');
    await appendAudit(tx, auditContext(access), {
      action: 'agent.run.cancelled',
      resource: 'AgentRun',
      resourceId: runId,
    });
  });
}

// ───────────── Einstellungen: Kill Switch & Budget ─────────────

export const agentSettingsSchema = z.object({
  agentsEnabled: z.boolean(),
  monthlyBudgetCents: z.coerce.number().int().min(0).max(100_000_000).nullable(),
});

export async function getAgentSettings(access: TenantAccess) {
  await requirePermission(access, 'agent:read', {
    action: 'agent.settings.read',
    resource: 'Tenant',
  });
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const t = await tx.tenant.findUniqueOrThrow({
      where: { id: access.tenantId },
      select: { agentsEnabled: true, agentMonthlyBudgetCents: true },
    });
    return { ...t, monthSpendMicroCents: await monthSpend(tx, access.tenantId) };
  });
}

export async function updateAgentSettings(access: TenantAccess, input: unknown) {
  await requirePermission(access, 'tenant:update', {
    action: 'agent.settings.updated',
    resource: 'Tenant',
    resourceId: access.tenantId,
  });
  const data = parse(agentSettingsSchema, input);
  return withTenant(access.tenantId, access.userId, async (tx) => {
    const before = await tx.tenant.findUniqueOrThrow({
      where: { id: access.tenantId },
      select: { agentsEnabled: true, agentMonthlyBudgetCents: true },
    });
    await tx.tenant.update({
      where: { id: access.tenantId },
      data: { agentsEnabled: data.agentsEnabled, agentMonthlyBudgetCents: data.monthlyBudgetCents },
    });
    let cancelled = 0;
    if (before.agentsEnabled && !data.agentsEnabled) {
      cancelled = (
        await tx.agentRun.updateMany({
          where: {
            tenantId: access.tenantId,
            status: { in: ['QUEUED', 'RUNNING', 'WAITING_APPROVAL'] },
          },
          data: {
            status: 'CANCELLED',
            error: 'Durch Kill Switch abgebrochen.',
            finishedAt: new Date(),
          },
        })
      ).count;
    }
    await appendAudit(tx, auditContext(access), {
      action:
        before.agentsEnabled !== data.agentsEnabled
          ? data.agentsEnabled
            ? 'agent.killswitch.released'
            : 'agent.killswitch.engaged'
          : 'agent.settings.updated',
      resource: 'Tenant',
      resourceId: access.tenantId,
      metadata: {
        agentsEnabled: { from: before.agentsEnabled, to: data.agentsEnabled },
        monthlyBudgetCents: { from: before.agentMonthlyBudgetCents, to: data.monthlyBudgetCents },
        cancelledRuns: cancelled,
      },
    });
    return { cancelled };
  });
}

export async function monthSpend(
  tx: Prisma.TransactionClient,
  tenantId: string,
  now = new Date(),
): Promise<bigint> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const agg = await tx.usageRecord.aggregate({
    where: { tenantId, createdAt: { gte: start } },
    _sum: { costMicroCents: true },
  });
  return agg._sum.costMicroCents ?? 0n;
}
