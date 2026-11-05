'use client';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import type { ActionResult } from '@/lib/server';

type Action = (
  prev: ActionResult<{ key: string; prefix: string }> | null,
  fd: FormData,
) => Promise<ActionResult<{ key: string; prefix: string }>>;

export function CreateApiKeyForm({
  action,
  grantable,
}: {
  action: Action;
  grantable: { key: string; label: string }[];
}) {
  return (
    <ActionForm
      action={action}
      resetOnSuccess
      renderSuccess={(d) => (
        <Alert tone="success">
          Schlüssel erstellt. Kopiere ihn jetzt – er wird nicht noch einmal angezeigt:
          <code
            data-testid="new-api-key"
            className="mt-2 block break-all rounded bg-surface-2 p-2 font-mono text-xs text-text"
          >
            {d.key}
          </code>
        </Alert>
      )}
    >
      {(pending) => (
        <>
          <div className="grid gap-4 md:grid-cols-[1fr_200px]">
            <Field label="Name" htmlFor="key-name" hint="Wofür wird der Schlüssel genutzt?">
              <Input
                id="key-name"
                name="name"
                required
                minLength={2}
                maxLength={60}
                placeholder="z. B. Reporting-Export"
              />
            </Field>
            <Field label="Gültigkeit" htmlFor="key-expiry">
              <Select id="key-expiry" name="expiresInDays" defaultValue="90">
                <option value="30">30 Tage</option>
                <option value="90">90 Tage</option>
                <option value="365">1 Jahr</option>
                <option value="never">Unbegrenzt</option>
              </Select>
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Berechtigungen</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {grantable.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="permissions"
                    value={p.key}
                    className="accent-[var(--accent)]"
                  />
                  {p.label} <code className="text-xs text-muted">{p.key}</code>
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={pending}>
            Schlüssel erstellen
          </Button>
        </>
      )}
    </ActionForm>
  );
}
