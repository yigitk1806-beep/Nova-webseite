import type { ReactNode } from 'react';
import { can } from '@onyx/tenancy';
import { SignOutButton } from '@/components/sign-out-button';
import { Sidebar } from '@/components/tenant/sidebar';
import { requireTenantAccess, requireUser } from '@/lib/server';

export default async function TenantLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [access, user] = await Promise.all([requireTenantAccess(slug), requireUser()]);

  const items = [
    { href: '', label: 'Übersicht', enabled: true },
    { href: '/members', label: 'Mitglieder', enabled: can(access, 'member:read') },
    { href: '/roles', label: 'Rollen', enabled: can(access, 'role:read') },
    { href: '/audit', label: 'Audit-Log', enabled: can(access, 'audit:read') },
    { href: '/settings', label: 'Einstellungen', enabled: can(access, 'tenant:update') },
  ];

  return (
    <div className="md:flex">
      <Sidebar slug={access.tenantSlug} tenantName={access.tenantName} items={items} />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-end gap-3 border-b border-border px-6 py-3 text-sm text-muted">
          <span>{user.email}</span>
          <SignOutButton />
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
