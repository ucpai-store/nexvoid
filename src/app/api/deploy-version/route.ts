import { NextResponse } from 'next/server';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// ★ Deploy verification endpoint.
//   GET /api/deploy-version → returns build timestamp + git commit.
//
//   Cara pakai:
//     1. Setelah deploy, buka:  https://nexvo.id/api/deploy-version
//     2. Kalau "version" = PROFIT-FIX-V8-20250629 → code baru sudah aktif.
//     3. Kalau "version" beda / tidak ada → VPS masih jalanin code lama.

export const dynamic = 'force-dynamic';

export async function GET() {
  let builtAt: string | null = null;
  let buildId: string | null = null;

  try {
    const buildIdPath = join(process.cwd(), '.next', 'BUILD_ID');
    if (existsSync(buildIdPath)) {
      buildId = readFileSync(buildIdPath, 'utf8').trim();
      const stats = statSync(buildIdPath);
      builtAt = stats.mtime.toISOString();
    }
  } catch {
    // ignore
  }

  let gitCommit: string | null = null;
  let gitDate: string | null = null;
  try {
    gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8', timeout: 5000 }).trim();
    gitDate = execSync('git log -1 --format=%cI', { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    // .git tidak ada atau git tidak tersedia
  }

  const VERSION_MARKER = 'PROFIT-FIX-V8-20250629';

  return NextResponse.json(
    {
      success: true,
      version: VERSION_MARKER,
      builtAt,
      buildId,
      gitCommit,
      gitDate,
      serverTime: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV || 'unknown',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}
