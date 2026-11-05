import { z } from 'zod';
import type { Permission } from '@onyx/permissions';
import { listMembers, listRoles, queryAuditLog, type TenantAccess } from '@onyx/tenancy';
import { withTenant } from '@onyx/db';

export type RiskClass = 'READ' | 'WRITE' | 'EXTERNAL_COMMUNICATION' | 'FINANCIAL' | 'DESTRUCTIVE';

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  key: string;
  label: string;
  description: string;
  input: S;
  riskClass: RiskClass;
  requiredPermission: Permission;
  execute(access: TenantAccess, input: z.infer<S>): Promise<unknown>;
}

function defineTool<S extends z.ZodType>(t: ToolDefinition<S>): ToolDefinition {
  return t as unknown as ToolDefinition;
}

/**
 * Phase 2: ausschließlich lesende Tools auf ONYX-eigenen Daten.
 * Datenminimierung: keine E-Mail-Adressen, keine IP-Hashes, keine Rohmetadaten.
 */
export const TOOLS: readonly ToolDefinition[] = [
  defineTool({
    key: 'onyx_tenant_info',
    label: 'Unternehmensdaten lesen',
    description:
      'Liefert Name, Adresse (Slug), Tarif und Anzahl der Mitglieder des aktuellen Unternehmens.',
    input: z.strictObject({}),
    riskClass: 'READ',
    requiredPermission: 'tenant:read',
    execute: (access) =>
      withTenant(access.tenantId, access.userId, async (tx) => {
        const t = await tx.tenant.findUniqueOrThrow({
          where: { id: access.tenantId },
          select: {
            name: true,
            slug: true,
            plan: true,
            createdAt: true,
            _count: { select: { memberships: true } },
          },
        });
        return {
          name: t.name,
          slug: t.slug,
          plan: t.plan,
          createdAt: t.createdAt,
          memberCount: t._count.memberships,
        };
      }),
  }),
  defineTool({
    key: 'onyx_members_list',
    label: 'Mitglieder auflisten',
    description:
      'Listet die Mitglieder des Unternehmens mit Name, Rolle, Status und Beitrittsdatum (ohne E-Mail-Adressen).',
    input: z.strictObject({}),
    riskClass: 'READ',
    requiredPermission: 'member:read',
    execute: async (access) =>
      (await listMembers(access)).map((m) => ({
        name: m.user.name,
        role: m.role.name,
        status: m.status,
        joinedAt: m.createdAt,
      })),
  }),
  defineTool({
    key: 'onyx_roles_list',
    label: 'Rollen auflisten',
    description:
      'Listet die Rollen mit ihren Berechtigungen und der Anzahl zugeordneter Mitglieder.',
    input: z.strictObject({}),
    riskClass: 'READ',
    requiredPermission: 'role:read',
    execute: async (access) =>
      (await listRoles(access)).map((r) => ({
        key: r.key,
        name: r.name,
        system: r.isSystem,
        permissions: r.permissions,
        members: r._count.memberships,
      })),
  }),
  defineTool({
    key: 'onyx_audit_search',
    label: 'Audit-Log durchsuchen',
    description:
      'Durchsucht das Audit-Log des Unternehmens. Optional nach Aktionspräfix filtern (z. B. "member." oder "agent.run"). Neueste zuerst.',
    input: z.strictObject({
      action: z.string().max(64).optional().describe('Präfix der Aktion, z. B. "member."'),
      limit: z.number().int().min(1).max(50).optional().describe('Anzahl der Einträge (max. 50)'),
    }),
    riskClass: 'READ',
    requiredPermission: 'audit:read',
    execute: async (access, input) => {
      const { items } = await queryAuditLog(access, {
        ...(input.action ? { action: input.action } : {}),
        limit: input.limit ?? 20,
      });
      return items.map((e) => ({
        at: e.createdAt,
        actorType: e.actorType,
        action: e.action,
        resource: e.resource,
        outcome: e.outcome,
      }));
    },
  }),
];

export const TOOL_KEYS = TOOLS.map((t) => t.key);

export function getTool(key: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.key === key);
}

/** Tool-Definition im Format der Messages API. */
export function toApiTool(t: ToolDefinition) {
  const schema = z.toJSONSchema(t.input) as Record<string, unknown>;
  delete schema.$schema;
  return {
    name: t.key,
    description: t.description,
    input_schema: { type: 'object' as const, ...schema },
  };
}
