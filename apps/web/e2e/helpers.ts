import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { MAIL_FILE } from '../playwright.config';

export const PASSWORD = 'Sehr-sicheres-Passwort-42';

export function uniq(label: string) {
  return `${label}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Wartet auf die letzte Mail an `to` und liefert den ersten Link, der `contains` enthält. */
export async function mailLink(to: string, contains: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      () => {
        const mails = readFileSync(MAIL_FILE, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l) as { to: string; text: string })
          .filter((m) => m.to.includes(to));
        link = mails
          .at(-1)
          ?.text.match(/https?:\/\/\S+/g)
          ?.find((u) => u.includes(contains));
        return link;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return link!;
}

export async function register(page: Page, name: string, email: string, next?: string) {
  await page.goto(next ? `/register?next=${encodeURIComponent(next)}` : '/register');
  await page.fill('#name', name);
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.check('input[name=privacy]');
  await page.getByRole('button', { name: 'Konto erstellen' }).click();
  await page.waitForURL('**/verify-email');
  await page.goto(await mailLink(email, '/verify-email'));
}

export async function createTenant(page: Page, name: string): Promise<string> {
  await page.goto('/onboarding');
  await page.fill('#name', name);
  await page.getByRole('button', { name: 'Unternehmen anlegen' }).click();
  await page.waitForURL(/\/t\/[a-z0-9-]+$/);
  return new URL(page.url()).pathname.split('/')[2]!;
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 Stellen) – für den 2FA-Test. */
export function totp(base32Secret: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of base32Secret.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac('sha1', key).update(counter).digest();
  const offset = h[h.length - 1]! & 0xf;
  const code = (h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}
