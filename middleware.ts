import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isPublic = pathname.startsWith('/login') || pathname.startsWith('/api/auth') || pathname.startsWith('/_next') || pathname === '/favicon.ico' || pathname === '/icon.svg' || pathname === '/apple-icon.svg';
  if (!isLoggedIn && !isPublic) {
    const url = new URL('/login', req.nextUrl);
    return NextResponse.redirect(url);
  }
  if (isLoggedIn && pathname === '/login') {
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.svg).*)'],
};
