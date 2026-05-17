import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// Additional directories to check for files (resilience across rebuilds)
const EXTRA_DIRS = [
  path.join(process.cwd(), '.next', 'standalone', 'uploads'),
  path.join(process.cwd(), '.next', 'standalone', 'public'),
  '/home/nexvo/uploads',
  '/home/nexvo/public',
];

// All allowed file extensions (including APK, PDF, etc.)
const ALL_ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg',
  '.apk', '.pdf', '.zip', '.doc', '.docx', '.xls', '.xlsx',
]);

// MIME type mapping
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.apk': 'application/vnd.android.package-archive',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function findFile(filename: string): string | null {
  // Order of directories to check
  const searchDirs = [UPLOADS_DIR, PUBLIC_DIR, ...EXTRA_DIRS];

  for (const dir of searchDirs) {
    const filePath = path.join(dir, filename);
    // Security: ensure the resolved path is within the expected directory
    const resolved = path.resolve(filePath);
    const resolvedDir = path.resolve(dir);
    if (resolved.startsWith(resolvedDir) && existsSync(resolved)) {
      return resolved;
    }
  }

  return null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;

    if (!pathSegments || pathSegments.length === 0) {
      return NextResponse.json({ error: 'File path is required' }, { status: 400 });
    }

    // Reconstruct the file path from segments
    const filename = pathSegments.join('/');

    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('\\')) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    // Security: check file extension
    const ext = path.extname(filename).toLowerCase();
    if (!ALL_ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json({ error: 'File type not allowed' }, { status: 403 });
    }

    // Find the file across all possible directories
    const filePath = findFile(filename);

    if (!filePath) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const fileBuffer = await readFile(filePath);
    const fileStat = await stat(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Last-Modified': fileStat.mtime.toUTCString(),
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('File serve error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
