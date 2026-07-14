import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

/**
 * Generic file upload endpoint for admin (QR images, icons, banners, etc).
 *
 * Frontend (AdminPaymentPage, etc) calls this with:
 *   formData.append('file', file)
 * and expects:
 *   { success: true, data: { url: '/api/files/<filename>' } }
 *
 * Files are saved to BOTH `uploads/` and `public/` (plus standalone variants
 * when present) so they survive `next build` rebuilds on the VPS — same
 * resilience strategy used by /api/admin/logo.
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

// Multiple directories to ensure uploads persist across rebuilds
const UPLOAD_DIRS = [
  path.join(process.cwd(), 'uploads'),
  path.join(process.cwd(), 'public'),
];

// Also try the standalone directory if it exists (production build)
const STANDALONE_DIRS = [
  path.join(process.cwd(), '.next', 'standalone', 'uploads'),
  path.join(process.cwd(), '.next', 'standalone', 'public'),
];

function getAllUploadDirs(): string[] {
  const dirs = [...UPLOAD_DIRS];
  for (const dir of STANDALONE_DIRS) {
    if (existsSync(path.dirname(dir))) {
      dirs.push(dir);
    }
  }
  return dirs;
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File tidak ditemukan' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File terlalu besar (maks 5MB)' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tipe file tidak diizinkan (hanya JPG, PNG, GIF, WebP, SVG)',
        },
        { status: 400 }
      );
    }

    // Generate unique filename with prefix based on intended use
    // (we can't know the use-case here, so use generic "upload-" prefix)
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const filename = `upload-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    // Ensure all upload directories exist and save to all of them
    const allDirs = getAllUploadDirs();
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let savedCount = 0;
    for (const dir of allDirs) {
      try {
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
        }
        await writeFile(path.join(dir, filename), buffer);
        savedCount++;
      } catch {
        // Non-critical - some directories might not be writable
      }
    }

    if (savedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Gagal menyimpan file ke disk' },
        { status: 500 }
      );
    }

    // Return path served through /api/files/ (matches getFileUrl helper logic)
    const fileUrl = `/api/files/${filename}`;

    await logAdminAction(
      admin.id,
      'UPLOAD_FILE',
      `Uploaded file: ${filename} (${file.type}, ${file.size} bytes)`
    );

    return NextResponse.json({
      success: true,
      data: {
        url: fileUrl,
        filePath: fileUrl,
        filename,
        size: file.size,
        type: file.type,
      },
      message: 'File berhasil diunggah',
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal mengunggah file' },
      { status: 500 }
    );
  }
}
