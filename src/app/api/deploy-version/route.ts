import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ★★★ Version marker — bump on every fix. Used to verify the VPS is running
//   the latest code. Visit https://nexvo.id/api/deploy-version to check.
export const VERSION_MARKER = 'CRON-PURCHASE-FIX-V9-20250629';
export const CRON_VERSION = 'v2.4';

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
    description: 'CRON PURCHASE FIX v9 — standalone purchases now get full profit credit (balance + BonusLog + ProfitLog + LiveActivity + matching) at 00:00 WIB',
    buildId,
    builtAt,
    gitCommit,
    gitDate,
    serverTime: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development',
    fixes: [
      'cron-service.ts purchase loop: now credits user.mainBalance/totalProfit + creates BonusLog(type=profit) + ProfitLog + LiveActivity + matching bonus for standalone purchases (no linked Investment)',
      'force-credit-profit.ts: same purchase-loop fix + fixed matching function crash (was using non-existent user.status field)',
      'hasProfitBeenCreditedToday(): now counts Purchases too (not just Investments)',
    ],
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
