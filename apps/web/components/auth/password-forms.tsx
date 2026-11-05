'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { authClient } from '@/lib/auth-client';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const email = String(new FormData(e.currentTarget).get('email')).trim().toLowerCase();
    await authClient.requestPasswordReset({ email, redirectTo: '/reset-password' });
    setPending(false);
    // Immer gleiche Antwort – verrät nicht, ob ein Konto existiert.
    setSent(true);
  }

  if (sent)
    return (
      <Alert tone="success">Falls ein Konto existiert, haben wir dir einen Link geschickt.</Alert>
    );

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="E-Mail" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        Link senden
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    token ? null : 'Der Link ist ungültig oder abgelaufen.',
  );
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const newPassword = String(new FormData(e.currentTarget).get('password'));
    if (newPassword.length < 12) {
      setError('Das Passwort muss mindestens 12 Zeichen lang sein.');
      return;
    }
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) {
      setError('Der Link ist ungültig oder abgelaufen.');
      return;
    }
    router.push('/login');
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field
        label="Neues Passwort"
        htmlFor="password"
        hint="Mindestens 12 Zeichen. Alle Sitzungen werden abgemeldet."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending || !token}>
        Passwort speichern
      </Button>
    </form>
  );
}
