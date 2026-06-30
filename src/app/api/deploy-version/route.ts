import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ★★★ Version marker — bump on every fix. Used to verify the VPS is running
//   the latest code. Visit https://nexvo.id/api/deploy-version to check.
//   v18 (20250630): UNIFIED PROFIT CREDIT — fix "2 hari kerja masuk 3" root cause.
//     ROOT CAUSE: Ada 3 sumber kredit profit yang bisa bentrok:
//       (1) cron-service.ts v2.7 (Bun, port 3032) — sudah atomic claim ✓
//       (2) /api/cron/profit/route.ts (Next.js) — findUnique+compare (RACE)
//       (3) /api/admin/profit-trigger/route.ts — findUnique+compare (RACE)
//     Kalau 2 sumber jalan bareng (misal admin trigger + cron), keduanya baca
//     lastProfitDate lama, keduanya pass check, keduanya credit → OVER-CREDIT.
//     v18 FIX:
//     (a) /api/cron/profit/route.ts: ganti findUnique+compare dengan ATOMIC CLAIM
//         updateMany WHERE lastProfitDate IS NULL OR < today 00:00 WIB.
//         SQLite executes atomically — only 1 process wins, others get count=0.
//     (b) /api/admin/profit-trigger/route.ts: same atomic claim (non-force mode).
//         Force mode tetap bisa re-credit (admin override).
//     (c) Backfill logic di SEMUA 3 sumber sekarang KONSISTEN:
//         missedDays = countWeekdaysMissed(last, today) // EXCLUDES today
//         totalDays = missedDays + (isTodayWeekday ? 1 : 0) // ADD today
//         Sebelumnya admin trigger pakai countWeekdaysBetween (INCLUDES today)
//         lalu creditAmount = dailyProfit * missedDays — kalau dipanggil setelah
//         cron credit today, akan skip (good), TAPI kalau dipanggil SEBELUM cron,
//         akan credit today — lalu cron credit today again → DOUBLE.
//     (d) dailyProfit pakai inv.dailyProfit (stored value), BUKAN recompute dari
//         package.profitRate — fix VIP purchases (linked to _internal_default pkg).
//     (e) Purchase loop: hapus double-update Purchase.profitEarned untuk linked
//         purchases (Investment loop sudah sync). Hanya legacy standalone purchases
//         yang di-credit di Purchase loop, dengan atomic claim juga.
//   v17 (20250630): DOUBLE-PROFIT FIX + PAKET UNAVAILABLE ROBUSTNESS.
//     (1) cron-service v2.7 ATOMIC CLAIM — conditional updateMany with WHERE
//         clause `lastProfitDate IS NULL OR lastProfitDate < today 00:00 WIB`.
//         Old v2.6 used read-then-write inside transaction → 2 cron processes
//         could both read old value, both credit → DOUBLE PROFIT (2 hari masuk 3).
//         v2.7 fix: SQLite executes updateMany ATOMICALLY — only 1 process
//         can successfully update, others get count=0 and skip. 100% race-proof.
//     (2) cron-service v2.7 PID FILE LOCK — exit if another instance is running.
//         Prevents PM2 duplicate instances from causing double-profit.
//     (3) loadOrderedTiers() buang filter isActive=true — sekarang return SEMUA
//         paket + isAvailable flag (mirror V16 /api/packages). Sebelumnya,
//         /api/investments/tiers exclude paket 4/5/6 (isActive=false) → saat
//         PaketPage merge tier state, paket inactive gak dapat isAvailable flag
//         dari tiers → badge TIDAK TERSEDIA bisa hilang kalau /api/packages
//         response cached. v17: tier system konsisten dengan packages API.
//     (4) PaketPage merge sync isAvailable/availabilityReason dari tiers data
//         (defense in depth — 2 sumber data sama-sama bilang inactive).
//   v16 (20250630): PAKET UNAVAILABLE — /api/packages tampilkan SEMUA paket +
//     isAvailable flag, PaketPage badge TIDAK TERSEDIA + tombol disabled.
//   v15 (20250630): WEEKDAY OFF-BY-ONE FIX — Asset page "X hari kerja" match
//     cron exact. V13 pakai exclusive-end counting bikin pembelian weekend
//     tampil 1 hari lebih sedikit dari cron kredit. Fix: inclusive-end + skip
//     weekday purchase day (mirror cron logic).
//   v14 (20250630): SHOW UNAVAILABLE PRODUCTS — produk 4/5/6 inactive TETAP
//     muncul dengan badge TIDAK TERSEDIA / DIHENTIKAN SEMENTARA.
//   v13 (20250630): PROFIT CONSISTENCY FIX — Asset total = History total.
//   v12 (20250630): STANDALONE server fix — deploy uses node .next/standalone/server.js
//   v11 (20250630): add /api/deposit/upload route + base64 proof storage.
export const VERSION_MARKER = 'UNIFIED-PROFIT-V18-20250630';
export const CRON_VERSION = 'v2.8-unified-atomic-claim';

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
    description: 'v18 UNIFIED PROFIT CREDIT (3 sumber kredit profit semua atomic claim + backfill konsisten). v17 DOUBLE-PROFIT FIX. v16 PAKET UNAVAILABLE.',
    buildId,
    builtAt,
    gitCommit,
    gitDate,
    serverTime: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV || 'development',
    fixes: [
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
