import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminFromRequest } from '@/lib/auth';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const version = formData.get('version') as string | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'File APK wajib diupload' }, { status: 400 });
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'apk';
    const uniqueName = `apk-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

    // Ensure uploads directory exists
    if (!existsSync(UPLOADS_DIR)) {
      await mkdir(UPLOADS_DIR, { recursive: true });
    }

    // Save file to local filesystem
    const filePath = path.join(UPLOADS_DIR, uniqueName);
    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    // Get old active APK to delete its local file
    const oldApk = await db.apkFile.findFirst({ where: { isActive: true } });
    if (oldApk?.filePath) {
      // Delete old local file if it exists
      if (!oldApk.filePath.startsWith('https://') && !oldApk.filePath.startsWith('http://')) {
        try {
          const oldFilename = oldApk.filePath.startsWith('/') ? oldApk.filePath.slice(1) : oldApk.filePath;
          const oldFilePath = path.join(UPLOADS_DIR, oldFilename.replace(/^uploads\//, ''));
          if (existsSync(oldFilePath)) {
            await unlink(oldFilePath);
          }
        } catch {
          // Non-critical - old file may already be deleted
        }
      }
    }

    // Deactivate previous APKs
    await db.apkFile.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    // Store the path for serving via /api/files/
    const apkPath = `/api/files/${uniqueName}`;

    // Create new APK record
    const apk = await db.apkFile.create({
      data: {
        fileName: file.name,
        filePath: apkPath,
        version: version || '1.0.0',
        fileSize: file.size,
        isActive: true,
      },
    });

    return NextResponse.json({ success: true, data: apk });
  } catch (error) {
    console.error('Upload APK error:', error);
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server' }, { status: 500 });
  }
}
