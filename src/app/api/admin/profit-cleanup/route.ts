import { NextRequest, NextResponse } from 'next/server';
import { getAdminFromRequest, logAdminAction } from '@/lib/auth';
import { cleanupDuplicateProfits } from '@/lib/profit-cleanup';

// Force dynamic — disable Next.js route cache.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * POST /api/admin/profit-cleanup
 *
 * Admin-only endpoint to manually trigger cleanup of duplicate profit entries.
 * This is the same cleanup that runs automatically on cron-service startup.
 *
 * Use cases:
 *   - After deploying v2.7 to clean up duplicates from old cron versions
 *   - Periodic maintenance to verify data integrity
 *   - Emergency cleanup if double-profit bug reappears
 *
 * Returns detailed report of what was changed.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized — admin access required' }, { status: 401 });
    }

    console.log(`[Profit Cleanup API] 📌 Manual trigger by admin ${admin.username} (${admin.id})`);

    const report = await cleanupDuplicateProfits();

    // Log admin action
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '';
    await logAdminAction(
      admin.id,
      'profit-cleanup',
      `Removed ${report.duplicateEntriesRemoved} duplicate profit entries, recalculated ${report.investmentsRecalculated} investments, corrected ${report.usersBalanceCorrected} users (total ${report.totalBalanceCorrected} over-credit removed)`,
      ip,
    );

    return NextResponse.json({
      success: true,
      message: `Cleanup selesai. ${report.duplicateEntriesRemoved} entri profit dobel dihapus, ${report.usersBalanceCorrected} user dikoreksi.`,
      report: {
        startedAt: report.startedAt,
        finishedAt: report.finishedAt,
        durationMs: report.durationMs,
        bonusLogBefore: report.bonusLogBefore,
        bonusLogAfter: report.bonusLogAfter,
        duplicateEntriesRemoved: report.duplicateEntriesRemoved,
        duplicateAmountRefunded: report.duplicateAmountRefunded,
        investmentsRecalculated: report.investmentsRecalculated,
        investmentsDriftFixed: report.investmentsDriftFixed,
        purchasesRecalculated: report.purchasesRecalculated,
        usersBalanceCorrected: report.usersBalanceCorrected,
        totalBalanceCorrected: report.totalBalanceCorrected,
        errors: report.errors,
        details: {
          duplicateGroups: report.details.duplicateGroups.slice(0, 50),
          investmentDrift: report.details.investmentDrift.slice(0, 50),
          userBalance: report.details.userBalance.slice(0, 50),
          truncated: {
            duplicateGroups: Math.max(0, report.details.duplicateGroups.length - 50),
            investmentDrift: Math.max(0, report.details.investmentDrift.length - 50),
            userBalance: Math.max(0, report.details.userBalance.length - 50),
          },
        },
      },
    });
  } catch (error: any) {
    console.error('[Profit Cleanup API] ❌ Error:', error);
    return NextResponse.json(
      { error: 'Cleanup failed', message: error.message },
      { status: 500 },
    );
  }
}

/**
 * GET /api/admin/profit-cleanup
 *
 * Returns a preview of what WOULD be cleaned up (dry-run), without making changes.
 * Useful for auditing before running the actual cleanup.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized — admin access required' }, { status: 401 });
    }

    const { db } = await import('@/lib/db');

    const allProfitLogs = await db.bonusLog.findMany({
      where: { type: 'profit' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true, amount: true, createdAt: true },
    });

    const WIB_OFFSET = 7;
    const getWibDay = (d: Date) => {
      const wib = new Date(d.getTime() + d.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
      return `${wib.getFullYear()}-${String(wib.getMonth() + 1).padStart(2, '0')}-${String(wib.getDate()).padStart(2, '0')}`;
    };

    const groups = new Map<string, typeof allProfitLogs>();
    for (const log of allProfitLogs) {
      const key = `${log.userId}::${getWibDay(new Date(log.createdAt))}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(log);
    }

    const duplicateGroups = Array.from(groups.entries())
      .filter(([, entries]) => entries.length > 1)
      .map(([key, entries]) => {
        const [userId, wibDay] = key.split('::');
        const total = entries.reduce((s, e) => s + e.amount, 0);
        const max = Math.max(...entries.map((e) => e.amount));
        return {
          userId,
          wibDay,
          entryCount: entries.length,
          totalAmount: total,
          wouldKeep: max,
          wouldRemove: total - max,
          wouldRefund: total - max,
        };
      });

    const totalWouldRemove = duplicateGroups.reduce((s, g) => s + g.wouldRemove, 0);

    return NextResponse.json({
      success: true,
      dryRun: true,
      totalProfitEntries: allProfitLogs.length,
      duplicateGroupCount: duplicateGroups.length,
      totalEntriesToRemove: duplicateGroups.reduce((s, g) => s + (g.entryCount - 1), 0),
      totalAmountToRefund: totalWouldRemove,
      duplicateGroups: duplicateGroups.slice(0, 100),
      truncated: Math.max(0, duplicateGroups.length - 100),
    });
  } catch (error: any) {
    console.error('[Profit Cleanup API] ❌ Dry-run error:', error);
    return NextResponse.json(
      { error: 'Dry-run failed', message: error.message },
      { status: 500 },
    );
  }
}
