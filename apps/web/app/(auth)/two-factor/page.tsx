import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { TwoFactorForm } from '@/components/auth/two-factor-form';

export const metadata: Metadata = { title: 'Zwei-Faktor-Bestätigung' };

export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthShell
      title="Zwei-Faktor-Bestätigung"
      subtitle="Gib den Code aus deiner Authenticator-App ein."
    >
      <TwoFactorForm next={next} />
    </AuthShell>
  );
}
