import { NextRequest, NextResponse } from 'next/server';
import { forceCreditAllProfit } from '@/lib/profit-force';

// ★ CRITICAL FIX v7: Force dynamic — disable Next.js route cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 300; // 5 minutes max for large backfills

/**
 * GET /api/profit-force?key=NEXVO2024
 *
 * PUBLIC browser-triggerable endpoint that bypasses cron / PM2 / shell scripts
 * ENTIRELY. Runs INSIDE the Next.js process (which is guaranteed running on
 * nexvo.id), uses the SAME DB connection as the live site.
 *
 * What it does (in order):
 *   1. Run cleanupDuplicateProfits() — STEP 5 fixes drift (e.g. 68800 → 38400)
 *   2. Force-credit ALL missed profit for active investments
 *      — backfill weekdays missed since lastProfitDate (max 30 days)
 *      — credit today (force bypass — even on weekend)
 *   3. Force-credit ALL missed profit for standalone purchases
 *   4. Return JSON with detailed before/after balance report
 *
 * Usage (browser URL):
 *   https://nexvo.id/api/profit-force?key=NEXVO2024
 *   https://nexvo.id/api/profit-force?key=NEXVO2024&skipCleanup=true
 *
 * Auth:
 *   Simple shared key via ?key= param. Default key: NEXVO2024.
 *   Override via env FORCE_PROFIT_KEY (falls back to NEXVO2024).
 *
 * Safety:
 *   - Idempotent: atomic claim (updateMany WHERE lastProfitDate < today)
 *   - Cleanup ONLY REDUCES (never increases)
 *   - Each row wrapped in own try/catch — one failure doesn't block others
 */
function verifyKey(request: NextRequest): boolean {
  const expectedKey = process.env.FORCE_PROFIT_KEY || 'NEXVO2024';
  const url = new URL(request.url);
  const keyParam = url.searchParams.get('key');

  // Check ?key= query param
  if (keyParam && keyParam === expectedKey) return true;

  // Also check x-force-key header (for curl users)
  const headerKey = request.headers.get('x-force-key');
  if (headerKey && headerKey === expectedKey) return true;

  return false;
}

function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  if (!verifyKey(request)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Unauthorized — invalid or missing key',
        hint: 'Use ?key=NEXVO2024 (or set FORCE_PROFIT_KEY env var)',
      },
      { status: 401 },
    );
  }

  try {
    const url = new URL(request.url);
    const skipCleanup = url.searchParams.get('skipCleanup') === 'true';

    console.log(`[Profit Force API] 🚀 Triggered from ${request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'} — skipCleanup=${skipCleanup}`);

    const result = await forceCreditAllProfit({ skipCleanup });

    // ─── Build human-readable summary ───
    const cleanupLine = result.cleanup.ran
      ? (result.cleanup.report
          ? `Cleanup ran: ${result.cleanup.report.usersBalanceCorrected} users corrected, ${formatRupiahSimple(result.cleanup.report.totalBalanceCorrected)} drift removed`
          : `Cleanup failed: ${result.cleanup.error}`)
      : 'Cleanup skipped';

    const investmentLine = `Investments: ${result.investments.processed} credited (${formatRupiahSimple(result.investments.profitCredited)}), ${result.investments.skipped} skipped, ${result.investments.errors.length} errors`;
    const purchaseLine = `Purchases: ${result.purchases.processed} credited (${formatRupiahSimple(result.purchases.profitCredited)}), ${result.purchases.skipped} skipped, ${result.purchases.errors.length} errors`;

    // Top 5 users by profit credited
    const topUsers = result.userBalances.slice(0, 5).map(u => ({
      user: `${u.userCode} (${u.userName})`,
      before: formatRupiahSimple(u.beforeTotalProfit),
      after: formatRupiahSimple(u.afterTotalProfit),
      credited: formatRupiahSimple(u.profitCredited),
    }));

    return NextResponse.json(
      {
        success: true,
        message: `✅ Profit berhasil dikreditkan. ${investmentLine}. ${purchaseLine}. Total: ${formatRupiahSimple(result.totalProfitCredited)}.`,
        summary: {
          triggeredAt: result.triggeredAt,
          wibTime: result.wibTime,
          wibDateStr: result.wibDateStr,
          dayName: result.dayName,
          durationMs: result.durationMs,
          cleanupLine,
          investmentLine,
          purchaseLine,
          totalProfitCredited: result.totalProfitCredited,
          totalProfitCreditedFormatted: formatRupiahSimple(result.totalProfitCredited),
          totalMatchingCredited: result.totalMatchingCredited,
          totalMatchingCreditedFormatted: formatRupiahSimple(result.totalMatchingCredited),
          totalBackfillDays: result.totalBackfillDays,
          usersWithChange: result.userBalances.length,
          topUsers,
        },
        details: {
          cleanup: result.cleanup,
          investments: {
            ...result.investments,
            profitCreditedFormatted: formatRupiahSimple(result.investments.profitCredited),
            matchingCreditedFormatted: formatRupiahSimple(result.investments.matchingCredited),
          },
          purchases: {
            ...result.purchases,
            profitCreditedFormatted: formatRupiahSimple(result.purchases.profitCredited),
          },
          allUsersChanged: result.userBalances,
        },
        durationMs: Date.now() - startTime,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (error: any) {
    console.error('[Profit Force API] ❌ FATAL:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Force-profit failed',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/profit-force?key=NEXVO2024
 * Same as GET — accepts POST for flexibility (curl, admin dashboard fetch, etc.)
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
