'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ActionForm } from '@/components/action-form';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import type { ActionResult } from '@/lib/server';

type Action<T = void> = (prev: ActionResult<T> | null, fd: FormData) => Promise<ActionResult<T>>;

export function RunForm({
  action,
  disabledReason,
}: {
  action: Action<{ runId: string }>;
  disabledReason: string | null;
}) {
  return (
    <ActionForm action={action}>
      {(pending) => (
        <>
          {disabledReason ? <Alert tone="neutral">{disabledReason}</Alert> : null}
          <Field
            label="Aufgabe"
            htmlFor="prompt"
            hint="Der Agent arbeitet nur lesend mit den Daten dieses Unternehmens."
          >
            <textarea
              id="prompt"
              name="prompt"
              required
              minLength={2}
              maxLength={4000}
              rows={3}
              disabled={Boolean(disabledReason)}
              placeholder="z. B. Wer hat in den letzten Tagen Mitglieder eingeladen?"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </Field>
          <Button type="submit" disabled={pending || Boolean(disabledReason)}>
            {pending ? 'Wird gestartet …' : 'Agent ausführen'}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

export interface VersionDefaults {
  systemPrompt: string;
  model: string;
  effort: string;
  tools: string[];
  permissions: string[];
  maxSteps: number;
  budgetCents: number;
}

export function VersionForm({
  action,
  defaults,
  models,
  tools,
  permissions,
}: {
  action: Action;
  defaults: VersionDefaults;
  models: { id: string; label: string }[];
  tools: { key: string; label: string; risk: string }[];
  permissions: { key: string; label: string }[];
}) {
  return (
    <ActionForm action={action}>
      {(pending) => (
        <>
          <Field label="System-Prompt" htmlFor="systemPrompt">
            <textarea
              id="systemPrompt"
              name="systemPrompt"
              required
              minLength={20}
              maxLength={8000}
              rows={8}
              defaultValue={defaults.systemPrompt}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-text focus:border-accent focus:outline-none"
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Modell" htmlFor="model">
              <Select id="model" name="model" defaultValue={defaults.model}>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Aufwand (Effort)" htmlFor="effort">
              <Select id="effort" name="effort" defaultValue={defaults.effort}>
                {['low', 'medium', 'high', 'xhigh', 'max'].map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Max. Modellaufrufe" htmlFor="maxSteps">
              <Input
                id="maxSteps"
                name="maxSteps"
                type="number"
                min={1}
                max={30}
                defaultValue={defaults.maxSteps}
              />
            </Field>
            <Field label="Kostenlimit/Lauf (US-Cent)" htmlFor="budgetCents">
              <Input
                id="budgetCents"
                name="budgetCents"
                type="number"
                min={1}
                max={10000}
                defaultValue={defaults.budgetCents}
              />
            </Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Werkzeuge</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {tools.map((t) => (
                <label key={t.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="tools"
                    value={t.key}
                    defaultChecked={defaults.tools.includes(t.key)}
                    className="accent-[var(--accent)]"
                  />
                  {t.label} <span className="text-xs text-muted">({t.risk})</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Berechtigungen des Agenten</legend>
            <p className="mb-2 text-xs text-muted">
              Bei jedem Lauf zusätzlich begrenzt auf die Rechte der auslösenden Person.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {permissions.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="permissions"
                    value={p.key}
                    defaultChecked={defaults.permissions.includes(p.key)}
                    className="accent-[var(--accent)]"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Button type="submit" disabled={pending}>
            Als neue Version speichern
          </Button>
        </>
      )}
    </ActionForm>
  );
}

export function AgentSettingsForm({
  action,
  enabled,
  budgetCents,
}: {
  action: Action<{ cancelled: number }>;
  enabled: boolean;
  budgetCents: number | null;
}) {
  return (
    <ActionForm
      action={action}
      className="max-w-md space-y-4"
      renderSuccess={(d) => (
        <Alert tone="success">
          Gespeichert.
          {d.cancelled > 0 ? ` ${d.cancelled} laufende Agent-Läufe wurden abgebrochen.` : ''}
        </Alert>
      )}
    >
      {(pending) => (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="agentsEnabled"
              defaultChecked={enabled}
              className="accent-[var(--accent)]"
            />
            Agenten aktiviert{' '}
            <span className="text-xs text-muted">
              (Deaktivieren bricht alle laufenden Läufe sofort ab)
            </span>
          </label>
          <Field
            label="Monatsbudget (USD)"
            htmlFor="monthlyBudgetUsd"
            hint="Leer = unbegrenzt. Läufe stoppen, sobald das Budget erreicht ist."
          >
            <Input
              id="monthlyBudgetUsd"
              name="monthlyBudgetUsd"
              inputMode="decimal"
              defaultValue={budgetCents === null ? '' : (budgetCents / 100).toFixed(2)}
            />
          </Field>
          <Button type="submit" disabled={pending}>
            Speichern
          </Button>
        </>
      )}
    </ActionForm>
  );
}

/** Aktualisiert die Seite, solange ein Lauf aktiv ist. */
export function AutoRefresh({
  active,
  intervalMs = 2000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
