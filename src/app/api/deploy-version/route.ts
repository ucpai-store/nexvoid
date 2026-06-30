import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ★★★ Version marker — bump on every fix. Used to verify the VPS is running
//   the latest code. Visit https://nexvo.id/api/deploy-version to check.
//   v14 (20250630): SHOW UNAVAILABLE PRODUCTS — paket 4/5/6 yang admin set
//     isActive=false atau isStopped=true TETAP muncul di web user, dengan
//     badge "TIDAK TERSEDIA" / "DIHENTIKAN SEMENTARA". Tombol beli di-disable.
//   v13 (20250630): PROFIT CONSISTENCY FIX — Asset total = History total.
//     Root cause: cron-service v2.5 had 2 silent bugs:
//     (1) Purchase sync only incremented Purchase.profitEarned by 1 day's
//         dailyProfit (not multi-day backfill) → drifted below sum(Investment.totalProfitEarned)
//     (2) Purchase path credit (when Investment loop skipped) updated
//         Purchase.profitEarned + BonusLog but NOT Investment.totalProfitEarned
//         → Asset page (uses Investment.totalProfitEarned) showed LESS than
//         History page (uses BonusLog sum).
//     Fix v2.6: Purchase sync SET Purchase.profitEarned = sum(linked Investment.totalProfitEarned).
//               Purchase path credit ALSO updates linked Investment.totalProfitEarned.
//               Startup self-heal reconciles historical drift.
//               Asset page uses Math.max(Purchase.profitEarned, sum(Investment.totalProfitEarned))
//               as defensive (should be equal after self-heal).
//               Progress display uses WEEKDAYS (Mon-Fri) since cron only credits weekdays.
//   v12 (20250630): STANDALONE server fix — deploy script now uses
//     `node .next/standalone/server.js` instead of `next start` (which
//     Next.js explicitly warns "does not work with output: standalone").
//     This was the ROOT CAUSE of "hasilnya sama" after deploy — old code
//     kept running because `next start` doesn't properly serve standalone builds.
//   v11 (20250630): add /api/deposit/upload route + base64 proof storage.
export const VERSION_MARKER = 'SHOW-UNAVAILABLE-PRODUCTS-V14-20250630';
export const CRON_VERSION = 'v2.6-profit-consistency';

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
    description: 'v14 SHOW UNAVAILABLE PRODUCTS — paket isActive=false/isStopped=true tetap tampil dengan badge. v13 PROFIT CONSISTENCY: Asset = History = BonusLog sum.',
    buildId,
    builtAt,
    gitCommit,
    gitDate,
    serverTime: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development',
    fixes: [
      'v14: /api/products GET tampilkan SEMUA produk (no filter isActive=true) + computed isAvailable field',
      'v14: /api/products POST validasi ketat — gak bisa beli isActive=false / isStopped=true (error spesifik per kondisi)',
      'v14: /api/products/tiers return semua produk + isAvailable flag',
      'v14: ProductsPage.tsx badge TIDAK TERSEDIA / DIHENTIKAN SEMENTARA / KUOTA PENUH + disable tombol beli',
      'v14: ProductsPage.tsx merge isAvailable dari tiers (real-time admin status)',
      'v13: cron-service.ts v2.6 Purchase sync SET Purchase.profitEarned = sum(linked Investment.totalProfitEarned)',
      'v13: cron-service.ts v2.6 Purchase path credit juga update linked Investment.totalProfitEarned',
      'v13: cron-service.ts v2.6 Startup self-heal reconcilePurchaseAndInvestmentProfits()',
      'v13: /api/assets route Math.max(Purchase.profitEarned, sum(Investment.totalProfitEarned)) defensive',
      'v13: AssetPage.tsx progress pakai WEEKDAYS + tampilkan "Profit Seharusnya" = weekdays_elapsed × dailyProfit',
    ],
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
