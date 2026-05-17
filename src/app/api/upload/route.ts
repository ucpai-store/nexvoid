import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, getUserFromRequest } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
];

// Primary upload directory - prefer the one that persists across rebuilds
function getPrimaryUploadDir(): string {
  // On VPS, prefer /home/nexvo/uploads which persists
  if (existsSync('/home/nexvo')) {
    return '/home/nexvo/uploads';
  }
  // Local dev: use project's uploads directory
  return path.join(process.cwd(), 'uploads');
}

// Additional directories to ensure files are accessible from file serving route
function getFallbackDirs(): string[] {
  const dirs: string[] = [];
  
  // VPS paths
  if (existsSync('/home/nexvo')) {
    dirs.push('/home/nexvo/public');
  }
  
  // Local/standalone paths
  dirs.push(path.join(process.cwd(), 'public'));
  
  // Standalone paths
  const standalonePath = path.join(process.cwd(), '.next', 'standalone');
  if (existsSync(standalonePath)) {
    dirs.push(path.join(standalonePath, 'uploads'));
    dirs.push(path.join(standalonePath, 'public'));
  }
  
  return dirs;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate: admin OR user (for deposit proof uploads)
    const admin = await getAdminFromRequest(request);
    const user = !admin ? await getUserFromRequest(request) : null;
    if (!admin && !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'File tidak ditemukan' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ success: false, error: 'File terlalu besar (maks 10MB)' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'Tipe file tidak diizinkan (hanya JPG, PNG, GIF, WebP, SVG, PDF)' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'png';
    const filename = `upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;

    // Get file buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save to primary directory first
    const primaryDir = getPrimaryUploadDir();
    let savedSuccessfully = false;
    let lastError: string = '';

    try {
      if (!existsSync(primaryDir)) {
        await mkdir(primaryDir, { recursive: true });
      }
      await writeFile(path.join(primaryDir, filename), buffer);
      savedSuccessfully = true;
      console.log(`[Upload] Saved to primary: ${path.join(primaryDir, filename)}`);
    } catch (err) {
      lastError = `Primary dir failed: ${primaryDir} - ${err}`;
      console.error(`[Upload] ${lastError}`);
    }

    // Also save to fallback directories for redundancy
    const fallbackDirs = getFallbackDirs();
    for (const dir of fallbackDirs) {
      try {
        if (!existsSync(dir)) {
          await mkdir(dir, { recursive: true });
        }
        await writeFile(path.join(dir, filename), buffer);
        console.log(`[Upload] Also saved to: ${path.join(dir, filename)}`);
      } catch (err) {
        console.warn(`[Upload] Failed to save to fallback dir: ${dir}`, err);
      }
    }

    if (!savedSuccessfully) {
      return NextResponse.json({ 
        success: false, 
        error: 'Gagal menyimpan file. Silakan coba lagi.',
        details: lastError 
      }, { status: 500 });
    }

    // Return the URL using /api/files/ prefix for serving
    const filePath = `/api/files/${filename}`;

    return NextResponse.json({
      success: true,
      data: {
        url: filePath,
        filePath: filePath,
        filename: filename,
      },
      message: 'File berhasil diupload',
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Gagal mengunggah file',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
