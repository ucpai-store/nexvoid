import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getUserFromRequest } from '@/lib/auth';

// Max 8MB (matches frontend validation in DepositPage.tsx)
const MAX_FILE_SIZE = 8 * 1024 * 1024;

// Allowed image MIME types (matches frontend validation)
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

// Use process.cwd() so this works on BOTH dev sandbox (/home/z/my-project)
// and production VPS (/home/nexvo/nexvo or ~/nexvo).
function getPublicDirs(): string[] {
  const dirs = [path.join(process.cwd(), 'public')];
  const standalonePublic = path.join(process.cwd(), '.next', 'standalone', 'public');
  if (existsSync(path.dirname(standalonePublic))) dirs.push(standalonePublic);
  return dirs;
}

// Random short suffix to avoid filename collisions
function randomId(len = 6): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

export async function POST(request: NextRequest) {
  try {
    // ─── Auth: must be a logged-in, verified, non-suspended user ───
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Sesi berakhir, silakan login ulang.' },
        { status: 401 }
      );
    }
    if (user.isSuspended) {
      return NextResponse.json(
        { success: false, error: 'Akun dinonaktifkan.' },
        { status: 403 }
      );
    }
    if (!user.isVerified) {
      return NextResponse.json(
        { success: false, error: 'Email belum diverifikasi.' },
        { status: 403 }
      );
    }

    // ─── Parse multipart form ───
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File bukti transfer tidak ditemukan.' },
        { status: 400 }
      );
    }

    // ─── Validate file size ───
    if (file.size === 0) {
      return NextResponse.json(
        { success: false, error: 'File kosong, silakan pilih ulang.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: 'File terlalu besar (maks 8MB). Kompres gambar lalu coba lagi.' },
        { status: 400 }
      );
    }

    // ─── Validate file type ───
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Tipe file tidak diizinkan (hanya JPG, PNG, WebP, GIF).' },
        { status: 400 }
      );
    }

    // ─── Determine file extension (safe, from MIME type, never trust user-supplied name) ───
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    const ext = extMap[file.type] || '.png';

    // ─── Generate unique filename: proof-<timestamp>-<random>.<ext> ───
    const filename = `proof-${Date.now()}-${randomId()}${ext}`;
    const imageUrl = `/api/files/${filename}`;

    // ─── Ensure public dirs exist ───
    const dirs = getPublicDirs();
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true }).catch(() => {});
      }
    }

    // ─── Convert File to Buffer ───
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // ─── Write to all public dirs (so it survives standalone build & rebuilds) ───
    let written = false;
    for (const dir of dirs) {
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, filename), buffer);
        written = true;
      } catch {
        // ignore dir write errors (e.g. standalone dir may not exist)
      }
    }

    if (!written) {
      return NextResponse.json(
        { success: false, error: 'Gagal menyimpan file ke server. Coba lagi.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { url: imageUrl, filename },
      message: 'Bukti transfer berhasil diunggah.',
    });
  } catch (error) {
    console.error('Deposit proof upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Server error saat upload. Coba lagi atau hubungi admin.' },
      { status: 500 }
    );
  }
}
