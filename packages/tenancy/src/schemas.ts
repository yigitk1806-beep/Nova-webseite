import { z } from 'zod';
import { PERMISSIONS } from '@onyx/permissions';

const RESERVED_SLUGS = new Set([
  'api',
  'app',
  'admin',
  'auth',
  'login',
  'register',
  'invite',
  'onboarding',
  'settings',
  'www',
  'onyx',
]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Mindestens 3 Zeichen')
  .max(40, 'Höchstens 40 Zeichen')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Nur Kleinbuchstaben, Ziffern und Bindestriche')
  .refine((s) => !RESERVED_SLUGS.has(s), 'Dieser Name ist reserviert');

export const createTenantSchema = z.object({
  name: z.string().trim().min(2, 'Mindestens 2 Zeichen').max(100),
  slug: slugSchema,
});

export const updateTenantSchema = z.object({
  name: z.string().trim().min(2).max(100),
});

export const inviteMemberSchema = z.object({
  email: z.email('Ungültige E-Mail-Adresse').trim().toLowerCase(),
  roleId: z.string().min(1),
});

export const changeRoleSchema = z.object({
  membershipId: z.string().min(1),
  roleId: z.string().min(1),
});

export const roleInputSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9-]{1,30}$/, 'Schlüssel: Kleinbuchstaben, Ziffern, Bindestrich')
    .refine(
      (k) => !['owner', 'admin', 'member', 'viewer'].includes(k),
      'Systemrollen-Schlüssel sind reserviert',
    ),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(200).optional(),
  permissions: z.array(z.enum(PERMISSIONS)).min(1, 'Mindestens eine Berechtigung'),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type RoleInput = z.infer<typeof roleInputSchema>;
