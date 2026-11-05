/**
 * ONYX Permission-Katalog (Phase 1).
 * Format: "ressource:aktion". Neue Module erweitern diesen Katalog in ihrer Phase.
 */
export const PERMISSIONS = [
  'tenant:read',
  'tenant:update',
  'tenant:delete',
  'member:read',
  'member:invite',
  'member:update',
  'member:remove',
  'role:read',
  'role:manage',
  'audit:read',
  'apikey:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

export const PERMISSION_LABELS: Record<Permission, string> = {
  'tenant:read': 'Unternehmen ansehen',
  'tenant:update': 'Unternehmen bearbeiten',
  'tenant:delete': 'Unternehmen löschen',
  'member:read': 'Mitglieder ansehen',
  'member:invite': 'Mitglieder einladen',
  'member:update': 'Mitgliederrollen ändern',
  'member:remove': 'Mitglieder entfernen',
  'role:read': 'Rollen ansehen',
  'role:manage': 'Rollen verwalten',
  'audit:read': 'Audit-Log ansehen',
  'apikey:manage': 'API-Schlüssel verwalten',
};

export type SystemRoleKey = 'owner' | 'admin' | 'member' | 'viewer';

export interface SystemRoleDefinition {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    key: 'owner',
    name: 'Inhaber',
    description: 'Vollzugriff inklusive Löschen des Unternehmens',
    permissions: PERMISSIONS,
  },
  {
    key: 'admin',
    name: 'Administrator',
    description: 'Verwaltet Mitglieder, Rollen und Einstellungen',
    permissions: PERMISSIONS.filter((p) => p !== 'tenant:delete'),
  },
  {
    key: 'member',
    name: 'Mitglied',
    description: 'Arbeitet im Unternehmen, ohne Verwaltungsrechte',
    permissions: ['tenant:read', 'member:read', 'role:read'],
  },
  {
    key: 'viewer',
    name: 'Betrachter',
    description: 'Nur Lesezugriff',
    permissions: ['tenant:read', 'member:read', 'role:read'],
  },
];

/** Stabile IDs der Systemrollen (werden per Seed angelegt). */
export const SYSTEM_ROLE_IDS: Record<SystemRoleKey, string> = {
  owner: 'sysrole_owner',
  admin: 'sysrole_admin',
  member: 'sysrole_member',
  viewer: 'sysrole_viewer',
};

/** Normalisiert gespeicherte Strings auf bekannte Permissions (unbekannte werden verworfen). */
export function toPermissions(values: readonly string[]): Permission[] {
  return values.filter(isPermission);
}

export function hasPermission(granted: readonly string[], required: Permission): boolean {
  return granted.includes(required);
}

/**
 * Schutz vor Rechteausweitung: Ein Akteur darf nur Rollen vergeben/erstellen,
 * deren Rechte vollständig in seinen eigenen enthalten sind.
 */
export function canGrant(actorPermissions: readonly string[], target: readonly string[]): boolean {
  return target.every((p) => actorPermissions.includes(p));
}

/** Effektive Rechte eines delegierten Akteurs (z. B. Agent im Auftrag eines Nutzers). */
export function intersectPermissions(a: readonly string[], b: readonly string[]): Permission[] {
  return toPermissions(a.filter((p) => b.includes(p)));
}
