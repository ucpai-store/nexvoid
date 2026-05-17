import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Get site settings for dynamic name and logo
    const settings = await db.systemSettings.findMany({
      where: {
        key: { in: ['site_name', 'site_logo'] },
      },
    });

    const data: Record<string, string> = {};
    for (const s of settings) {
      data[s.key] = s.value;
    }

    const siteName = data.site_name || 'NEXVO';
    const hasCustomLogo = !!data.site_logo;

    // If there's a custom logo, use the dynamic pwa-icon API
    // Otherwise fall back to static icons in public/
    const icons = hasCustomLogo
      ? [
          { src: `/api/pwa-icon/72?t=${Date.now()}`, sizes: '72x72', type: 'image/png' },
          { src: `/api/pwa-icon/96?t=${Date.now()}`, sizes: '96x96', type: 'image/png' },
          { src: `/api/pwa-icon/128?t=${Date.now()}`, sizes: '128x128', type: 'image/png' },
          { src: `/api/pwa-icon/144?t=${Date.now()}`, sizes: '144x144', type: 'image/png' },
          { src: `/api/pwa-icon/152?t=${Date.now()}`, sizes: '152x152', type: 'image/png' },
          { src: `/api/pwa-icon/192?t=${Date.now()}`, sizes: '192x192', type: 'image/png' },
          { src: `/api/pwa-icon/384?t=${Date.now()}`, sizes: '384x384', type: 'image/png' },
          { src: `/api/pwa-icon/512?t=${Date.now()}`, sizes: '512x512', type: 'image/png' },
          { src: `/api/pwa-icon/512?t=${Date.now()}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ]
      : [
          { src: '/icon-72x72.png', sizes: '72x72', type: 'image/png' },
          { src: '/icon-96x96.png', sizes: '96x96', type: 'image/png' },
          { src: '/icon-128x128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icon-144x144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icon-152x152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-384x384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ];

    const manifest = {
      name: `${siteName} - Digital Asset Management`,
      short_name: siteName,
      description: 'Build Value, Grow Future. A trusted global digital asset management platform based on commodities.',
      start_url: '/',
      display: 'standalone',
      background_color: '#070B14',
      theme_color: '#070B14',
      orientation: 'portrait-primary',
      scope: '/',
      lang: 'id',
      dir: 'ltr',
      categories: ['finance', 'business', 'investment'],
      icons,
      screenshots: [],
      prefer_related_applications: false,
    };

    return new NextResponse(JSON.stringify(manifest), {
      status: 200,
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('Manifest generation error:', error);

    // Fallback to basic manifest
    const fallbackManifest = {
      name: 'NEXVO - Digital Asset Management',
      short_name: 'NEXVO',
      description: 'Build Value, Grow Future. A trusted global digital asset management platform based on commodities.',
      start_url: '/',
      display: 'standalone',
      background_color: '#070B14',
      theme_color: '#070B14',
      orientation: 'portrait-primary',
      scope: '/',
      lang: 'id',
      icons: [
        { src: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
    };

    return new NextResponse(JSON.stringify(fallbackManifest), {
      status: 200,
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }
}
