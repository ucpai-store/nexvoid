import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ★★★ Version marker — bump on every fix. Used to verify the VPS is running
//   the latest code. Visit https://nexvo.id/api/deploy-version to check.
//   v21 (20250630): PROFIT CLEANUP v3.2 — STEP 5: Direct User balance correction.
//     ROOT CAUSE of "saldo masih 68800 padahal cleanup v3.1 jalan":
//       STEP 4 compares BonusLog sum vs Investment.totalProfitEarned.
//       Kalau keduanya match (38400 = 38400) → STEP 4 skip → User.mainBalance drift TIDAK ke-detect!
//       Drift terjadi karena cleanup v2.9 lama HAPUS BonusLog tapi TIDAK refund User.mainBalance.
//       Hasil: Investment=38400, BonusLog=38400 (match), TAPI User.mainBalance=68800 (drift +30400).
//     v3.2 FIX: STEP 5 — compare User.totalProfit langsung dengan sum(BonusLog type='profit').
//       If User.totalProfit > sum(BonusLog) → drift → reduce BOTH User.totalProfit AND User.mainBalance.
//       ONLY REDUCE — never increase.
//   v20 (20250630): PROFIT CLEANUP v3.1 — remove dangerous STEP 1 dedup + add standalone Purchase to expected.
//     ROOT CAUSE of "profit masih salah" untuk user multi-paket:
//       STEP 1 dedup grouped by (userId, WIB day) and kept only LARGEST entry.
//       User dengan VIP1 (19200) + VIP2 (38400) credited same day → STEP 1
//       HAPUS entry VIP1 (keeps 38400) → user kehilangan 19200 dari history!
//       Selain itu, STEP 1 TIDAK refund balance → inconsistent.
//     ROOT CAUSE untuk user dengan standalone Purchase:
//       STEP 4 expected hanya sum(Investment.totalProfitEarned).
//       User dengan standalone Purchase (no linked Investment) → profit-nya
//       di-BonusLog tapi nggak dihitung di expected → STEP 4 wrongly trim!
//     v3.1 FIX:
//     (a) STEP 1: HAPUS dedup logic. Hanya count bonusLogBefore untuk report.
//         STEP 4 handle semua excess detection + deletion + balance correction.
//     (b) STEP 4: expected = sum(Investment.totalProfitEarned) + sum(standalone Purchase.profitEarned).
//         Standalone = Purchase tanpa linked Investment.
//     (c) STEP 4 safeguard: skip hanya jika user has NO investments AND NO standalone purchases.
//   v19 (20250630): PROFIT CLEANUP v3.0 — use lastProfitDate as ground truth.
export const VERSION_MARKER = 'PROFIT-CLEANUP-V3.2-20250630';
export const CRON_VERSION = 'v3.2-step5-direct-user-balance-correction';

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
    description: 'v21 PROFIT CLEANUP v3.2 (STEP 5 direct User balance correction — fix drift User.mainBalance). v20 v3.1 (remove STEP 1 dedup + standalone Purchase). v19 lastProfitDate ground truth.',
    buildId,
    builtAt,
    gitCommit,
    gitDate,
    serverTime: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development',
    fixes: [
      'v21: profit-cleanup.ts STEP 5 NEW — direct User balance correction from BonusLog ground truth',
      'v21: fix User.mainBalance drift (68800→38400) yang nggak ke-detect STEP 4 karena BonusLog==Investment match',
      'v20: profit-cleanup.ts STEP 1 HAPUS dedup (BUG: hapus entry legitimate user multi-paket) — STEP 4 handle semua',
      'v20: profit-cleanup.ts STEP 4 expected += sum(standalone Purchase.profitEarned) — fix user dengan standalone Purchase',
      'v20: profit-cleanup.ts STEP 4 safeguard: skip hanya jika NO investments AND NO standalone purchases',
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
