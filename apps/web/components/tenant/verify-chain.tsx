'use client';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import type { ActionResult } from '@/lib/server';

export function VerifyChainButton({
  action,
}: {
  action: (
    prev: ActionResult<{ ok: boolean; checked: number }> | null,
    fd: FormData,
  ) => Promise<ActionResult<{ ok: boolean; checked: number }>>;
}) {
  return (
    <ActionForm
      action={action}
      className="flex flex-col items-end gap-2"
      renderSuccess={(d) =>
        d.ok ? (
          <Alert tone="success">Kette intakt – {d.checked} Einträge geprüft.</Alert>
        ) : (
          <Alert>
            Integritätsfehler erkannt! Bitte sofort den Sicherheitsverantwortlichen informieren.
          </Alert>
        )
      }
    >
      {(pending) => (
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? 'Prüfe …' : 'Integrität prüfen'}
        </Button>
      )}
    </ActionForm>
  );
}
