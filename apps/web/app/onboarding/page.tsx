import type { Metadata } from 'next';
import Link from 'next/link';
import { listMyTenants } from '@onyx/tenancy';
import { Logo } from '@/components/logo';
import { SignOutButton } from '@/components/sign-out-button';
import { Card, CardHeader } from '@/components/ui/card';
import { requireUser } from '@/lib/server';
import { CreateTenantForm } from './create-tenant-form';

export const metadata: Metadata = { title: 'Unternehmen wählen' };

export default async function OnboardingPage() {
  const user = await requireUser();
  const memberships = await listMyTenants(user.id);

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-10 flex items-center justify-between">
        <Logo />
        <div className="flex items-center gap-2">
          <Link href="/account/security" className="text-sm text-muted hover:text-text">
            Sicherheit
          </Link>
          <SignOutButton />
        </div>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Hallo {user.name}</h1>
      <p className="mt-1 text-sm text-muted">Wähle ein Unternehmen oder lege ein neues an.</p>

      {memberships.length > 0 ? (
        <Card className="mt-8">
          <CardHeader title="Deine Unternehmen" />
          <ul className="divide-y divide-border">
            {memberships.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/t/${m.tenant.slug}`}
                  className="flex items-center justify-between py-3 text-sm hover:text-accent"
                >
                  <span className="font-medium">{m.tenant.name}</span>
                  <span className="text-muted">/{m.tenant.slug}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader title="Neues Unternehmen" description="Du wirst automatisch Inhaber." />
        <CreateTenantForm />
      </Card>
    </main>
  );
}
