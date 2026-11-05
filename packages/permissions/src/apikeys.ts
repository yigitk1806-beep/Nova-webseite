import type { Permission } from './index.ts';

/**
 * Rechte, die nie an API-Schlüssel vergeben werden dürfen:
 * Schlüssel dürfen keine weiteren Schlüssel erzeugen und das Unternehmen nicht löschen.
 */
export const API_KEY_FORBIDDEN: readonly Permission[] = ['apikey:manage', 'tenant:delete'];

export function isApiKeyGrantable(p: Permission): boolean {
  return !API_KEY_FORBIDDEN.includes(p);
}
