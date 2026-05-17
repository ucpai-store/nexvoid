import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';
import { db } from '@/lib/db';
import { writeFile, unlink, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

// Multiple directories to ensure logo persists across rebuilds
const UPLOAD_DIRS = [
  path.join(process.cwd(), 'uploads'),
  path.join(process.cwd(), 'public'),
];

// Also try the standalone directory if it exists
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
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('logo') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'File logo tidak ditemukan' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File terlalu besar (maks 5MB)' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'Tipe file tidak diizinkan (hanya JPG, PNG, GIF, WebP, SVG)' }, { status: 400 });
    }

    // Get old logo and delete from filesystem if it's a local file
    const oldSetting = await db.systemSettings.findUnique({
      where: { key: 'site_logo' },
    });
    if (oldSetting?.value && !oldSetting.value.startsWith('https://') && !oldSetting.value.startsWith('http://')) {
      // Try to delete old file from all directories
      try {
        const oldFilename = oldSetting.value.replace(/^\/api\/files\//, '').replace(/^\//, '');
        for (const dir of getAllUploadDirs()) {
          const oldFilePath = path.join(dir, oldFilename);
          if (existsSync(oldFilePath)) {
            try { await unlink(oldFilePath); } catch { /* non-critical */ }
          }
        }
      } catch {
        // Non-critical - old file may already be deleted
      }
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'png';
    const filename = `site-logo-${Date.now()}.${ext}`;

    // Ensure all upload directories exist and save to all of them
    const allDirs = getAllUploadDirs();
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    for (const dir of allDirs) {
      try {
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
        }
        await writeFile(path.join(dir, filename), buffer);
      } catch {
        // Non-critical - some directories might not be writable
      }
    }

    // Store the path in SystemSettings (using /api/files/ prefix for serving)
    const logoPath = `/api/files/${filename}`;

    await db.systemSettings.upsert({
      where: { key: 'site_logo' },
      update: { value: logoPath },
      create: { key: 'site_logo', value: logoPath },
    });

    // Also update site_favicon so the browser tab icon matches the new logo
    await db.systemSettings.upsert({
      where: { key: 'site_favicon' },
      update: { value: logoPath },
      create: { key: 'site_favicon', value: logoPath },
    });

    // Log admin action
    await logAdminAction(admin.id, 'UPDATE_LOGO', `Logo website diperbarui: ${logoPath}`);

    return NextResponse.json({
      success: true,
      data: { url: logoPath },
      message: 'Logo website berhasil diperbarui',
    });
  } catch (error) {
    console.error('Logo upload error:', error);
    return NextResponse.json({ success: false, error: 'Gagal mengunggah logo' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Get current logo setting
    const logoSetting = await db.systemSettings.findUnique({
      where: { key: 'site_logo' },
    });

    // Delete the current uploaded logo file
    if (logoSetting?.value && !logoSetting.value.endsWith('/nexvo-logo.png') && !logoSetting.value.endsWith('/api/files/nexvo-logo.png')) {
      const filename = logoSetting.value.replace(/^\/api\/files\//, '').replace(/^\//, '');
      for (const dir of getAllUploadDirs()) {
        const filePath = path.join(dir, filename);
        if (existsSync(filePath)) {
          try { await unlink(filePath); } catch { /* non-critical */ }
        }
      }
    }

    // THOROUGH CLEANUP: Scan ALL upload directories for ANY site-logo-* files and delete them
    // This ensures no leftover uploaded logo files remain anywhere
    const allDirs = getAllUploadDirs();
    let deletedCount = 0;
    for (const dir of allDirs) {
      if (!existsSync(dir)) continue;
      try {
        const files = await readdir(dir);
        for (const file of files) {
          // Match any site-logo-*.png, site-logo-*.jpg, site-logo-*.jpeg, site-logo-*.gif, site-logo-*.webp, site-logo-*.svg
          if (file.startsWith('site-logo-') && file !== 'nexvo-logo.png') {
            const filePath = path.join(dir, file);
            try {
              await unlink(filePath);
              deletedCount++;
              console.log(`[DELETE_LOGO] Deleted leftover file: ${filePath}`);
            } catch {
              // Non-critical - file might be locked
            }
          }
        }
      } catch {
        // Non-critical - directory might not be readable
      }
    }
    console.log(`[DELETE_LOGO] Cleaned up ${deletedCount} leftover site-logo files`);

    // Reset site_logo to default
    await db.systemSettings.upsert({
      where: { key: 'site_logo' },
      update: { value: '/api/files/nexvo-logo.png' },
      create: { key: 'site_logo', value: '/api/files/nexvo-logo.png' },
    });

    // Reset site_favicon to default
    await db.systemSettings.upsert({
      where: { key: 'site_favicon' },
      update: { value: '/api/files/nexvo-logo.png' },
      create: { key: 'site_favicon', value: '/api/files/nexvo-logo.png' },
    });

    // Also check and reset site_dark_logo if it exists
    const darkLogoSetting = await db.systemSettings.findUnique({
      where: { key: 'site_dark_logo' },
    });
    if (darkLogoSetting && !darkLogoSetting.value.endsWith('/nexvo-logo.png') && !darkLogoSetting.value.endsWith('/api/files/nexvo-logo.png')) {
      const darkFilename = darkLogoSetting.value.replace(/^\/api\/files\//, '').replace(/^\//, '');
      for (const dir of allDirs) {
        const filePath = path.join(dir, darkFilename);
        if (existsSync(filePath)) {
          try { await unlink(filePath); } catch { /* non-critical */ }
        }
      }
      await db.systemSettings.upsert({
        where: { key: 'site_dark_logo' },
        update: { value: '/api/files/nexvo-logo.png' },
        create: { key: 'site_dark_logo', value: '/api/files/nexvo-logo.png' },
      });
    }

    // Log admin action
    await logAdminAction(admin.id, 'DELETE_LOGO', `Logo website dihapus dan dikembalikan ke default. ${deletedCount} file sisa dibersihkan.`);

    return NextResponse.json({
      success: true,
      data: { url: '/api/files/nexvo-logo.png' },
      message: `Logo berhasil dihapus dan dikembalikan ke default! ${deletedCount} file sisa dibersihkan.`,
    });
  } catch (error) {
    console.error('Logo delete error:', error);
    return NextResponse.json({ success: false, error: 'Gagal menghapus logo' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const setting = await db.systemSettings.findUnique({
      where: { key: 'site_logo' },
    });

    return NextResponse.json({
      success: true,
      data: { url: setting?.value || '/api/files/nexvo-logo.png' },
    });
  } catch (error) {
    console.error('Get logo error:', error);
    return NextResponse.json({ success: false, error: 'Gagal mengambil logo' }, { status: 500 });
  }
}
