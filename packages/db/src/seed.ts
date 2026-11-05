/**
 * Seed: legt die Systemrollen an bzw. aktualisiert sie. Läuft mit der Eigentümerrolle.
 * Idempotent – kann bei jedem Deployment ausgeführt werden.
 */
import 'dotenv/config';
import { SYSTEM_ROLE_IDS, SYSTEM_ROLES } from '@onyx/permissions';
import { createPrismaClient } from './index.ts';

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL ist nicht gesetzt');

const prisma = createPrismaClient(url);

try {
  for (const role of SYSTEM_ROLES) {
    const data = {
      key: role.key,
      name: role.name,
      description: role.description,
      permissions: [...role.permissions],
      isSystem: true,
      tenantId: null,
    };
    await prisma.role.upsert({
      where: { id: SYSTEM_ROLE_IDS[role.key] },
      create: { id: SYSTEM_ROLE_IDS[role.key], ...data },
      update: data,
    });
  }
  console.log(`Systemrollen synchronisiert: ${SYSTEM_ROLES.map((r) => r.key).join(', ')}`);
} finally {
  await prisma.$disconnect();
}
