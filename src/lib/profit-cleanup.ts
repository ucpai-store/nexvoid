/**
 * NEXVO Profit Cleanup Module ★★★ AUTO-DEDUP DOUBLE/TRIPLE PROFIT ★★★
 *
 * Purpose:
 *   Old cron versions (v2.5 and earlier) had a race condition where 2 cron
 *   instances (or PM2 restart overlap) could both credit profit on the same
 *   day → BonusLog got 2-3 entries for the SAME (user, day). Investment.
 *   totalProfitEarned and User.mainBalance / totalProfit were inflated.
 *
 *   v2.7 cron prevents NEW duplicates (atomic claim + PID lock), but it
 *   does NOT clean up duplicates that already exist in the database from
 *   old versions. This module does exactly that:
 *
 *   1. DEDUP BonusLog(type='profit'):
 *      Group by (userId, WIB day). If >1 entry on the same WIB day, keep
 *      the one with the largest amount (backfill entries have larger
 *      amounts because they cover multiple days — we want to preserve
 *      those), delete the rest. Refund the deleted amount from User.
 *
 *   2. RECALCULATE Investment.totalProfitEarned from scratch:
 *      For each active Investment, count weekdays elapsed from startDate
 *      to min(today, endDate), capped at contractDays from the package.
 *      expectedTotalProfit = elapsedWeekdays × dailyProfit.
 *      Reset totalProfitEarned to this value. Update lastProfitDate to
 *      the last credited weekday.
 *
 *   3. RECALCULATE Purchase.profitEarned:
 *      = sum(linked Investment.totalProfitEarned) if linked investments exist
 *      = standalone progress (weekdays × dailyProfit) otherwise
 *
 *   4. RECALCULATE User.mainBalance & totalProfit:
 *      Sum all BonusLog(type='profit') per user → that is the "true" total
 *      profit the user should have received. Compare with current
 *      User.totalProfit. If current > true → user was over-credited →
 *      subtract the difference from mainBalance AND totalProfit.
 *      (If current < true, do nothing — we don't auto-top-up to avoid
 *      creating money from a bug we can't fully reason about.)
 *
 * Usage:
 *   - Auto-runs ONCE at cron-service startup (see cron-service.ts)
 *   - Manual trigger via POST /api/admin/profit-cleanup (admin-only)
 *   - Standalone: bun run scripts/run-profit-cleanup.ts
 *
 * Safety:
 *   - All operations are wrapped in try/catch — failures are non-fatal.
 *   - Returns a detailed report so admin can audit what was changed.
 *   - Idempotent: running twice is safe (second run is a no-op).
 */

import { db } from './db';

const WIB_OFFSET = 7; // UTC+7

// ──────────── Time Helpers (mirror cron-service.ts) ────────────

function getWibNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + WIB_OFFSET * 3600000);
}

function getWibDateString(date: Date): string {
  const wibDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
  return `${wibDate.getFullYear()}-${String(wibDate.getMonth() + 1).padStart(2, '0')}-${String(wibDate.getDate()).padStart(2, '0')}`;
}

function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

/**
 * Count weekdays (Mon-Fri) from startDate (inclusive) to endDate (inclusive),
 * both in WIB. Used to compute expected profit progress.
 */
function countWeekdaysBetween(startStr: string, endStr: string): number {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, sd));
  const end = new Date(Date.UTC(ey, em - 1, ed));
  if (end < start) return 0;
  let count = 0;
  const cursor = new Date(start);
  let safety = 400;
  while (cursor <= end && safety-- > 0) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

// ──────────── Types ────────────

export interface CleanupReport {
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  bonusLogBefore: number;
  bonusLogAfter: number;
  duplicateEntriesRemoved: number;
  duplicateAmountRefunded: number;
  investmentsRecalculated: number;
  investmentsDriftFixed: number;
  purchasesRecalculated: number;
  usersBalanceCorrected: number;
  totalBalanceCorrected: number;
  details: {
    duplicateGroups: Array<{
      userId: string;
      wibDay: string;
      entriesBefore: number;
      entriesAfter: number;
      removed: number;
      amountRefunded: number;
    }>;
    investmentDrift: Array<{
      investmentId: string;
      userId: string;
      before: number;
      after: number;
      diff: number;
    }>;
    userBalance: Array<{
      userId: string;
      beforeMain: number;
      afterMain: number;
      beforeTotalProfit: number;
      afterTotalProfit: number;
      corrected: number;
    }>;
  };
  errors: string[];
}

function newReport(): CleanupReport {
  return {
    startedAt: new Date(),
    finishedAt: null,
    durationMs: null,
    bonusLogBefore: 0,
    bonusLogAfter: 0,
    duplicateEntriesRemoved: 0,
    duplicateAmountRefunded: 0,
    investmentsRecalculated: 0,
    investmentsDriftFixed: 0,
    purchasesRecalculated: 0,
    usersBalanceCorrected: 0,
    totalBalanceCorrected: 0,
    details: { duplicateGroups: [], investmentDrift: [], userBalance: [] },
    errors: [],
  };
}

// ──────────── STEP 1: Dedup BonusLog(type='profit') ────────────

async function dedupProfitBonusLogs(report: CleanupReport): Promise<void> {
  console.log('[Profit Cleanup] 🧹 STEP 1: Dedup BonusLog(type=profit) per (userId, WIB day)');

  const allProfitLogs = await db.bonusLog.findMany({
    where: { type: 'profit' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, userId: true, amount: true, description: true, createdAt: true },
  });
  report.bonusLogBefore = allProfitLogs.length;
  console.log(`[Profit Cleanup]   Found ${allProfitLogs.length} profit BonusLog entries`);

  // Group by (userId, WIB day)
  const groups = new Map<string, typeof allProfitLogs>();
  for (const log of allProfitLogs) {
    const wibDay = getWibDateString(new Date(log.createdAt));
    const key = `${log.userId}::${wibDay}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(log);
  }

  let totalRemoved = 0;
  let totalRefund = 0;
  const idsToDelete: string[] = [];

  for (const [key, entries] of groups) {
    if (entries.length <= 1) continue; // no duplicate

    const [userId, wibDay] = key.split('::');
    // Keep the entry with the LARGEST amount (backfill entries are larger
    // because they cover multiple days — we want to preserve the most
    // complete record). If tied, keep the latest.
    entries.sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const keep = entries[0];
    const remove = entries.slice(1);

    let groupRefund = 0;
    for (const r of remove) {
      idsToDelete.push(r.id);
      groupRefund += r.amount;
    }
    totalRemoved += remove.length;
    totalRefund += groupRefund;

    report.details.duplicateGroups.push({
      userId,
      wibDay,
      entriesBefore: entries.length,
      entriesAfter: 1,
      removed: remove.length,
      amountRefunded: groupRefund,
    });

    console.log(
      `[Profit Cleanup]   👉 ${userId} @ ${wibDay}: ${entries.length} → 1 (removed ${remove.length}, refund ${formatRupiahSimple(groupRefund)}, kept amount=${formatRupiahSimple(keep.amount)})`,
    );
  }

  // Batch delete duplicates
  if (idsToDelete.length > 0) {
    // Delete in chunks of 500 to avoid SQLite param limits
    for (let i = 0; i < idsToDelete.length; i += 500) {
      const chunk = idsToDelete.slice(i, i + 500);
      await db.bonusLog.deleteMany({ where: { id: { in: chunk } } });
    }
  }

  report.duplicateEntriesRemoved = totalRemoved;
  report.duplicateAmountRefunded = totalRefund;
  report.bonusLogAfter = allProfitLogs.length - totalRemoved;
  console.log(
    `[Profit Cleanup]   ✅ Removed ${totalRemoved} duplicate entries, total refund amount = ${formatRupiahSimple(totalRefund)}`,
  );
}

// ──────────── STEP 2: Recalculate Investment.totalProfitEarned ────────────

async function recalculateInvestments(report: CleanupReport): Promise<void> {
  console.log('[Profit Cleanup] 🧹 STEP 2: Recalculate Investment.totalProfitEarned from progress');

  const todayWIB = getWibDateString(getWibNow());
  const investments = await db.investment.findMany({
    where: { status: { in: ['active', 'Active', 'ACTIVE', 'completed', 'Completed'] } },
    include: { package: true },
  });
  console.log(`[Profit Cleanup]   Processing ${investments.length} investments`);

  for (const inv of investments) {
    try {
      const startWIB = getWibDateString(new Date(inv.startDate));
      // End date: min(today, inv.endDate) — if no endDate, use today
      let endWIB: string;
      if (inv.endDate) {
        const endStr = getWibDateString(new Date(inv.endDate));
        endWIB = endStr < todayWIB ? endStr : todayWIB;
      } else {
        endWIB = todayWIB;
      }

      // Cap at contractDays from package (if available)
      const contractDays = inv.package?.contractDays ?? 90;
      const elapsedWeekdaysRaw = countWeekdaysBetween(startWIB, endWIB);
      const elapsedWeekdays = Math.min(elapsedWeekdaysRaw, contractDays);

      const expectedTotalProfit = Math.floor(elapsedWeekdays * inv.dailyProfit);

      const before = inv.totalProfitEarned;
      const diff = expectedTotalProfit - before;

      if (Math.abs(diff) < 1) {
        // Already correct
        continue;
      }

      // Compute new lastProfitDate — last weekday on or before endWIB
      let lastWeekday: Date | null = null;
      if (elapsedWeekdays > 0) {
        const [ey, em, ed] = endWIB.split('-').map(Number);
        const cursor = new Date(Date.UTC(ey, em - 1, ed));
        let safety = 10;
        while (safety-- > 0) {
          const dow = cursor.getUTCDay();
          if (dow !== 0 && dow !== 6) {
            lastWeekday = new Date(cursor);
            break;
          }
          cursor.setUTCDate(cursor.getUTCDate() - 1);
        }
      }

      await db.investment.update({
        where: { id: inv.id },
        data: {
          totalProfitEarned: expectedTotalProfit,
          ...(lastWeekday ? { lastProfitDate: lastWeekday } : {}),
        },
      });

      report.investmentsRecalculated++;
      if (Math.abs(diff) >= 1) report.investmentsDriftFixed++;
      report.details.investmentDrift.push({
        investmentId: inv.id,
        userId: inv.userId,
        before,
        after: expectedTotalProfit,
        diff,
      });

      console.log(
        `[Profit Cleanup]   👉 Investment ${inv.id} (user ${inv.userId}): ${formatRupiahSimple(before)} → ${formatRupiahSimple(expectedTotalProfit)} (diff ${diff >= 0 ? '+' : ''}${formatRupiahSimple(diff)}, ${elapsedWeekdays} weekdays × ${formatRupiahSimple(inv.dailyProfit)})`,
      );
    } catch (e: any) {
      const msg = `Investment ${inv.id}: ${e.message}`;
      report.errors.push(msg);
      console.error(`[Profit Cleanup]   ❌ ${msg}`);
    }
  }
  console.log(
    `[Profit Cleanup]   ✅ Recalculated ${report.investmentsRecalculated} investments, ${report.investmentsDriftFixed} drift(s) fixed`,
  );
}

// ──────────── STEP 3: Recalculate Purchase.profitEarned ────────────

async function recalculatePurchases(report: CleanupReport): Promise<void> {
  console.log('[Profit Cleanup] 🧹 STEP 3: Recalculate Purchase.profitEarned');

  const purchases = await db.purchase.findMany({
    where: { status: 'active' },
    include: { investments: { select: { id: true, totalProfitEarned: true } }, product: true },
  });
  console.log(`[Profit Cleanup]   Processing ${purchases.length} active purchases`);

  for (const p of purchases) {
    try {
      let expected = 0;
      if (p.investments.length > 0) {
        // = sum(linked Investment.totalProfitEarned)
        expected = p.investments.reduce((s, i) => s + (i.totalProfitEarned || 0), 0);
      } else {
        // Standalone — compute from progress
        const startWIB = getWibDateString(new Date(p.createdAt));
        const todayWIB = getWibDateString(getWibNow());
        const productRate = p.product?.profitRate || 0;
        const dailyProfit = Math.floor(p.totalPrice * (productRate / 100));
        const elapsedWeekdays = countWeekdaysBetween(startWIB, todayWIB);
        expected = elapsedWeekdays * dailyProfit;
      }

      const before = p.profitEarned;
      const diff = expected - before;
      if (Math.abs(diff) < 1) continue;

      await db.purchase.update({
        where: { id: p.id },
        data: { profitEarned: expected },
      });

      report.purchasesRecalculated++;
      console.log(
        `[Profit Cleanup]   👉 Purchase ${p.id} (user ${p.userId}): ${formatRupiahSimple(before)} → ${formatRupiahSimple(expected)} (diff ${diff >= 0 ? '+' : ''}${formatRupiahSimple(diff)})`,
      );
    } catch (e: any) {
      const msg = `Purchase ${p.id}: ${e.message}`;
      report.errors.push(msg);
      console.error(`[Profit Cleanup]   ❌ ${msg}`);
    }
  }
  console.log(`[Profit Cleanup]   ✅ Recalculated ${report.purchasesRecalculated} purchases`);
}

// ──────────── STEP 4: Recalculate User balance from BonusLog ────────────

async function recalculateUserBalances(report: CleanupReport): Promise<void> {
  console.log('[Profit Cleanup] 🧹 STEP 4: Recalculate User.mainBalance & totalProfit from BonusLog');

  // Sum all profit BonusLog per user (after dedup)
  const profitAgg = await db.bonusLog.groupBy({
    by: ['userId'],
    where: { type: 'profit' },
    _sum: { amount: true },
  });
  const profitByUser = new Map<string, number>();
  for (const a of profitAgg) {
    profitByUser.set(a.userId, a._sum.amount || 0);
  }

  const users = await db.user.findMany({
    select: { id: true, userId: true, name: true, mainBalance: true, totalProfit: true },
  });
  console.log(`[Profit Cleanup]   Checking ${users.length} users`);

  for (const u of users) {
    try {
      const expectedProfit = profitByUser.get(u.id) || 0;
      // diff = how much the user is OVER-credited relative to BonusLog sum
      // If positive → user has more totalProfit than BonusLog records → over-credited → subtract
      // If negative → user has less than BonusLog → do NOT auto-top-up (could be legit deposit/withdraw)
      const overCredit = u.totalProfit - expectedProfit;
      if (overCredit <= 1) continue; // not over-credited (within 1 rupiah tolerance)

      const newMain = Math.max(0, u.mainBalance - overCredit);
      const newTotalProfit = expectedProfit; // align to BonusLog sum

      await db.user.update({
        where: { id: u.id },
        data: {
          mainBalance: newMain,
          totalProfit: newTotalProfit,
        },
      });

      report.usersBalanceCorrected++;
      report.totalBalanceCorrected += overCredit;
      report.details.userBalance.push({
        userId: u.id,
        beforeMain: u.mainBalance,
        afterMain: newMain,
        beforeTotalProfit: u.totalProfit,
        afterTotalProfit: newTotalProfit,
        corrected: overCredit,
      });

      console.log(
        `[Profit Cleanup]   👉 User ${u.userId} (${u.name}): mainBalance ${formatRupiahSimple(u.mainBalance)} → ${formatRupiahSimple(newMain)} | totalProfit ${formatRupiahSimple(u.totalProfit)} → ${formatRupiahSimple(newTotalProfit)} | corrected -${formatRupiahSimple(overCredit)}`,
      );
    } catch (e: any) {
      const msg = `User ${u.id}: ${e.message}`;
      report.errors.push(msg);
      console.error(`[Profit Cleanup]   ❌ ${msg}`);
    }
  }
  console.log(
    `[Profit Cleanup]   ✅ Corrected ${report.usersBalanceCorrected} users, total ${formatRupiahSimple(report.totalBalanceCorrected)} over-credit removed`,
  );
}

// ──────────── Main Entry ────────────

export async function cleanupDuplicateProfits(): Promise<CleanupReport> {
  console.log('[Profit Cleanup] 🚀 Starting cleanupDuplicateProfits()');
  const report = newReport();

  try {
    await dedupProfitBonusLogs(report);
  } catch (e: any) {
    report.errors.push(`STEP 1 failed: ${e.message}`);
    console.error('[Profit Cleanup] ❌ STEP 1 failed:', e.message);
  }

  try {
    await recalculateInvestments(report);
  } catch (e: any) {
    report.errors.push(`STEP 2 failed: ${e.message}`);
    console.error('[Profit Cleanup] ❌ STEP 2 failed:', e.message);
  }

  try {
    await recalculatePurchases(report);
  } catch (e: any) {
    report.errors.push(`STEP 3 failed: ${e.message}`);
    console.error('[Profit Cleanup] ❌ STEP 3 failed:', e.message);
  }

  try {
    await recalculateUserBalances(report);
  } catch (e: any) {
    report.errors.push(`STEP 4 failed: ${e.message}`);
    console.error('[Profit Cleanup] ❌ STEP 4 failed:', e.message);
  }

  report.finishedAt = new Date();
  report.durationMs = report.finishedAt.getTime() - report.startedAt.getTime();

  console.log('[Profit Cleanup] 🎉 Cleanup complete!');
  console.log(`[Profit Cleanup]   BonusLog: ${report.bonusLogBefore} → ${report.bonusLogAfter} (removed ${report.duplicateEntriesRemoved})`);
  console.log(`[Profit Cleanup]   Investments recalculated: ${report.investmentsRecalculated} (drift fixed: ${report.investmentsDriftFixed})`);
  console.log(`[Profit Cleanup]   Purchases recalculated: ${report.purchasesRecalculated}`);
  console.log(`[Profit Cleanup]   Users balance corrected: ${report.usersBalanceCorrected} (total ${formatRupiahSimple(report.totalBalanceCorrected)} removed)`);
  console.log(`[Profit Cleanup]   Errors: ${report.errors.length}`);
  console.log(`[Profit Cleanup]   Duration: ${report.durationMs}ms`);

  return report;
}
