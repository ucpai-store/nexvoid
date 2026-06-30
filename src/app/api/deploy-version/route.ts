import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ★★★ Version marker — bump on every fix. Used to verify the VPS is running
//   the latest code. Visit https://nexvo.id/api/deploy-version to check.
//   v12 (20250630): STANDALONE server fix — deploy script now uses
//     `node .next/standalone/server.js` instead of `next start` (which
//     Next.js explicitly warns "does not work with output: standalone").
//     This was the ROOT CAUSE of "hasilnya sama" after deploy — old code
//     kept running because `next start` doesn't properly serve standalone builds.
//   v11 (20250630): add /api/deposit/upload route + base64 proof storage.
export const VERSION_MARKER = 'STANDALONE-SERVER-FIX-V12-20250630';
export const CRON_VERSION = 'v2.5-bulletproof';

export async function GET() {
  let buildId = 'unknown';
  let builtAt = 'unknown';
  let gitCommit = 'unknown';
  let gitDate = 'unknown';

  try {
    const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
    if (fs.existsSync(buildIdPath)) {
      buildId = fs.readFileSync(buildIdPath, 'utf8').trim();
    }
  } catch {}

  try {
    const buildManifestPath = path.join(process.cwd(), '.next', 'build-manifest.json');
    if (fs.existsSync(buildManifestPath)) {
      const stat = fs.statSync(buildManifestPath);
      builtAt = stat.mtime.toISOString();
    }
  } catch {}

  try {
    gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    gitDate = execSync('git log -1 --format=%cI', { encoding: 'utf8' }).trim();
  } catch {}

  return NextResponse.json({
    versionMarker: VERSION_MARKER,
    cronVersion: CRON_VERSION,
    description: 'PROFIT BULLETPROOF v10 — Investment loop pakai endDate (bukan status filter) + Purchase loop credit via Purchase path jika linked Investment gak dikredit hari ini. Mirror admin v2.5 yang sudah terbukti jalan.',
    buildId,
    builtAt,
    gitCommit,
    gitDate,
    serverTime: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development',
    fixes: [
      'cron-service.ts v2.5: Investment loop buang status=active filter, pakai endDate > wibNow (mirror admin /api/admin/profit-trigger v2.5 yang SUDAH TERBUKTI JALAN)',
      'cron-service.ts v2.5: Purchase loop — kalo linked Investment gak dikredit hari ini, CREDIT via Purchase path (jangan skip! itulah penyebab profit gak masuk)',
      'cron-service.ts v2.5: hasProfitBeenCreditedToday() pakai endDate filter juga (status endpoint akurat)',
      'force-credit-profit.ts: same v2.5 bulletproof fixes',
      'v2.4 fix retained: standalone purchases get full credit (balance + BonusLog + ProfitLog + LiveActivity + matching bonus)',
    ],
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
