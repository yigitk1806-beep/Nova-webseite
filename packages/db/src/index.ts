import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from './generated/prisma/client.ts';

export { PrismaClient, Prisma } from './generated/prisma/client.ts';
export * from './generated/prisma/enums.ts';
export type * from './generated/prisma/models.ts';

export type DbClient = PrismaClient;
/** Transaktions-Client, in dem der Tenant-/User-Kontext für RLS gesetzt ist. */
export type ScopedTx = Prisma.TransactionClient;

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

const globalForPrisma = globalThis as unknown as { __onyxPrisma?: PrismaClient };

/**
 * Prisma-Client der Anwendungsrolle (onyx_app). RLS ist aktiv.
 * Fachliche Tabellen nur über withTenant()/withUser() verwenden – ohne gesetzten
 * Kontext liefert die Datenbank keine Zeilen.
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__onyxPrisma) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL ist nicht gesetzt');
    globalForPrisma.__onyxPrisma = createPrismaClient(url);
  }
  return globalForPrisma.__onyxPrisma;
}

export interface DbScope {
  tenantId: string | null;
  userId: string | null;
}

/**
 * Führt fn in einer Transaktion aus, in der app.tenant_id / app.user_id gesetzt sind.
 * Die Werte gelten nur für diese Transaktion (set_config(..., true) = SET LOCAL).
 */
export async function withScope<T>(
  scope: DbScope,
  fn: (tx: ScopedTx) => Promise<T>,
  client: PrismaClient = getPrisma(),
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${scope.tenantId ?? ''}, true), set_config('app.user_id', ${scope.userId ?? ''}, true)`;
    return fn(tx);
  });
}

export function withTenant<T>(
  tenantId: string,
  userId: string | null,
  fn: (tx: ScopedTx) => Promise<T>,
  client?: PrismaClient,
): Promise<T> {
  return withScope({ tenantId, userId }, fn, client);
}

/** Nur Nutzerkontext, z. B. um die eigenen Mitgliedschaften über alle Tenants zu lesen. */
export function withUser<T>(
  userId: string,
  fn: (tx: ScopedTx) => Promise<T>,
  client?: PrismaClient,
): Promise<T> {
  return withScope({ tenantId: null, userId }, fn, client);
}
