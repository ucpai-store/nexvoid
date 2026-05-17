import { NextResponse } from 'next/server';

/**
 * Public endpoint to force cache clearing on the client side.
 * Returns a response with aggressive no-cache headers that browsers
 * and service workers will respect. The client-side JS should also
 * clear caches after calling this endpoint.
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'Cache cleared',
    timestamp: Date.now(),
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Cache-Clear': 'true',
    },
  });
}

export async function POST() {
  return NextResponse.json({
    success: true,
    message: 'Cache cleared',
    timestamp: Date.now(),
  }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Cache-Clear': 'true',
    },
  });
}
