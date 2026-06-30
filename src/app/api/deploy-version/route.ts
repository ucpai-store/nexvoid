import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ★★★ Version marker — bump on every fix. Used to verify the VPS is running
//   the latest code. Visit https://nexvo.id/api/deploy-version to check.
//   v19 (20250630): PROFIT CLEANUP v3.0 — use lastProfitDate as ground truth.
//     ROOT CAUSE of "profit masih lebih" setelah v2.9.1:
//       STEP 2 cleanup pakai `today` sebagai end date untuk hitung expected profit.
//       Tapi kalo `lastProfitDate` = KEMARIN (hari ini belum di-credit), expected
//       INCLUDES today → excess entry dari bug (e.g. purchase-day credit) nggak
//       ke-detect karena expected inflated oleh today's (uncredited) day.
//     Contoh: Beli Senin. Hari ini Rabu. lastProfitDate = Selasa.
//       v2.9.1: expected = countCreditedDays(Sen, Rabu) × dp = 2 × 19200 = 38400
//               BonusLog = 38400 (entry Sen bug + entry Sel) → NO excess detected!
//       v3.0:   expected = countCreditedDays(Sen, Selasa) × dp = 1 × 19200 = 19200
//               BonusLog = 38400 → excess = 19200 → TRIM entry Sen! ✓
//     v3.0 FIX:
//     (a) STEP 2: endWIB = lastProfitDate (bukan today). Kalo lastProfitDate=null,
//         expected = 0 (never credited → any totalProfitEarned > 0 is a bug).
//     (b) STEP 3: Purchase standalone juga pakai lastProfitDate (bukan today).
//     (c) STEP 4: safeguard update — skip hanya jika user NGGAK punya investment
//         sama sekali (bukan expected=0). Kalo user punya investment tapi
//         expected=0 (lastProfitDate=null), profit logs adalah bug → TRIM.
//   v18 (20250630): UNIFIED PROFIT CREDIT — fix "2 hari kerja masuk 3" root cause.
export const VERSION_MARKER = 'PROFIT-CLEANUP-V3.0-20250630';
export const CRON_VERSION = 'v3.0-lastProfitDate-ground-truth';

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
    description: 'v19 PROFIT CLEANUP v3.0 (lastProfitDate ground truth — fix excess profit nggak ke-detect). v18 UNIFIED PROFIT CREDIT. v17 DOUBLE-PROFIT FIX.',
    buildId,
    builtAt,
    gitCommit,
    gitDate,
    serverTime: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development',
    fixes: [
      'v19: profit-cleanup.ts STEP 2 endWIB = lastProfitDate (bukan today) — expected = ACTUAL credited days',
      'v19: profit-cleanup.ts STEP 3 Purchase standalone juga pakai lastProfitDate (bukan today)',
      'v19: profit-cleanup.ts STEP 4 safeguard: skip hanya jika user NGGAK punya investment (bukan expected=0)',
      'v19: profit-cleanup.ts STEP 4: user dengan investment tapi lastProfitDate=null → trim semua profit logs (bug)',
      'v18: /api/cron/profit/route.ts ATOMIC CLAIM (updateMany WHERE lastProfitDate < today) — was findUnique+compare (RACE)',
      'v18: /api/admin/profit-trigger/route.ts ATOMIC CLAIM (non-force mode) — was findUnique+compare (RACE)',
      'v18: Backfill logic KONSISTEN di 3 sumber: missedDays EXCLUDES today + totalDays = missedDays + (today weekday ? 1 : 0)',
      'v18: dailyProfit pakai inv.dailyProfit stored (BUKAN recompute dari package.profitRate) — fix VIP purchases',
      'v18: Purchase loop hapus double-update Purchase.profitEarned untuk linked purchases (Investment loop sudah sync)',
      'v18: Purchase legacy path juga atomic claim (race-proof)',
      'v17: cron-service v2.7 ATOMIC CLAIM — conditional updateMany WHERE lastProfitDate IS NULL OR < today (100% race-proof)',
      'v17: cron-service v2.7 PID FILE LOCK — exit if another instance running (prevent PM2 duplicates)',
      'v17: loadOrderedTiers() return ALL packages + isAvailable flag (mirror V16 /api/packages)',
      'v17: PaketPage merge sync isAvailable/availabilityReason from tiers (defense in depth)',
      'v16: /api/packages GET tampilkan SEMUA paket (no filter isActive=true) + isAvailable field',
      'v16: PaketPage.tsx badge TIDAK TERSEDIA + tombol disabled untuk paket isActive=false',
      'v15: AssetPage countWeekdaysBetween INCLUSIVE end (cur <= end) — match cron crediting',
      'v15: getWeekdaysElapsed skip weekday purchase day (cron no immediate profit on purchase)',
      'v15: getWeekdaysInContract same skip rule (konsisten dengan getWeekdaysElapsed)',
      'v14: /api/products GET tampilkan SEMUA produk + computed isAvailable field',
      'v14: ProductsPage.tsx badge TIDAK TERSEDIA / DIHENTIKAN SEMENTARA / KUOTA PENUH + disable tombol beli',
      'v13: cron-service.ts v2.6 Purchase sync SET Purchase.profitEarned = sum(linked Investment.totalProfitEarned)',
      'v13: cron-service.ts v2.6 Startup self-heal reconcilePurchaseAndInvestmentProfits()',
      'v13: /api/assets route Math.max(Purchase.profitEarned, sum(Investment.totalProfitEarned)) defensive',
      'v12: deploy uses node .next/standalone/server.js (NOT next start — broken for standalone)',
      'v12: always fresh-copy .next/static to standalone (root cause JS 404)',
    ],
  }, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  });
}
