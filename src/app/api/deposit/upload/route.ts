import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, access } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getUserFromRequest } from '@/lib/auth';

// Force dynamic — never cache this route
export const dynamic = 'force-dynamic';

// 8MB cap (but frontend compresses to <500KB before sending, so this is safety net)
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

// ★ v11 BULLETPROOF: Save to MULTIPLE absolute paths.
//   On VPS, process.cwd() might be /home/nexvo OR /home/nexvo/.next/standalone
//   depending on how PM2 starts Next.js. We save to ALL possible locations
//   so /api/files/[...path] can find the file regardless of cwd.
function getUploadDirs(): string[] {
  const dirs = new Set<string>();
  // 1. process.cwd()/uploads/proofs (dev sandbox + some VPS configs)
  dirs.add(path.join(process.cwd(), 'uploads', 'proofs'));
  // 2. /home/nexvo/uploads/proofs (VPS absolute — most reliable)
  dirs.add('/home/nexvo/uploads/proofs');
  // 3. /home/nexvo/public/uploads/proofs (served directly by Next.js static)
  dirs.add('/home/nexvo/public/uploads/proofs');
  // 4. standalone build dir (if exists)
  const standalone = path.join(process.cwd(), '.next', 'standalone', 'uploads', 'proofs');
  if (existsSync(path.dirname(path.dirname(standalone)))) dirs.add(standalone);
  return Array.from(dirs);
}

// GET — diagnostic endpoint. User can visit /api/deposit/upload in browser
// to verify the route is live + see which dirs are writable.
export async function GET(request: NextRequest) {
  const dirs = getUploadDirs();
  const dirStatus = await Promise.all(
    dirs.map(async (d) => {
      let exists = false;
      let writable = false;
      try {
        await mkdir(d, { recursive: true });
        exists = true;
        await access(d, 2); // W_OK
        writable = true;
      } catch {
        writable = false;
      }
      return { dir: d, exists, writable };
    })
  );
  return NextResponse.json({
    success: true,
    route: '/api/deposit/upload',
    version: 'DEPOSIT-UPLOAD-V11-BULLETPROOF',
    cwd: process.cwd(),
    maxSize: `${MAX_FILE_SIZE} bytes (${MAX_FILE_SIZE / 1024 / 1024}MB)`,
    allowedTypes: ALLOWED_TYPES,
    dirs: dirStatus,
    instructions: 'POST multipart/form-data with field "file" + Authorization: Bearer <token>',
  });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
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
      console.warn('[DEPOSIT-UPLOAD] No file in formData. Keys:', Array.from(formData.keys()));
      return NextResponse.json(
        { success: false, error: 'File bukti transfer tidak ditemukan.' },
        { status: 400 }
      );
    }

    console.log(`[DEPOSIT-UPLOAD] User ${user.userId} uploading ${file.name} (${file.size} bytes, type=${file.type})`);

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File terlalu besar (${(file.size/1024/1024).toFixed(1)}MB). Maks 8MB. Kompres gambar lalu coba lagi.` },
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
        { success: false, error: `Tipe file tidak diizinkan (${file.type}). Hanya JPG, PNG, WebP, GIF.` },
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

    const writeResults: Array<{ dir: string; ok: boolean; error?: string }> = [];
    let writtenAtLeastOnce = false;

    for (const dir of dirs) {
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, filename), buffer);
        writtenAtLeastOnce = true;
        writeResults.push({ dir, ok: true });
      } catch (err) {
        writeResults.push({ dir, ok: false, error: (err as Error)?.message?.substring(0, 100) });
      }
    }

    console.log(`[DEPOSIT-UPLOAD] Write results for ${filename}:`, writeResults);

    if (!writtenAtLeastOnce) {
      console.error('[DEPOSIT-UPLOAD] All dirs failed:', writeResults);
      return NextResponse.json(
        {
          success: false,
          error: 'Server tidak bisa menyimpan file. Cek permission folder uploads/.',
          debug: writeResults,
        },
        { status: 500 }
      );
    }

    // URL served via /api/files/[...path] route (checks uploads/ + public/ + /home/nexvo/...)
    const url = `/api/files/proofs/${filename}`;
    const elapsed = Date.now() - startTime;

    console.log(`[DEPOSIT-UPLOAD] ✅ Success: ${filename} (${file.size} bytes, ${elapsed}ms, wrote to ${writeResults.filter(r => r.ok).length}/${dirs.length} dirs)`);

    return NextResponse.json({
      success: true,
      data: { url, filename, size: file.size, originalName: file.name },
      message: 'Bukti transfer berhasil diunggah.',
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[DEPOSIT-UPLOAD] ❌ Error after ${elapsed}ms:`, error);
    return NextResponse.json(
      {
        success: false,
        error: 'Server error saat upload. Coba lagi atau hubungi admin.',
        debug: (error as Error)?.message?.substring(0, 200),
      },
      { status: 500 }
    );
  }
}
