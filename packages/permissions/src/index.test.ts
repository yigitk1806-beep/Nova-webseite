import { describe, expect, it } from 'vitest';
import {
  canGrant,
  hasPermission,
  intersectPermissions,
  SYSTEM_ROLES,
  toPermissions,
} from './index.ts';

const role = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)!.permissions;

describe('Permissions', () => {
  it('Owner hat alle, Admin alle außer tenant:delete', () => {
    expect(hasPermission(role('owner'), 'tenant:delete')).toBe(true);
    expect(hasPermission(role('admin'), 'tenant:delete')).toBe(false);
    expect(hasPermission(role('admin'), 'member:invite')).toBe(true);
  });
  it('Viewer darf nicht einladen', () => {
    expect(hasPermission(role('viewer'), 'member:invite')).toBe(false);
  });
  it('verhindert Rechteausweitung', () => {
    expect(canGrant(role('admin'), role('owner'))).toBe(false);
    expect(canGrant(role('admin'), role('member'))).toBe(true);
  });
  it('verwirft unbekannte Permissions', () => {
    expect(toPermissions(['tenant:read', 'root:everything'])).toEqual(['tenant:read']);
  });
  it('Schnittmenge für delegierte Akteure', () => {
    expect(intersectPermissions(['audit:read', 'member:invite'], ['audit:read'])).toEqual([
      'audit:read',
    ]);
  });
});
