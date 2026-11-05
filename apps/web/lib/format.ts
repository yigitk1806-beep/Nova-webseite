const usd = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const usd2 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' });
export const dateTime = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

/** Mikro-Cent (1e-8 USD) → "0,0123 $" */
export function formatMicroCents(v: bigint | number | null | undefined): string {
  return usd.format(Number(v ?? 0) / 1e8);
}

export function formatCents(v: number): string {
  return usd2.format(v / 100);
}

export const RUN_STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'accent' | 'success' | 'danger' | 'warning' }
> = {
  QUEUED: { label: 'Wartet', tone: 'neutral' },
  RUNNING: { label: 'Läuft', tone: 'accent' },
  WAITING_APPROVAL: { label: 'Wartet auf Freigabe', tone: 'warning' },
  SUCCEEDED: { label: 'Erfolgreich', tone: 'success' },
  FAILED: { label: 'Fehlgeschlagen', tone: 'danger' },
  CANCELLED: { label: 'Abgebrochen', tone: 'warning' },
};
