'use client';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import type { ActionResult } from '@/lib/server';

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

export function CreateRoleForm({
  action,
  grantable,
}: {
  action: Action;
  grantable: { key: string; label: string }[];
}) {
  return (
    <ActionForm action={action} resetOnSuccess>
      {(pending) => (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name" htmlFor="role-name">
              <Input id="role-name" name="name" required placeholder="z. B. Buchhaltung" />
            </Field>
            <Field label="Schlüssel" htmlFor="role-key" hint="Eindeutig, z. B. buchhaltung">
              <Input id="role-key" name="key" required pattern="[a-z][a-z0-9-]{1,30}" />
            </Field>
          </div>
          <Field label="Beschreibung" htmlFor="role-desc">
            <Input id="role-desc" name="description" maxLength={200} />
          </Field>
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
            Rolle anlegen
          </Button>
        </>
      )}
    </ActionForm>
  );
}
