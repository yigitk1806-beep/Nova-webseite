'use client';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import type { ActionResult } from '@/lib/server';

type Action<T = void> = (prev: ActionResult<T> | null, fd: FormData) => Promise<ActionResult<T>>;

export function SubmitOnlyForm<T>({
  action,
  label,
  className,
}: {
  action: Action<T>;
  label: string;
  className?: string;
}) {
  return (
    <ActionForm action={action} className={className ?? 'space-y-4'}>
      {(pending) => (
        <Button type="submit" disabled={pending} className="w-full">
          {label}
        </Button>
      )}
    </ActionForm>
  );
}

export function TenantSettingsForm({ action, name }: { action: Action; name: string }) {
  return (
    <ActionForm action={action} className="max-w-md space-y-4">
      {(pending) => (
        <>
          <Field label="Name" htmlFor="tenant-name">
            <Input id="tenant-name" name="name" defaultValue={name} required minLength={2} />
          </Field>
          <Button type="submit" disabled={pending}>
            Speichern
          </Button>
        </>
      )}
    </ActionForm>
  );
}
