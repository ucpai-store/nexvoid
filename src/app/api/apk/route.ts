import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const apk = await db.apkFile.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!apk) {
      return NextResponse.json({ success: true, data: null });
    }

    // filePath stores the local path (e.g., /api/files/apk-xxx.apk) or legacy Vercel Blob URL
    const downloadUrl = apk.filePath.startsWith('https://')
      ? apk.filePath
      : apk.filePath.startsWith('/api/')
        ? apk.filePath
        : `/api/files/${apk.filePath}`;

    return NextResponse.json({
      success: true,
      data: {
        id: apk.id,
        fileName: apk.fileName,
        version: apk.version,
        fileSize: apk.fileSize,
        downloadUrl,
      },
    });
  } catch (error) {
    console.error('Get APK error:', error);
    return NextResponse.json({ success: true, data: null });
  }
}
