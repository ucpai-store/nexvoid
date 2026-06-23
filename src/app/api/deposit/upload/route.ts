import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

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

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (user.isSuspended) {
      return NextResponse.json({ success: false, error: 'Account suspended' }, { status: 403 });
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Format request tidak valid. Pastikan mengirim file dengan multipart/form-data.' },
        { status: 400 }
      );
    }
    const file = formData.get('file') as File | null;

    if (!file || file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'File bukti transfer tidak ditemukan. Pilih file gambar terlebih dahulu.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File terlalu besar (maks 8MB)' }, { status: 400 });
    }

    // Validate file type (by MIME and extension fallback)
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const validExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    if (!ALLOWED_TYPES.includes(file.type) && !validExt) {
      return NextResponse.json({ success: false, error: 'Tipe file tidak diizinkan (hanya JPG, PNG, GIF, WebP)' }, { status: 400 });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
      ? ext
      : (file.type.split('/')[1] || 'jpg');
    const filename = `proof-${timestamp}-${random}.${safeExt}`;

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

    return NextResponse.json({
      success: true,
      data: {
        url: `/api/files/${filename}`,
        filename,
        originalName: file.name,
        size: file.size,
      },
    });
  } catch (error) {
    console.error('Deposit proof upload error:', error);
    return NextResponse.json({ success: false, error: 'Gagal upload file. Silakan coba lagi.' }, { status: 500 });
  }
}
