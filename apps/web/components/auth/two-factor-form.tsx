'use client';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { authClient } from '@/lib/auth-client';
import { safeNext } from '@/lib/safe-redirect';

export function TwoFactorForm({ next }: { next?: string | undefined }) {
  const router = useRouter();
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code')).replace(/\s/g, '');
    setPending(true);
    setError(null);
    const { error } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) {
      setError('Der Code ist ungültig oder abgelaufen.');
      return;
    }
    router.push(safeNext(next));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field
        label={useBackup ? 'Backup-Code' : '6-stelliger Code aus deiner Authenticator-App'}
        htmlFor="code"
      >
        <Input
          id="code"
          name="code"
          required
          autoComplete="one-time-code"
          inputMode={useBackup ? 'text' : 'numeric'}
          autoFocus
        />
      </Field>
      <Button type="submit" className="w-full" disabled={pending}>
        Bestätigen
      </Button>
      <button
        type="button"
        className="text-sm text-muted hover:text-text"
        onClick={() => setUseBackup((v) => !v)}
      >
        {useBackup ? 'Authenticator-Code verwenden' : 'Backup-Code verwenden'}
      </button>
    </form>
  );
}
