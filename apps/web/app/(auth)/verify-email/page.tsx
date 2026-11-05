import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';

export const metadata: Metadata = { title: 'E-Mail bestätigen' };

export default function VerifyEmailPage() {
  return (
    <AuthShell
      title="Prüfe dein Postfach"
      subtitle="Wir haben dir einen Bestätigungslink geschickt. Er ist 1 Stunde gültig."
    >
      <Link href="/login" className="text-sm text-muted hover:text-text">
        Zurück zur Anmeldung
      </Link>
    </AuthShell>
  );
}
