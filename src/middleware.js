import { NextResponse } from 'next/server';
import { COOKIE, verifySession } from './lib/session';

// The login cookie is "secure" (HTTPS only), so a page opened over plain http would log people out
// on the next click. Send any http visit to the secure address instead. SECURE_ORIGIN is set on Netlify
// (e.g. https://storesync-daily.netlify.app until fluidcanvas.net has its certificate, then https://fluidcanvas.net).
const SECURE_ORIGIN = (process.env.SECURE_ORIGIN || '').replace(/\/$/, '');

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
  const host = req.headers.get('host') || '';
  if (proto === 'http' && SECURE_ORIGIN && !/^(localhost|127\.0\.0\.1)(:|$)/.test(host)) {
    return NextResponse.redirect(`${SECURE_ORIGIN}${pathname}${search}`, 308);
  }
  if (pathname.startsWith('/login')) return NextResponse.next();
  const ok = await verifySession(req.cookies.get(COOKIE)?.value);
  if (!ok) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|api/health|api/cron).*)'],
};
