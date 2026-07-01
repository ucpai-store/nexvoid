import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['ws'],
  // REMOVED output: 'standalone' — was causing CSS 404 in production.
  // `next start` serves from .next/static/ directly. Standalone mode is only
  // needed for `node .next/standalone/server.js` (which we don't use).
  allowedDevOrigins: [
    '.space-z.ai',
    '127.0.0.1',
    'localhost',
  ],
  async headers() {
    return [
      // PWA manifest - allow caching for installability
      {
        source: '/manifest.webmanifest',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600',
          },
        ],
      },
      // Service Worker - always revalidate (never cache SW)
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
      // Static assets — REDUCED cache from 1 year immutable to 1 hour.
      // 1-year-immutable caused stale CSS when new deploy changed hash but
      // old SW/browser served cached version. 1 hour is safe + still fast.
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=3600, must-revalidate',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
