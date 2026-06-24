import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';
import { db } from '@/lib/db';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// FIX: use process.cwd() so this works on BOTH dev sandbox (/home/z/my-project)
// and production VPS (/home/nexvo/nexvo). Hardcoded paths broke image serving on VPS.
function getPublicDirs(): string[] {
  const dirs = [path.join(process.cwd(), 'public')];
  const standalonePublic = path.join(process.cwd(), '.next', 'standalone', 'public');
  if (existsSync(path.dirname(standalonePublic))) dirs.push(standalonePublic);
  return dirs;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

// Valid setting keys that can store image paths
const VALID_IMAGE_KEYS: Record<string, string> = {
  site_background: 'Background Halaman Utama',
  site_about_banner: 'Banner About/Narasi',
  site_login_background: 'Background Login',
  site_register_background: 'Background Register',
  site_favicon: 'Favicon',
  site_dashboard_banner: 'Banner Dashboard',
  site_product_banner: 'Banner Produk',
  site_deposit_banner: 'Banner Deposit',
  site_footer_banner: 'Banner Footer',
};

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const settingKey = formData.get('key') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'File gambar tidak ditemukan' }, { status: 400 });
    }

    if (!settingKey || !VALID_IMAGE_KEYS[settingKey]) {
      return NextResponse.json(
        { success: false, error: `Key tidak valid. Gunakan: ${Object.keys(VALID_IMAGE_KEYS).join(', ')}` },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File terlalu besar (maks 10MB)' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Tipe file tidak diizinkan (hanya JPG, PNG, GIF, WebP, SVG)' },
        { status: 400 }
      );
    }

    const dirs = getPublicDirs();

    // Ensure public directories exist
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true }).catch(() => {});
      }
    }

    // Delete old image for this setting
    const oldSetting = await db.systemSettings.findUnique({
      where: { key: settingKey },
    });
    if (oldSetting?.value) {
      const oldFilename = oldSetting.value.split('/').pop();
      if (oldFilename && oldFilename.startsWith('site-')) {
        for (const dir of dirs) {
          const oldFilePath = path.join(dir, oldFilename);
          if (existsSync(oldFilePath)) {
            try { await unlink(oldFilePath); } catch { /* non-critical */ }
          }
        }
      }
    }

    // Generate unique filename
    const ext = path.extname(file.name) || '.png';
    const filename = `site-${settingKey}-${Date.now()}${ext}`;
    const imageUrl = `/api/files/${filename}`;

    // Write file to public directories
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    for (const dir of dirs) {
      try {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, filename), buffer);
      } catch {
        // ignore dir write errors (e.g. standalone dir may not exist)
      }
    }

    // Store the served URL in SystemSettings (so /api/files/[...path] can serve it)
    await db.systemSettings.upsert({
      where: { key: settingKey },
      update: { value: imageUrl },
      create: { key: settingKey, value: imageUrl },
    });

    // Log admin action
    await logAdminAction(admin.id, 'UPDATE_SITE_IMAGE', `${VALID_IMAGE_KEYS[settingKey]} diperbarui: ${imageUrl}`);

    return NextResponse.json({
      success: true,
      data: { url: imageUrl, key: settingKey },
      message: `${VALID_IMAGE_KEYS[settingKey]} berhasil diperbarui`,
    });
  } catch (error) {
    console.error('Site image upload error:', error);
    return NextResponse.json({ success: false, error: 'Gagal mengunggah gambar' }, { status: 500 });
  }
}

// GET - retrieve all site image settings
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const keys = Object.keys(VALID_IMAGE_KEYS);
    const settings = await db.systemSettings.findMany({
      where: { key: { in: keys } },
    });

    const data: Record<string, string> = {};
    for (const s of settings) {
      data[s.key] = s.value;
    }

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Get site images error:', error);
    return NextResponse.json({ success: false, error: 'Gagal mengambil data' }, { status: 500 });
  }
}
