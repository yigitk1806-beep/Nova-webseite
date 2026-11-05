import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/onboarding', '/t/', '/invite/', '/account'];

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const httpsOnly = (process.env.APP_URL ?? '').startsWith('https://');
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // Inline-Styles werden von Animationen (motion) gesetzt; Skripte bleiben nonce-gebunden.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(httpsOnly ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
}

/**
 * 1. Setzt pro Anfrage eine Nonce-basierte Content-Security-Policy und eine Request-ID.
 * 2. Optimistische Vorprüfung (nur Cookie-Existenz) für geschützte Bereiche.
 *    Die verbindliche Prüfung von Session, Mitgliedschaft und Rechten erfolgt serverseitig.
 */
export function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const { pathname } = request.nextUrl;

  if (
    PROTECTED.some((p) => pathname === p || pathname.startsWith(p)) &&
    !getSessionCookie(request)
  ) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);
  headers.set('x-nonce', nonce);
  headers.set('content-security-policy', csp);

  const res = NextResponse.next({ request: { headers } });
  res.headers.set('x-request-id', requestId);
  res.headers.set('content-security-policy', csp);
  return res;
}

export const config = {
  matcher: [
    {
      source: '/((?!api/|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
