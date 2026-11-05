import Link from 'next/link';
import { Badge } from '@/components/ui/card';
import { dateTime, formatMicroCents, RUN_STATUS } from '@/lib/format';

export interface RunRow {
  id: string;
  status: string;
  createdAt: Date;
  costMicroCents: bigint;
  input: unknown;
  version: { version: number; model: string; agent: { name: string } };
}

export function RunsTable({ slug, runs }: { slug: string; runs: RunRow[] }) {
  if (runs.length === 0) return <p className="text-sm text-muted">Noch keine Läufe.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Zeit</th>
            <th className="px-3 py-2 font-medium">Agent</th>
            <th className="px-3 py-2 font-medium">Aufgabe</th>
            <th className="px-3 py-2 font-medium">Kosten</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {runs.map((r) => {
            const s = RUN_STATUS[r.status] ?? { label: r.status, tone: 'neutral' as const };
            const prompt =
              typeof (r.input as { prompt?: unknown })?.prompt === 'string'
                ? (r.input as { prompt: string }).prompt
                : '';
            return (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-3 py-2 text-muted">
                  {dateTime.format(r.createdAt)}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.version.agent.name}{' '}
                  <span className="text-xs text-muted">v{r.version.version}</span>
                </td>
                <td className="max-w-xs truncate px-3 py-2">
                  <Link href={`/t/${slug}/agents/runs/${r.id}`} className="hover:text-accent">
                    {prompt || '—'}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  {formatMicroCents(r.costMicroCents)}
                </td>
                <td className="px-3 py-2">
                  <Badge tone={s.tone}>{s.label}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
