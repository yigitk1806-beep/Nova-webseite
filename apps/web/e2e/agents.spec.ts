import { expect, test } from '@playwright/test';
import { createTenant, register, uniq } from './helpers';

test('Agent einrichten, ausführen, Schritt-Protokoll und Kill Switch', async ({ page }) => {
  await register(page, 'Agent Owner', `${uniq('agent')}@example.test`);
  await page.waitForURL('**/onboarding');
  const slug = await createTenant(page, `Agent ${uniq('ag')}`);

  await page.goto(`/t/${slug}/agents`);
  await page.getByRole('button', { name: 'Einrichten' }).click();
  await expect(page.getByRole('heading', { name: 'Unternehmensassistent' })).toBeVisible();

  await page.fill('#prompt', 'Wie viele Mitglieder hat das Unternehmen?');
  await page.getByRole('button', { name: 'Agent ausführen' }).click();
  await page.waitForURL(/\/agents\/runs\//);
  await expect(page.getByTestId('run-answer')).toHaveText('Das Unternehmen hat 1 Mitglied(er).', {
    timeout: 20_000,
  });
  await expect(page.getByText('Erfolgreich')).toBeVisible();
  await expect(page.getByTestId('run-step')).toHaveCount(3);
  await expect(page.getByText('onyx_members_list').first()).toBeVisible();

  // Audit enthält die Agentenaktionen
  await page.goto(`/t/${slug}/audit?action=agent.`);
  await expect(page.getByText('agent.tool.executed')).toBeVisible();
  await expect(page.getByText('agent.run.finished')).toBeVisible();

  // Kill Switch: deaktivieren → keine neuen Läufe
  await page.goto(`/t/${slug}/settings`);
  await page.getByLabel(/Agenten aktiviert/).uncheck();
  await page.getByRole('button', { name: 'Speichern' }).nth(1).click();
  await expect(page.getByText('Gespeichert.').last()).toBeVisible();
  await page.goto(`/t/${slug}/agents`);
  await expect(page.getByText('Kill Switch aktiv')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agent ausführen' })).toBeDisabled();
});
