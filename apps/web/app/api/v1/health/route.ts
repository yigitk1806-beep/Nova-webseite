import { NextResponse } from 'next/server';
import { logger } from '@onyx/core';
import { getPrisma } from '@onyx/db';

export const dynamic = 'force-dynamic';

/** Liveness/Readiness: prüft die Datenbankverbindung. Gibt keine internen Details preis. */
export async function GET() {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    logger.error({ err }, 'health check failed');
    return NextResponse.json({ status: 'unavailable' }, { status: 503 });
  }
}
