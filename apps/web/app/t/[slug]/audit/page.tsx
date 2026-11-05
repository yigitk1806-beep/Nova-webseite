import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, queryAuditLog } from '@onyx/tenancy';
import { PageHeader } from '@/components/tenant/page-header';
import { VerifyChainButton } from '@/components/tenant/verify-chain';
import { Badge, Card } from '@/components/ui/card';
import { requireTenantAccess } from '@/lib/server';
import { verifyAuditAction } from '../actions';

export const metadata: Metadata = { title: 'Audit-Log' };

const fmt = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'medium' });
const tone = { SUCCESS: 'success', DENIED: 'warning', FAILED: 'danger' } as const;

export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ action?: string; cursor?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const access = await requireTenantAccess(slug);
  if (!can(access, 'audit:read')) notFound();

  const cursor = sp.cursor && /^\d+$/.test(sp.cursor) ? BigInt(sp.cursor) : undefined;
  const action = sp.action?.slice(0, 64) || undefined;
  const { items, nextCursor } = await queryAuditLog(access, {
    ...(action ? { action } : {}),
    ...(cursor !== undefined ? { cursor } : {}),
    limit: 50,
  });

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Audit-Log"
          description="Unveränderliches Protokoll aller Aktionen, gesichert durch eine Hash-Kette."
        />
        <VerifyChainButton action={verifyAuditAction.bind(null, slug)} />
      </div>
      <form className="mb-4 flex gap-2" role="search">
        <label htmlFor="action-filter" className="sr-only">
          Aktion filtern
        </label>
        <input
          id="action-filter"
          name="action"
          defaultValue={action}
          placeholder="Aktion filtern, z. B. member."
          className="h-9 w-72 rounded-lg border border-border bg-surface-2 px-3 text-sm"
        />
        <button className="h-9 rounded-lg border border-border px-3 text-sm hover:border-muted">
          Filtern
        </button>
      </form>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Zeit</th>
              <th className="px-4 py-3 font-medium">Akteur</th>
              <th className="px-4 py-3 font-medium">Aktion</th>
              <th className="px-4 py-3 font-medium">Ressource</th>
              <th className="px-4 py-3 font-medium">Ergebnis</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((e) => (
              <tr key={e.id.toString()}>
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {fmt.format(e.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-muted">{e.actorType}</span>{' '}
                  <code className="text-xs">{e.actorId.slice(0, 12)}</code>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{e.action}</td>
                <td className="px-4 py-3 text-xs">
                  {e.resource}
                  {e.resourceId ? (
                    <span className="text-muted"> · {e.resourceId.slice(0, 12)}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={tone[e.outcome]}>{e.outcome}</Badge>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Keine Einträge.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
      {nextCursor !== null ? (
        <div className="mt-4 text-right">
          <Link
            className="text-sm text-muted hover:text-text"
            href={`?${new URLSearchParams({ ...(action ? { action } : {}), cursor: nextCursor.toString() }).toString()}`}
          >
            Ältere Einträge →
          </Link>
        </div>
      ) : null}
    </>
  );
}
