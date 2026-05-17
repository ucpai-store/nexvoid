import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Force no-cache on HTML pages to prevent stale client-side JS
  // after deployments (fixes "Failed to find Server Action" errors)
  const url = request.nextUrl;
  const isStatic = url.pathname.startsWith('/_next/static/');

  if (!isStatic) {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|files|icon|manifest|sw.js|apple-touch|favicon).*)',
  ],
};
