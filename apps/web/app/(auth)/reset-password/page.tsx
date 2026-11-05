import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { ResetPasswordForm } from '@/components/auth/password-forms';

export const metadata: Metadata = { title: 'Neues Passwort' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Neues Passwort festlegen">
      <ResetPasswordForm token={token ?? null} />
    </AuthShell>
  );
}
