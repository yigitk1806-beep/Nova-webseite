import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Logo } from '@/components/logo';
import { getSession } from '@/lib/server';

export default async function Home() {
  const session = await getSession();
  if (session) redirect('/onboarding');

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center px-6 py-16">
      <Logo className="text-lg" />
      <h1 className="mt-10 text-4xl font-semibold tracking-tight sm:text-5xl">
        Der digitale Mitarbeiter für dein Unternehmen.
      </h1>
      <p className="mt-5 max-w-xl text-lg text-muted">
        ONYX automatisiert Geschäftsprozesse mit spezialisierten KI-Agenten – mandantenfähig,
        nachvollziehbar und mit menschlicher Freigabe für jede kritische Aktion.
      </p>
      <p className="mt-3 text-sm text-muted">
        Aktueller Stand: Fundament (Konten, Unternehmen, Rollen, Audit-Log). KI-Agenten folgen in
        Phase 2.
      </p>
      <div className="mt-10 flex gap-3">
        <Link
          href="/register"
          className="inline-flex h-10 items-center rounded-lg bg-accent px-5 text-sm font-medium text-accent-contrast hover:opacity-90"
        >
          Konto erstellen
        </Link>
        <Link
          href="/login"
          className="inline-flex h-10 items-center rounded-lg border border-border px-5 text-sm font-medium hover:border-muted"
        >
          Anmelden
        </Link>
      </div>
    </main>
  );
}
