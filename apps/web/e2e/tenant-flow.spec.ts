import { expect, test } from '@playwright/test';
import { createTenant, register, uniq } from './helpers';

test('Registrierung, Unternehmen, Einladung, Rechte und Audit', async ({ browser }) => {
  const owner = await browser.newPage();
  const cspErrors: string[] = [];
  owner.on(
    'console',
    (m) => m.text().includes('Content Security Policy') && cspErrors.push(m.text()),
  );

  const ownerEmail = `${uniq('owner')}@example.test`;
  await register(owner, 'Ada Owner', ownerEmail);
  await owner.waitForURL('**/onboarding');
  const slug = await createTenant(owner, `Muster ${uniq('gmbh')}`);

  // Inhaber ohne 2FA bekommt den Hinweis
  await expect(owner.getByText('solltest du die Zwei-Faktor-Anmeldung aktivieren')).toBeVisible();

  // Einladung als Betrachter
  await owner.goto(`/t/${slug}/members`);
  const viewerEmail = `${uniq('viewer')}@example.test`;
  await owner.fill('#invite-email', viewerEmail);
  await owner.selectOption('#invite-role', { label: 'Betrachter' });
  await owner.getByRole('button', { name: 'Einladen', exact: true }).click();
  await expect(owner.getByText('Einladung per E-Mail versendet.')).toBeVisible();
  const inviteLink = (await owner.locator('code').first().textContent())!.trim();

  // Zweite Person: Einladung → Login-Weiterleitung → Registrierung → Annahme
  const viewer = await browser.newPage();
  await viewer.goto(inviteLink);
  await expect(viewer).toHaveURL(/\/login\?next=%2Finvite%2F/);
  await register(viewer, 'Vera Viewer', viewerEmail);
  await viewer.goto(inviteLink);
  await viewer.getByRole('button', { name: 'Einladung annehmen' }).click();
  await viewer.waitForURL(new RegExp(`/t/${slug}$`));

  // Betrachter: kein Einladungsformular, kein Audit-Log, fremde Tenants → 404
  await viewer.goto(`/t/${slug}/members`);
  await expect(viewer.locator('#invite-email')).toHaveCount(0);
  expect((await viewer.goto(`/t/${slug}/audit`))!.status()).toBe(404);
  expect((await viewer.goto(`/t/${uniq('fremd')}`))!.status()).toBe(404);

  // Audit-Kette intakt
  await owner.goto(`/t/${slug}/audit`);
  await expect(owner.getByText('member.joined')).toBeVisible();
  await owner.getByRole('button', { name: 'Integrität prüfen' }).click();
  await expect(owner.getByText(/Kette intakt/)).toBeVisible();

  // Nonce-CSP aktiv und ohne Verstöße
  const res = await owner.goto(`/t/${slug}`);
  expect(res!.headers()['content-security-policy']).toMatch(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  );
  expect(cspErrors).toEqual([]);
});
