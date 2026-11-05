'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/safe-redirect';

export function RegisterForm({ next }: { next?: string | undefined }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password'));
    if (password.length < 12) {
      setError('Das Passwort muss mindestens 12 Zeichen lang sein.');
      return;
    }
    if (!form.get('privacy')) {
      setError('Bitte bestätige die Datenschutzhinweise.');
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get('name')).trim(),
      email: String(form.get('email')).trim().toLowerCase(),
      password,
      callbackURL: safeNext(next),
    });
    setPending(false);
    if (error) {
      setError(error.message ?? 'Registrierung fehlgeschlagen.');
      return;
    }
    router.push('/verify-email');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required minLength={2} />
      </Field>
      <Field label="E-Mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Passwort" htmlFor="password" hint="Mindestens 12 Zeichen.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </Field>
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" name="privacy" className="mt-1 accent-[var(--accent)]" required />
        <span>
          Ich habe die Datenschutzhinweise gelesen. Meine Daten werden in der EU verarbeitet.
        </span>
      </label>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Konto wird erstellt …' : 'Konto erstellen'}
      </Button>
      <p className="text-center text-sm text-muted">
        Schon ein Konto?{' '}
        <Link href="/login" className="text-text hover:underline">
          Anmelden
        </Link>
      </p>
    </form>
  );
}
