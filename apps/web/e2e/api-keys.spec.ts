import { expect, test } from '@playwright/test';
import { createTenant, register, uniq } from './helpers';

test('API-Schlüssel: erstellen, verwenden, Rechte, widerrufen', async ({ page, request }) => {
  await register(page, 'Api Owner', `${uniq('api')}@example.test`);
  await page.waitForURL('**/onboarding');
  const slug = await createTenant(page, `Api ${uniq('ag')}`);

  await page.goto(`/t/${slug}/api-keys`);
  await page.fill('#key-name', 'Reporting');
  await page.getByLabel(/Mitglieder ansehen/).check();
  await page.getByRole('button', { name: 'Schlüssel erstellen' }).click();
  const key = (await page.getByTestId('new-api-key').textContent())!.trim();
  expect(key).toMatch(/^onyx_sk_[0-9a-f]{8}_/);

  expect((await request.get('/api/v1/members')).status()).toBe(401);
  const ok = await request.get('/api/v1/members', { headers: { authorization: `Bearer ${key}` } });
  expect(ok.status()).toBe(200);
  expect(ok.headers()['x-ratelimit-limit']).toBe('120');
  const body = (await ok.json()) as { data: { role: { key: string } }[] };
  expect(body.data).toHaveLength(1);
  expect(body.data[0]!.role.key).toBe('owner');

  // Ohne audit:read → 403
  expect(
    (await request.get('/api/v1/audit', { headers: { authorization: `Bearer ${key}` } })).status(),
  ).toBe(403);

  // Widerrufen → 401
  await page.reload();
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Widerrufen' }).click();
  await expect(page.getByText('Noch keine Schlüssel.')).toBeVisible();
  expect(
    (
      await request.get('/api/v1/members', { headers: { authorization: `Bearer ${key}` } })
    ).status(),
  ).toBe(401);

  // Audit enthält den API-Zugriff
  await page.goto(`/t/${slug}/audit?action=apikey.`);
  await expect(page.getByText('apikey.revoked')).toBeVisible();
});
