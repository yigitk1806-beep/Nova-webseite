'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/safe-redirect';

export function LoginForm({ next }: { next?: string | undefined }) {
  const target = safeNext(next);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email'));
    setPending(true);
    setError(null);
    setUnverified(null);
    const { error } = await authClient.signIn.email({
      email,
      password: String(form.get('password')),
    });
    setPending(false);
    if (error) {
      if (error.status === 403) {
        setUnverified(email);
        return;
      }
      setError('E-Mail oder Passwort ist falsch.');
      return;
    }
    router.push(target);
    router.refresh();
  }

  async function resend() {
    if (!unverified) return;
    await authClient.sendVerificationEmail({ email: unverified, callbackURL: target });
    setError(null);
    setUnverified(null);
    router.push('/verify-email');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error ? <Alert>{error}</Alert> : null}
      {unverified ? (
        <Alert tone="neutral">
          Deine E-Mail-Adresse ist noch nicht bestätigt.{' '}
          <button type="button" onClick={resend} className="underline">
            Bestätigungslink erneut senden
          </button>
        </Alert>
      ) : null}
      <Field label="E-Mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Passwort" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Anmelden …' : 'Anmelden'}
      </Button>
      <div className="flex justify-between text-sm text-muted">
        <Link href="/forgot-password" className="hover:text-text">
          Passwort vergessen?
        </Link>
        <Link
          href={next ? `/register?next=${encodeURIComponent(target)}` : '/register'}
          className="hover:text-text"
        >
          Konto erstellen
        </Link>
      </div>
    </form>
  );
}
