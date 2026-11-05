import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'ONYX', template: '%s · ONYX' },
  description: 'ONYX – das KI-Betriebssystem für Unternehmen.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Nonce-CSP erfordert dynamisches Rendering, damit Next.js die Nonce je Anfrage einsetzt.
  await connection();
  return (
    <html lang="de">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
