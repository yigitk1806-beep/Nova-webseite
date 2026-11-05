'use client';
import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import type { ActionResult } from '@/lib/server';
import { Alert } from './ui/card';

type FormAction<T> = (prev: ActionResult<T> | null, formData: FormData) => Promise<ActionResult<T>>;

/**
 * Formular für Server Actions mit einheitlicher Fehler-/Erfolgsanzeige.
 * `children` erhält den Pending-Status, `renderSuccess` optional die Rückgabedaten.
 */
export function ActionForm<T>({
  action,
  children,
  className = 'space-y-4',
  resetOnSuccess = false,
  renderSuccess,
}: {
  action: FormAction<T>;
  children: (pending: boolean) => ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  renderSuccess?: (data: T) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {state && !state.ok ? (
        <Alert>
          {state.error}
          {state.fields ? (
            <ul className="mt-1 list-disc pl-4">
              {Object.entries(state.fields).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      {state?.ok && renderSuccess ? renderSuccess(state.data) : null}
      {state?.ok && !renderSuccess && state.message ? (
        <Alert tone="success">{state.message}</Alert>
      ) : null}
      {children(pending)}
    </form>
  );
}
