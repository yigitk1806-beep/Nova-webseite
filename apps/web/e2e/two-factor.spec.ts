import { expect, test } from '@playwright/test';
import { PASSWORD, register, totp, uniq } from './helpers';

test('Zwei-Faktor-Anmeldung einrichten und beim Login verlangen', async ({ page }) => {
  const email = `${uniq('mfa')}@example.test`;
  await register(page, 'Mia Mfa', email);
  await page.waitForURL('**/onboarding');

  await page.goto('/account/security');
  await page.fill('#enable-password', PASSWORD);
  await page.getByRole('button', { name: 'Zwei-Faktor einrichten' }).click();
  const secret = (await page.locator('code').first().textContent())!.trim();
  await page.fill('#totp-code', totp(secret));
  await page.getByRole('button', { name: 'Aktivieren' }).click();
  await expect(page.getByText('Zwei-Faktor-Anmeldung ist aktiv.')).toBeVisible();
  await expect(page.getByTestId('backup-codes').locator('li')).toHaveCount(10);

  // Abmelden und erneut anmelden → Code wird verlangt
  await page.context().clearCookies();
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await page.waitForURL('**/two-factor**');

  await page.fill('#code', '000000');
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await expect(page.getByText('Der Code ist ungültig')).toBeVisible();

  await page.fill('#code', totp(secret));
  await page.getByRole('button', { name: 'Bestätigen' }).click();
  await page.waitForURL('**/onboarding');
});
