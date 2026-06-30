import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getUserFromRequest } from '@/lib/auth';

// Force dynamic — never cache this route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Match frontend validation (8MB cap)
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// Save to multiple dirs for resilience across dev/prod (mirrors admin site-image pattern)
function getUploadDirs(): string[] {
  const dirs: string[] = [];
  const primary = path.join(process.cwd(), 'uploads', 'proofs');
  dirs.push(primary);
  const standalone = path.join(process.cwd(), '.next', 'standalone', 'uploads', 'proofs');
  if (existsSync(path.dirname(path.dirname(standalone)))) dirs.push(standalone);
  // VPS common location
  const vps = '/home/nexvo/uploads/proofs';
  dirs.push(vps);
  return dirs;
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Sesi berakhir, silakan login ulang.' },
        { status: 401 }
      );
    }
    if (user.isSuspended) {
      return NextResponse.json({ success: false, error: 'Akun suspended.' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file || typeof file === 'string') {
      return NextResponse.json(
        { success: false, error: 'File bukti transfer tidak ditemukan.' },
        { status: 400 }
      );
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File terlalu besar (maks 8MB). Kompres gambar lalu coba lagi.' },
        { status: 413 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'File kosong atau rusak. Pilih file lain.' },
        { status: 400 }
      );
    }

    // Validate type (check both MIME and extension for robustness)
    const ext = path.extname(file.name || '').toLowerCase() || '.png';
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.includes(ext)) {
      return NextResponse.json(
        { success: false, error: 'Tipe file tidak diizinkan (hanya JPG, PNG, WebP, GIF).' },
        { status: 400 }
      );
    }

    // Normalize extension if missing
    const safeExt = ALLOWED_EXTS.includes(ext) ? ext : '.png';

    // Generate unique filename — user-prefixed for traceability
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 10);
    const safeUserId = (user.userId || user.id || 'user').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
    const filename = `proof-${safeUserId}-${ts}-${rand}${safeExt}`;

    // Write to all target dirs
    const dirs = getUploadDirs();
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let writtenAtLeastOnce = false;
    for (const dir of dirs) {
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, filename), buffer);
        writtenAtLeastOnce = true;
      } catch {
        // ignore dir write errors (e.g. standalone dir may not exist)
      }
    }

    if (!writtenAtLeastOnce) {
      return NextResponse.json(
        { success: false, error: 'Server tidak bisa menyimpan file. Hubungi admin.' },
        { status: 500 }
      );
    }

    // The /api/files/[...path] route searches uploads/ dir, so URL is /api/files/proofs/{filename}
    const url = `/api/files/proofs/${filename}`;

    return NextResponse.json({
      success: true,
      data: { url, filename, size: file.size },
      message: 'Bukti transfer berhasil diunggah.',
    });
  } catch (error) {
    console.error('[DEPOSIT-UPLOAD-V1] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Server error saat upload. Coba lagi atau hubungi admin.' },
      { status: 500 }
    );
  }
}
