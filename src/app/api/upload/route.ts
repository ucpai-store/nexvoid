import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';

/**
 * POST /api/upload
 *
 * Generic admin file upload (used by AdminPaymentPage for QR codes & icons).
 * Accepts multipart/form-data with field name "file".
 * Saves to uploads/ + public/ (+ standalone copies if they exist) so the
 * file survives Next.js rebuilds. Returns the serving URL via /api/files/.
 *
 * Auth: requires admin bearer token.
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

// Directories to write to so the file is reachable from /api/files/
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
        { success: false, error: 'File tidak ditemukan (field: file)' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File terlalu besar (maks 10MB)' },
        { status: 400 }
      );
    }

    // Validate file type — accept by MIME or extension as fallback
    const ext = path.extname(file.name).toLowerCase();
    const allowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    if (!ALLOWED_TYPES.includes(file.type) && !allowedExt.includes(ext)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Tipe file tidak diizinkan (hanya JPG, PNG, GIF, WebP, SVG)',
        },
        { status: 400 }
      );
    }

    // Generate unique filename with safe extension
    const safeExt = allowedExt.includes(ext) ? ext : '.png';
    const filename = `upload-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}${safeExt}`;

    // Ensure all upload directories exist and save to all of them
    const allDirs = getAllUploadDirs();
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let savedTo: string[] = [];
    for (const dir of allDirs) {
      try {
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
        }
        await writeFile(path.join(dir, filename), buffer);
        savedTo.push(dir);
      } catch {
        // Non-critical — some directories might not be writable
      }
    }

    if (savedTo.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Gagal menyimpan file ke disk' },
        { status: 500 }
      );
    }

    // Serving URL — /api/files/ reads from uploads/ + public/ + standalone
    const url = `/api/files/${filename}`;
    const filePath = `/api/files/${filename}`;

    await logAdminAction(
      admin.id,
      'UPLOAD_FILE',
      `Uploaded file: ${file.name} → ${url} (${file.size} bytes)`
    );

    return NextResponse.json({
      success: true,
      data: {
        url,
        filePath,
        filename,
        originalName: file.name,
        size: file.size,
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
