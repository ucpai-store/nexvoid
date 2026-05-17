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

const VALID_SIZES = new Set(['72', '96', '128', '144', '152', '180', '192', '384', '512']);

// NEXVO dark theme background color
const ICON_BG = { r: 7, g: 11, b: 20, alpha: 255 }; // #070B14

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
  const filename = cleanPath.startsWith('/') ? cleanPath.slice(1) : filePath;

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
 * Resize an image buffer to a square PNG of the given size.
 * Uses "contain" mode with dark background so rectangular logos look good.
 */
async function resizeToSquare(buffer: Buffer, size: number): Promise<Buffer> {
  return sharp(buffer)
    .resize(size, size, {
      fit: 'contain',
      background: ICON_BG,
    })
    .png()
    .toBuffer();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ size: string }> }
) {
  try {
    const { size } = await params;

    // Validate size
    if (!VALID_SIZES.has(size)) {
      return NextResponse.json({ error: 'Invalid icon size' }, { status: 400 });
    }

    const sizeNum = parseInt(size, 10);

    // Get the site_logo from database
    const logoSetting = await db.systemSettings.findUnique({ where: { key: 'site_logo' } });
    const iconPath = logoSetting?.value || '/nexvo-logo.png';

    let imageBuffer = await readImageFile(iconPath);

    // Fallback: try to serve the static icon from public
    if (!imageBuffer) {
      const staticIconPath = path.join(PUBLIC_DIR, `icon-${size}x${size}.png`);
      if (existsSync(staticIconPath)) {
        imageBuffer = await readFile(staticIconPath);
      }
    }

    // Final fallback: serve default logo
    if (!imageBuffer) {
      const defaultPath = path.join(PUBLIC_DIR, 'nexvo-logo.png');
      if (existsSync(defaultPath)) {
        imageBuffer = await readFile(defaultPath);
      }
    }

    if (!imageBuffer) {
      return NextResponse.json({ error: 'Icon not found' }, { status: 404 });
    }

    // Resize to the requested square dimension
    const resizedBuffer = await resizeToSquare(imageBuffer, sizeNum);

    return new NextResponse(resizedBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Content-Length': resizedBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('PWA icon serve error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
