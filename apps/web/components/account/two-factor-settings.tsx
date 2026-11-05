'use client';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Badge } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';
import { authClient } from '@/lib/auth-client';

type Step =
  | { kind: 'idle' }
  | { kind: 'verify'; qr: string; secret: string; backupCodes: string[] }
  | { kind: 'done'; backupCodes: string[] };

export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function enable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const password = String(new FormData(e.currentTarget).get('password'));
    const { data, error } = await authClient.twoFactor.enable({
      password,
      issuer: 'ONYX',
      method: 'totp',
    });
    setPending(false);
    if (error || !data || !('totpURI' in data)) {
      setError('Passwort falsch oder Einrichtung nicht möglich.');
      return;
    }
    const secret = new URL(data.totpURI).searchParams.get('secret') ?? '';
    setStep({
      kind: 'verify',
      qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 192 }),
      secret,
      backupCodes: data.backupCodes,
    });
  }

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind !== 'verify') return;
    setPending(true);
    setError(null);
    const code = String(new FormData(e.currentTarget).get('code')).replace(/\s/g, '');
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) {
      setError('Der Code ist ungültig. Prüfe die Uhrzeit deines Geräts.');
      return;
    }
    setStep({ kind: 'done', backupCodes: step.backupCodes });
    router.refresh();
  }

  async function disable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const password = String(new FormData(e.currentTarget).get('password'));
    const { error } = await authClient.twoFactor.disable({ password });
    setPending(false);
    if (error) {
      setError('Passwort falsch.');
      return;
    }
    router.refresh();
  }

  if (step.kind === 'done') {
    return (
      <div className="space-y-4">
        <Alert tone="success">Zwei-Faktor-Anmeldung ist aktiv.</Alert>
        <BackupCodes codes={step.backupCodes} />
      </div>
    );
  }

  if (step.kind === 'verify') {
    return (
      <form onSubmit={verify} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <p className="text-sm text-muted">
          Scanne den QR-Code mit einer Authenticator-App und gib den angezeigten Code ein.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element -- lokal erzeugte data:-URL */}
        <img
          src={step.qr}
          alt="QR-Code für die Authenticator-App"
          width={192}
          height={192}
          className="rounded-lg bg-white p-2"
        />
        <p className="text-xs text-muted">
          Manuell: <code className="break-all font-mono text-text">{step.secret}</code>
        </p>
        <Field label="Code" htmlFor="totp-code">
          <Input
            id="totp-code"
            name="code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </Field>
        <Button type="submit" disabled={pending}>
          Aktivieren
        </Button>
      </form>
    );
  }

  return enabled ? (
    <form onSubmit={disable} className="max-w-sm space-y-4">
      <p className="text-sm">
        Status: <Badge tone="success">Aktiv</Badge>
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Passwort zur Bestätigung" htmlFor="disable-password">
        <Input
          id="disable-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>
      <Button type="submit" variant="danger" disabled={pending}>
        Zwei-Faktor deaktivieren
      </Button>
    </form>
  ) : (
    <form onSubmit={enable} className="max-w-sm space-y-4">
      <p className="text-sm">
        Status: <Badge tone="warning">Nicht aktiv</Badge>
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Passwort zur Bestätigung" htmlFor="enable-password">
        <Input
          id="enable-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>
      <Button type="submit" disabled={pending}>
        Zwei-Faktor einrichten
      </Button>
    </form>
  );
}

function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">
        Backup-Codes – sicher aufbewahren, jeder ist einmal gültig:
      </p>
      <ul
        data-testid="backup-codes"
        className="grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-3 font-mono text-sm"
      >
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}
