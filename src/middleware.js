import { NextResponse } from 'next/server';
import { COOKIE, verifySession } from './lib/session';

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login')) return NextResponse.next();
  const ok = await verifySession(req.cookies.get(COOKIE)?.value);
  if (!ok) return NextResponse.redirect(new URL('/login', req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|api/health).*)'],
};
