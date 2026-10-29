import { NextResponse } from 'next/server';
import { COOKIE, verifySession } from './lib/session';

// The login cookie only works over HTTPS. fluidcanvas.net has no certificate yet, so every visit to it is
// plain http and people would be logged out on the next click. Until the certificate is issued, send those
// visits to the secure Netlify address. Empty this list once https://fluidcanvas.net works.
const NOT_YET_SECURE = ['fluidcanvas.net', 'www.fluidcanvas.net'];
const SECURE_ORIGIN = 'https://storesync-daily.netlify.app';

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  if (NOT_YET_SECURE.includes(host)) return NextResponse.redirect(`${SECURE_ORIGIN}${pathname}${search}`, 302);
  if (pathname.startsWith('/login')) return NextResponse.next();
  const ok = await verifySession(req.cookies.get(COOKIE)?.value);
  if (!ok) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|api/health|api/cron).*)'],
};
