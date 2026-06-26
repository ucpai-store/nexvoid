import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getUserFromRequest, getAdminFromRequest } from '@/lib/auth';

// Max 10MB (covers avatars, banners, product images, payment logos, proof files)
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed image MIME types
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

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
    // ─── Auth: accept BOTH user and admin tokens ───
    // Try user first, fall back to admin (so admin pages using /api/upload also work)
    let user = await getUserFromRequest(request);
    let admin = null;
    if (!user) {
      admin = await getAdminFromRequest(request);
    }

    if (!user && !admin) {
      return NextResponse.json(
        { success: false, error: 'Sesi berakhir, silakan login ulang.' },
        { status: 401 }
      );
    }

    if (user?.isSuspended) {
      return NextResponse.json(
        { success: false, error: 'Akun dinonaktifkan.' },
        { status: 403 }
      );
    }
    // Users must be verified to upload (avoids spam from unverified accounts)
    if (user && !user.isVerified) {
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
        { success: false, error: 'File tidak ditemukan.' },
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
        { success: false, error: 'File terlalu besar (maks 10MB). Kompres gambar lalu coba lagi.' },
        { status: 400 }
      );
    }

    // ─── Validate file type ───
    let fileType = file.type;
    // Some browsers send empty MIME for SVG — detect by extension
    if (!fileType && file.name.toLowerCase().endsWith('.svg')) {
      fileType = 'image/svg+xml';
    }

    if (!ALLOWED_TYPES.includes(fileType)) {
      return NextResponse.json(
        { success: false, error: 'Tipe file tidak diizinkan (hanya JPG, PNG, WebP, GIF, SVG).' },
        { status: 400 }
      );
    }

    // ─── Determine file extension (safe, from MIME type, never trust user-supplied name) ───
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
    };
    const ext = extMap[fileType] || '.png';

    // ─── Generate unique filename: <prefix>-<timestamp>-<random>.<ext> ───
    const prefix = user ? `u-${user.id.slice(-6)}` : 'adm';
    const filename = `${prefix}-${Date.now()}-${randomId()}${ext}`;
    const imageUrl = `/api/files/${filename}`;
    const filePath = `/api/files/${filename}`; // alias for backward compat

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

    // ─── Write to all public dirs ───
    let written = false;
    for (const dir of dirs) {
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, filename), buffer);
        written = true;
      } catch {
        // ignore dir write errors
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
      data: {
        url: imageUrl,
        filePath, // alias for older code that reads data.filePath
        filename,
      },
      message: 'File berhasil diunggah.',
    });
  } catch (error) {
    console.error('Generic upload error:', error);
    return NextResponse.json(
      { success: false, error: 'Server error saat upload. Coba lagi atau hubungi admin.' },
      { status: 500 }
    );
  }
}
