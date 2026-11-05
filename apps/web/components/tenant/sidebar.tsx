'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/logo';

interface Item {
  href: string;
  label: string;
  enabled: boolean;
}

export function Sidebar({
  slug,
  tenantName,
  items,
}: {
  slug: string;
  tenantName: string;
  items: Item[];
}) {
  const path = usePathname();
  const base = `/t/${slug}`;
  const upcoming = ['Agenten', 'Workflows', 'Integrationen', 'Analytics'];

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-border bg-surface md:min-h-dvh md:w-60 md:border-b-0 md:border-r">
      <div className="px-5 py-5">
        <Logo className="text-sm" />
        <Link
          href="/onboarding"
          className="mt-4 block truncate text-sm font-medium hover:text-accent"
          title="Unternehmen wechseln"
        >
          {tenantName}
        </Link>
      </div>
      <nav
        aria-label="Hauptnavigation"
        className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible"
      >
        {items
          .filter((i) => i.enabled)
          .map((i) => {
            const href = `${base}${i.href}`;
            const active = i.href === '' ? path === base : path.startsWith(href);
            return (
              <Link
                key={i.href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${active ? 'bg-surface-2 text-text' : 'text-muted hover:bg-surface-2 hover:text-text'}`}
              >
                {i.label}
              </Link>
            );
          })}
        <div className="mt-4 hidden px-3 text-xs uppercase tracking-wider text-muted md:block">
          Bald verfügbar
        </div>
        {upcoming.map((label) => (
          <span
            key={label}
            aria-disabled="true"
            title="Noch nicht verfügbar – folgt in einer späteren Phase"
            className="hidden cursor-not-allowed rounded-lg px-3 py-2 text-sm text-muted/50 md:block"
          >
            {label}
          </span>
        ))}
      </nav>
    </aside>
  );
}
