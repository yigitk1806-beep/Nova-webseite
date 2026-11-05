import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Migrationen laufen mit der Eigentümerrolle, die Anwendung mit DATABASE_URL (onyx_app).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed.ts',
  },
  datasource: {
    url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
});
