import type { Metadata } from 'next';
import Link from 'next/link';
import { TwoFactorSettings } from '@/components/account/two-factor-settings';
import { Logo } from '@/components/logo';
import { Card, CardHeader } from '@/components/ui/card';
import { requireUser } from '@/lib/server';

export const metadata: Metadata = { title: 'Sicherheit' };

export default async function SecurityPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="mb-10 flex items-center justify-between">
        <Logo />
        <Link href="/onboarding" className="text-sm text-muted hover:text-text">
          Zurück
        </Link>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Sicherheit</h1>
      <p className="mt-1 text-sm text-muted">{user.email}</p>
      <Card className="mt-8">
        <CardHeader
          title="Zwei-Faktor-Anmeldung (TOTP)"
          description="Schützt dein Konto zusätzlich mit einem Code aus einer Authenticator-App. Für Inhaber und Administratoren dringend empfohlen."
        />
        <TwoFactorSettings enabled={Boolean(user.twoFactorEnabled)} />
      </Card>
    </main>
  );
}
