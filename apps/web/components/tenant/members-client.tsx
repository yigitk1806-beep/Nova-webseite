'use client';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import type { ActionResult } from '@/lib/server';

type Action<T = void> = (prev: ActionResult<T> | null, fd: FormData) => Promise<ActionResult<T>>;
interface RoleOption {
  id: string;
  name: string;
}

export function InviteForm({
  action,
  roles,
}: {
  action: Action<{ link: string; emailed: boolean }>;
  roles: RoleOption[];
}) {
  return (
    <ActionForm
      action={action}
      resetOnSuccess
      className="grid gap-4 md:grid-cols-[1fr_200px_auto] md:items-end"
      renderSuccess={(d) => (
        <div className="md:col-span-3">
          <Alert tone="success">
            {d.emailed
              ? 'Einladung per E-Mail versendet.'
              : 'Einladung erstellt. E-Mail-Versand ist nicht konfiguriert – teile den Link direkt:'}
            <code className="mt-2 block break-all rounded bg-surface-2 p-2 font-mono text-xs text-text">
              {d.link}
            </code>
            <span className="mt-1 block text-xs">
              Der Link wird nur jetzt angezeigt und ist 7 Tage gültig.
            </span>
          </Alert>
        </div>
      )}
    >
      {(pending) => (
        <>
          <Field label="E-Mail" htmlFor="invite-email">
            <Input id="invite-email" name="email" type="email" required />
          </Field>
          <Field label="Rolle" htmlFor="invite-role">
            <Select
              id="invite-role"
              name="roleId"
              required
              defaultValue={roles.find((r) => r.name === 'Mitglied')?.id}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={pending}>
            Einladen
          </Button>
        </>
      )}
    </ActionForm>
  );
}

export function RoleSelectForm({
  action,
  roles,
  currentRoleId,
  disabled,
  id,
}: {
  action: Action;
  roles: RoleOption[];
  currentRoleId: string;
  disabled: boolean;
  id: string;
}) {
  return (
    <ActionForm action={action} className="flex items-center gap-2">
      {(pending) => (
        <>
          <label className="sr-only" htmlFor={id}>
            Rolle
          </label>
          <Select
            id={id}
            name="roleId"
            defaultValue={currentRoleId}
            disabled={disabled || pending}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </>
      )}
    </ActionForm>
  );
}

export function ConfirmButtonForm({
  action,
  label,
  confirm,
}: {
  action: Action;
  label: string;
  confirm: string;
}) {
  return (
    <ActionForm action={action} className="flex flex-col items-end gap-2">
      {(pending) => (
        <Button
          type="submit"
          variant="danger"
          disabled={pending}
          onClick={(e) => {
            if (!window.confirm(confirm)) e.preventDefault();
          }}
        >
          {label}
        </Button>
      )}
    </ActionForm>
  );
}
