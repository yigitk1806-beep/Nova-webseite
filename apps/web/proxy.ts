import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistische Vorprüfung (nur Cookie-Existenz) für geschützte Bereiche.
 * Die verbindliche Prüfung von Session, Mitgliedschaft und Rechten erfolgt serverseitig
 * in jedem Layout bzw. jeder Server Action.
 */
export function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  const headers = new Headers(request.headers);
  headers.set('x-request-id', requestId);

  if (!getSessionCookie(request)) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('x-request-id', requestId);
  return res;
}

export const config = {
  matcher: ['/onboarding/:path*', '/t/:path*', '/invite/:path*'],
};
