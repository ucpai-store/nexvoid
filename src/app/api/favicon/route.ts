import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { db } from '@/lib/db';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Additional directories to check (resilience across rebuilds)
const EXTRA_DIRS = [
  path.join(process.cwd(), '.next', 'standalone', 'uploads'),
  path.join(process.cwd(), '.next', 'standalone', 'public'),
  '/home/nexvo/uploads',
  '/home/nexvo/public',
];

// NEXVO dark theme background color
const FAVICON_BG = { r: 7, g: 11, b: 20, alpha: 255 }; // #070B14

/**
 * Read an image file from multiple possible directories.
 * Returns the raw Buffer or null if not found.
 */
async function readImageFile(filePath: string): Promise<Buffer | null> {
  // Handle /api/files/ prefix
  let cleanPath = filePath;
  if (cleanPath.startsWith('/api/files/')) {
    cleanPath = cleanPath.replace('/api/files/', '');
  }

  // Remove leading slash for file system lookup
  const filename = cleanPath.startsWith('/') ? cleanPath.slice(1) : cleanPath;

  // Search order: uploads first, then public, then extra dirs
  const searchDirs = [UPLOADS_DIR, PUBLIC_DIR, ...EXTRA_DIRS];

  for (const dir of searchDirs) {
    const fullPath = path.join(dir, filename);
    const resolved = path.resolve(fullPath);
    const resolvedDir = path.resolve(dir);
    if (resolved.startsWith(resolvedDir) && existsSync(resolved)) {
      try {
        return await readFile(resolved);
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Resize an image buffer to a square PNG favicon.
 * Uses "contain" mode so the logo fits inside the square with dark background.
 */
async function resizeToFavicon(buffer: Buffer, size: number): Promise<Buffer> {
  return sharp(buffer)
    .resize(size, size, {
      fit: 'contain',
      background: FAVICON_BG,
    })
    .png()
    .toBuffer();
}

export async function GET(request: NextRequest) {
  try {
    // Check for site_favicon first, then fall back to site_logo
    const faviconSetting = await db.systemSettings.findUnique({ where: { key: 'site_favicon' } });
    const logoSetting = await db.systemSettings.findUnique({ where: { key: 'site_logo' } });

    const iconPath = faviconSetting?.value || logoSetting?.value || '/nexvo-logo.png';

    let imageBuffer = await readImageFile(iconPath);

    // Fallback to default nexvo-logo.png
    if (!imageBuffer) {
      const defaultPath = path.join(PUBLIC_DIR, 'nexvo-logo.png');
      if (existsSync(defaultPath)) {
        imageBuffer = await readFile(defaultPath);
      }
    }

    if (!imageBuffer) {
      return NextResponse.json({ error: 'No favicon found' }, { status: 404 });
    }

    // Resize to 32x32 square PNG for browser tab favicon
    const faviconBuffer = await resizeToFavicon(imageBuffer, 32);

    return new NextResponse(faviconBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Length': faviconBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Favicon serve error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
