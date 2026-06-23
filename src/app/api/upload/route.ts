import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, getAdminFromRequest, logAdminAction } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

// Multiple directories to ensure file persists across rebuilds
function getAllUploadDirs(): string[] {
  const dirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'public'),
  ];
  const standaloneUploads = path.join(process.cwd(), '.next', 'standalone', 'uploads');
  const standalonePublic = path.join(process.cwd(), '.next', 'standalone', 'public');
  if (existsSync(path.dirname(standaloneUploads))) dirs.push(standaloneUploads);
  if (existsSync(path.dirname(standalonePublic))) dirs.push(standalonePublic);
  return dirs;
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || '';
}

export async function POST(request: NextRequest) {
  try {
    // Accept EITHER a valid user token OR a valid admin token
    const user = await getUserFromRequest(request);
    const admin = user ? null : await getAdminFromRequest(request);

    if (!user && !admin) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (user && user.isSuspended) {
      return NextResponse.json({ success: false, error: 'Account suspended' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'File tidak ditemukan' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File terlalu besar (maks 10MB)' }, { status: 400 });
    }

    // Validate file type (by MIME and extension fallback)
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
    if (!ALLOWED_TYPES.includes(file.type) && !validExt) {
      return NextResponse.json({ success: false, error: 'Tipe file tidak diizinkan (hanya JPG, PNG, GIF, WebP, SVG)' }, { status: 400 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)
      ? ext
      : (file.type.split('/')[1] || 'jpg');
    const filename = `upload-${timestamp}-${random}.${safeExt}`;

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save to all upload dirs (survives rebuilds)
    const dirs = getAllUploadDirs();
    await Promise.all(
      dirs.map(async (dir) => {
        try {
          await mkdir(dir, { recursive: true });
          await writeFile(path.join(dir, filename), buffer);
        } catch {
          // ignore dir write errors
        }
      })
    );

    // Log admin upload action
    if (admin) {
      await logAdminAction(admin.id, 'UPLOAD_FILE', `Uploaded ${filename} (${file.name}, ${file.size} bytes)`, getClientIp(request)).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: {
        url: `/api/files/${filename}`,
        filePath: `/api/files/${filename}`,
        filename,
        originalName: file.name,
        size: file.size,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, error: 'Gagal upload file. Silakan coba lagi.' }, { status: 500 });
  }
}
