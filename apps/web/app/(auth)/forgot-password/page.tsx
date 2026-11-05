import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/auth/password-forms';

export const metadata: Metadata = { title: 'Passwort vergessen' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Passwort vergessen" subtitle="Wir schicken dir einen Link zum Zurücksetzen.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
