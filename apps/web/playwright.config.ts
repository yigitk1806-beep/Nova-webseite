import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const PORT = 3100;
export const MAIL_FILE = resolve(import.meta.dirname, 'e2e', '.mail', 'mails.jsonl');

/**
 * End-to-End-Tests gegen den Produktions-Build (`pnpm build` vorher).
 * E-Mails gehen per echtem SMTP an einen lokalen Empfänger (e2e/smtp-sink.ts).
 * Voraussetzung: migrierte Datenbank und Redis (siehe README).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: `tsx e2e/smtp-sink.ts ${MAIL_FILE}`,
      port: 2525,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm start',
      port: PORT,
      reuseExistingServer: false,
      env: {
        PORT: String(PORT),
        APP_URL: `http://localhost:${PORT}`,
        SMTP_URL: 'smtp://localhost:2525',
        LOG_LEVEL: 'warn',
      },
    },
  ],
});
