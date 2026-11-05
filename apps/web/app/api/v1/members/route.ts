import { listMembers } from '@onyx/tenancy';
import { apiRoute } from '@/lib/api';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(
  'member:read',
  { action: 'api.members.list', resource: 'Membership' },
  async (access) => {
    const members = await listMembers(access);
    return members.map((m) => ({
      id: m.id,
      status: m.status,
      joinedAt: m.createdAt,
      user: { id: m.user.id, name: m.user.name, email: m.user.email },
      role: { key: m.role.key, name: m.role.name },
    }));
  },
);
