import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(import.meta.dirname, '../../../.env') });
if (!process.env.DATABASE_URL || !process.env.MIGRATION_DATABASE_URL) {
  throw new Error('Integrationstests benötigen DATABASE_URL und MIGRATION_DATABASE_URL');
}
