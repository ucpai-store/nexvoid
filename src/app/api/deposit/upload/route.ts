import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

/**
 * Deposit proof image upload.
 * Authenticated users only. Saves file to /uploads and returns a URL
 * that can be served via /api/files/[...path].
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Tidak terautentikasi' },
        { status: 401 }
      );
    }

    if (user.isSuspended) {
      return NextResponse.json(
        { success: false, error: 'Akun ditangguhkan' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File bukti transfer wajib diupload' },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Format file tidak didukung. Gunakan JPG, PNG, WebP, atau GIF.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File terlalu besar (maks 8MB)' },
        { status: 400 }
      );
    }

    // Ensure uploads directory exists
    if (!existsSync(UPLOADS_DIR)) {
      await mkdir(UPLOADS_DIR, { recursive: true });
    }

    // Generate unique filename: proof-{userId}-{timestamp}-{rand}.{ext}
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
    const uniqueName = `proof-${user.id}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${safeExt}`;

    const filePath = path.join(UPLOADS_DIR, uniqueName);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    // URL served via /api/files/[...path]/route.ts
    const url = `/api/files/${uniqueName}`;

    return NextResponse.json({
      success: true,
      data: {
        url,
        filePath: url,
        fileName: file.name,
        fileSize: file.size,
      },
      message: 'Bukti transfer berhasil diupload',
    });
  } catch (error) {
    console.error('Deposit proof upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Gagal upload bukti transfer. Silakan coba lagi.' },
      { status: 500 }
    );
  }
}
