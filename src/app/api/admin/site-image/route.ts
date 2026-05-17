import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';
import { db } from '@/lib/db';

const PUBLIC_DIR = '/home/z/my-project/public';
const STANDALONE_PUBLIC_DIR = '/home/z/my-project/.next/standalone/public';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
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

    // Ensure public directory exists
    if (!existsSync(PUBLIC_DIR)) {
      const { mkdir } = await import('fs/promises');
      await mkdir(PUBLIC_DIR, { recursive: true });
    }

    // Delete old image for this setting
    const oldSetting = await db.systemSettings.findUnique({
      where: { key: settingKey },
    });
    if (oldSetting?.value && oldSetting.value.startsWith('/site-')) {
      const oldFilename = oldSetting.value.split('/').pop();
      if (oldFilename) {
        for (const dir of [PUBLIC_DIR, STANDALONE_PUBLIC_DIR]) {
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
    const publicPath = `/${filename}`;
    const imageUrl = `/api/files/${filename}`;

    // Write file to public directories
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    for (const dir of [PUBLIC_DIR, STANDALONE_PUBLIC_DIR]) {
      if (existsSync(dir)) {
        await writeFile(path.join(dir, filename), buffer);
      }
    }

    // Store the public path in SystemSettings
    await db.systemSettings.upsert({
      where: { key: settingKey },
      update: { value: publicPath },
      create: { key: settingKey, value: publicPath },
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
