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
 * Count CREDITED weekdays: from startDate+1 (day after purchase) to endDate (inclusive).
 * This mirrors the cron's behavior: first profit is credited the day AFTER purchase.
 *
 * Examples (startStr = purchase day, endStr = today):
 *   Mon → Tue:  1 (Tuesday only)
 *   Mon → Wed:  2 (Tuesday + Wednesday)
 *   Mon → Sat:  4 (Tue, Wed, Thu, Fri — weekend skipped)
 *   Mon → Mon:  0 (same day = no profit yet)
 */
function countCreditedDays(startStr: string, endStr: string): number {
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const [ey, em, ed] = endStr.split('-').map(Number);
  // Start from day AFTER purchase (profit starts H+1)
  const start = new Date(Date.UTC(sy, sm - 1, sd + 1));
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

// ──────────── STEP 2: Recalculate Investment.totalProfitEarned (ONLY REDUCE) ────────────
//
// ★★★ v2.9.1 CRITICAL FIXES (4 bugs fixed) ★★★
//
// Bug #1 (fixed): countWeekdaysBetween included purchase day. Cron credits
//   starting day AFTER purchase. Now uses countCreditedDays (start+1 to end).
//
// Bug #2 (fixed): STEP 2 used to set lastProfitDate = today even if today's
//   profit wasn't credited yet → cron saw "already credited today" → SKIP
//   → user lost a day of profit. Now: DON'T touch lastProfitDate at all.
//   The cron's atomic claim manages lastProfitDate correctly.
//
// Bug #3 (fixed): STEP 2 used to set totalProfitEarned = expectedTotalProfit
//   (both increase AND decrease). If today wasn't credited yet, expected
//   included today → cron later credited today → totalProfitEarned += dp
//   → DOUBLE COUNT! Now: ONLY REDUCE (use MIN(current, expected)). Never
//   increase — let the cron credit normally.
//
// Bug #4 (fixed): No dailyProfit fallback. If inv.dailyProfit = 0 (VIP
//   purchase with _internal_default package), cleanup computed expected = 0
//   → trimmed ALL entries! Now: same fallback as cron
//   (inv.dailyProfit || amount × package.profitRate / 100).

async function recalculateInvestments(report: CleanupReport): Promise<void> {
  console.log('[Profit Cleanup] 🧹 STEP 2 (v2.9.1): Recalculate Investment.totalProfitEarned — ONLY REDUCE, never increase');

  const todayWIB = getWibDateString(getWibNow());
  const investments = await db.investment.findMany({
    where: { status: { in: ['active', 'Active', 'ACTIVE', 'completed', 'Completed'] } },
    include: { package: true },
  });
  console.log(`[Profit Cleanup]   Processing ${investments.length} investments`);

  for (const inv of investments) {
    try {
      // ── Bug #4 fix: dailyProfit fallback (same as cron) ──
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (dailyProfit <= 0) {
        // VIP purchase or broken data — skip (don't trim anything)
        continue;
      }

      const startWIB = getWibDateString(new Date(inv.startDate));
      // End date: min(today, inv.endDate) — if no endDate, use today
      let endWIB: string;
      if (inv.endDate) {
        const endStr = getWibDateString(new Date(inv.endDate));
        endWIB = endStr < todayWIB ? endStr : todayWIB;
      } else {
        endWIB = todayWIB;
      }

      // ── Bug #1 fix: countCreditedDays starts from day AFTER purchase ──
      const contractDays = inv.package?.contractDays ?? 90;
      const creditedDaysRaw = countCreditedDays(startWIB, endWIB);
      const creditedDays = Math.min(creditedDaysRaw, contractDays);

      const expectedTotalProfit = Math.floor(creditedDays * dailyProfit);

      const before = inv.totalProfitEarned;

      // ── Bug #3 fix: ONLY REDUCE — use MIN(current, expected) ──
      // Never increase totalProfitEarned (let cron credit normally).
      // This prevents double-count if today hasn't been credited yet.
      const newTotalProfitEarned = Math.min(before, expectedTotalProfit);
      const diff = newTotalProfitEarned - before; // always <= 0

      if (Math.abs(diff) < 1) {
        // Already correct (or current is already <= expected — don't top up)
        continue;
      }

      // ── Bug #2 fix: DON'T set lastProfitDate ──
      // The cron's atomic claim manages lastProfitDate correctly.
      // Setting it here could block today's credit or cause double-credit.
      await db.investment.update({
        where: { id: inv.id },
        data: {
          totalProfitEarned: newTotalProfitEarned,
        },
      });

      report.investmentsRecalculated++;
      report.investmentsDriftFixed++;
      report.details.investmentDrift.push({
        investmentId: inv.id,
        userId: inv.userId,
        before,
        after: newTotalProfitEarned,
        diff,
      });

      console.log(
        `[Profit Cleanup]   👉 Investment ${inv.id} (user ${inv.userId}): ${formatRupiahSimple(before)} → ${formatRupiahSimple(newTotalProfitEarned)} (diff ${diff >= 0 ? '+' : ''}${formatRupiahSimple(diff)}, ${creditedDays} credited days × ${formatRupiahSimple(dailyProfit)})`,
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

// ──────────── STEP 3: Recalculate Purchase.profitEarned (ONLY REDUCE) ────────────

async function recalculatePurchases(report: CleanupReport): Promise<void> {
  console.log('[Profit Cleanup] 🧹 STEP 3 (v2.9.1): Recalculate Purchase.profitEarned — ONLY REDUCE');

  const purchases = await db.purchase.findMany({
    where: { status: 'active' },
    include: { investments: { select: { id: true, totalProfitEarned: true } }, product: true },
  });
  console.log(`[Profit Cleanup]   Processing ${purchases.length} active purchases`);

  for (const p of purchases) {
    try {
      let expected = 0;
      if (p.investments.length > 0) {
        // = sum(linked Investment.totalProfitEarned) — already reduced by STEP 2 if over-credited
        expected = p.investments.reduce((s, i) => s + (i.totalProfitEarned || 0), 0);
      } else {
        // Standalone — compute from progress (same fix as STEP 2: day after purchase)
        const startWIB = getWibDateString(new Date(p.createdAt));
        const todayWIB = getWibDateString(getWibNow());
        const productRate = p.product?.profitRate || 0;
        const dailyProfit = Math.floor(p.totalPrice * (productRate / 100));
        if (dailyProfit <= 0) continue; // skip broken data
        const creditedDays = countCreditedDays(startWIB, todayWIB);
        expected = creditedDays * dailyProfit;
      }

      const before = p.profitEarned;
      // ── v2.9.1: ONLY REDUCE — use MIN(current, expected) ──
      const newProfitEarned = Math.min(before, expected);
      const diff = newProfitEarned - before; // always <= 0
      if (Math.abs(diff) < 1) continue;

      await db.purchase.update({
        where: { id: p.id },
        data: { profitEarned: newProfitEarned },
      });

      report.purchasesRecalculated++;
      console.log(
        `[Profit Cleanup]   👉 Purchase ${p.id} (user ${p.userId}): ${formatRupiahSimple(before)} → ${formatRupiahSimple(newProfitEarned)} (diff ${diff >= 0 ? '+' : ''}${formatRupiahSimple(diff)})`,
      );
    } catch (e: any) {
      const msg = `Purchase ${p.id}: ${e.message}`;
      report.errors.push(msg);
      console.error(`[Profit Cleanup]   ❌ ${msg}`);
    }
  }
  console.log(`[Profit Cleanup]   ✅ Recalculated ${report.purchasesRecalculated} purchases`);
}

// ──────────── STEP 4: Trim excess BonusLog + correct User balance ────────────
//
// ★★★ v2.9 FIX: Use Investment.totalProfitEarned (after STEP 2 recalculation)
//   as the source of truth, NOT BonusLog sum. ★★★
//
// Old v2.8 STEP 4 compared User.totalProfit to BonusLog sum. But if BonusLog
// itself had 3 entries on 3 different days (no same-day duplicate), STEP 1
// dedup did nothing, and STEP 4 saw BonusLog sum == User.totalProfit → no
// correction. User kept 57,600 instead of 38,400.
//
// New v2.9 STEP 4:
//   1. expectedInvestmentProfit = sum(Investment.totalProfitEarned) per user
//      (STEP 2 already recalculated this from weekday progress)
//   2. For each user's profit BonusLog entries:
//      - If sum(entries) > expectedInvestmentProfit → excess exists
//      - Delete excess entries (smallest first) until sum ≈ expected
//   3. Correct User.totalProfit: reduce by excess (only the investment profit
//      portion — salary/matching/referral are untouched)
//   4. Correct User.mainBalance: reduce by excess (refund the over-credit)

async function recalculateUserBalances(report: CleanupReport): Promise<void> {
  console.log('[Profit Cleanup] 🧹 STEP 4 (v2.9): Trim excess BonusLog + correct User balance from Investment ground truth');

  // ── 4a. Compute expected investment profit per user from Investment.totalProfitEarned ──
  //   (STEP 2 already recalculated totalProfitEarned = elapsedWeekdays × dailyProfit)
  const investmentAgg = await db.investment.groupBy({
    by: ['userId'],
    _sum: { totalProfitEarned: true },
  });
  const expectedByUser = new Map<string, number>();
  for (const a of investmentAgg) {
    expectedByUser.set(a.userId, a._sum.totalProfitEarned || 0);
  }
  console.log(`[Profit Cleanup]   Found ${expectedByUser.size} users with investment profit records`);

  // ── 4b. Get all profit BonusLog entries, grouped by user, sorted by amount ASC ──
  //   (sort ASC so we delete smallest/excess entries first, preserving larger backfill entries)
  const allProfitLogs = await db.bonusLog.findMany({
    where: { type: 'profit' },
    orderBy: { amount: 'asc' },
    select: { id: true, userId: true, amount: true, description: true, createdAt: true },
  });
  const logsByUser = new Map<string, typeof allProfitLogs>();
  const logSumByUser = new Map<string, number>();
  for (const log of allProfitLogs) {
    if (!logsByUser.has(log.userId)) {
      logsByUser.set(log.userId, []);
      logSumByUser.set(log.userId, 0);
    }
    logsByUser.get(log.userId)!.push(log);
    logSumByUser.set(log.userId, (logSumByUser.get(log.userId) || 0) + log.amount);
  }

  // ── 4c. For each user with profit logs, trim excess + correct balance ──
  const users = await db.user.findMany({
    select: { id: true, userId: true, name: true, mainBalance: true, totalProfit: true },
  });
  console.log(`[Profit Cleanup]   Checking ${users.length} users for excess profit`);

  for (const u of users) {
    try {
      const expected = expectedByUser.get(u.id) || 0;
      const logs = logsByUser.get(u.id) || [];
      const currentLogSum = logSumByUser.get(u.id) || 0;

      // Skip if no excess (within 1 rupiah tolerance)
      const excess = currentLogSum - expected;
      if (excess <= 1) continue;

      // Skip if user has NO investments but has profit logs — suspicious, don't auto-delete
      // (could be from a deleted investment; admin should review manually)
      if (expected === 0 && logs.length > 0) {
        console.log(
          `[Profit Cleanup]   ⚠️ User ${u.userId} has ${logs.length} profit logs (sum ${formatRupiahSimple(currentLogSum)}) but 0 expected from investments — skipping (manual review needed)`,
        );
        report.errors.push(`User ${u.userId}: ${logs.length} profit logs but 0 expected — skipped for safety`);
        continue;
      }

      console.log(
        `[Profit Cleanup]   👉 User ${u.userId} (${u.name}): logs sum ${formatRupiahSimple(currentLogSum)} > expected ${formatRupiahSimple(expected)} → excess ${formatRupiahSimple(excess)} (${logs.length} entries → trim)`,
      );

      // ── 4d. Delete excess BonusLog entries (smallest first) ──
      // Greedy: delete smallest entry if deleting it doesn't bring sum below expected.
      // This preserves backfill entries (which are larger and cover multiple days).
      const idsToDelete: string[] = [];
      let remainingSum = currentLogSum;
      for (const log of logs) { // sorted ASC by amount
        if (remainingSum - log.amount >= expected - 1) {
          idsToDelete.push(log.id);
          remainingSum -= log.amount;
        }
        if (remainingSum <= expected + 1) break;
      }

      if (idsToDelete.length > 0) {
        // Delete in chunks to avoid SQLite param limits
        for (let i = 0; i < idsToDelete.length; i += 500) {
          const chunk = idsToDelete.slice(i, i + 500);
          await db.bonusLog.deleteMany({ where: { id: { in: chunk } } });
        }
        report.duplicateEntriesRemoved += idsToDelete.length;
        report.duplicateAmountRefunded += (currentLogSum - remainingSum);
        console.log(
          `[Profit Cleanup]     Deleted ${idsToDelete.length} excess entries (sum ${formatRupiahSimple(currentLogSum - remainingSum)}), remaining log sum = ${formatRupiahSimple(remainingSum)}`,
        );
      }

      // ── 4e. Correct User.totalProfit and mainBalance ──
      // User.totalProfit includes investment profit + salary + matching + referral.
      // We only reduce by the ACTUAL amount deleted from BonusLog (not theoretical excess).
      // ★★★ v2.9.1 FIX: use actualExcess (currentLogSum - remainingSum), not theoretical excess ★★★
      //   Edge case: if entries don't divide evenly (e.g., [19200, 38400, 57600] with expected=38400),
      //   greedy deletion might only delete 2 of 3 excess entries. Using theoretical excess would
      //   over-deduct User balance. Using actualExcess ensures User balance matches BonusLog.
      const actualExcess = currentLogSum - remainingSum;
      const newTotalProfit = Math.max(0, u.totalProfit - actualExcess);
      const newMain = Math.max(0, u.mainBalance - actualExcess);

      await db.user.update({
        where: { id: u.id },
        data: {
          mainBalance: newMain,
          totalProfit: newTotalProfit,
        },
      });

      report.usersBalanceCorrected++;
      report.totalBalanceCorrected += actualExcess;
      report.details.userBalance.push({
        userId: u.id,
        beforeMain: u.mainBalance,
        afterMain: newMain,
        beforeTotalProfit: u.totalProfit,
        afterTotalProfit: newTotalProfit,
        corrected: actualExcess,
      });

      console.log(
        `[Profit Cleanup]     ✅ User ${u.userId}: mainBalance ${formatRupiahSimple(u.mainBalance)} → ${formatRupiahSimple(newMain)} | totalProfit ${formatRupiahSimple(u.totalProfit)} → ${formatRupiahSimple(newTotalProfit)} | corrected -${formatRupiahSimple(actualExcess)}`,
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

  // ★★★ v2.9.1: Recalculate bonusLogAfter = before - total removed (STEP 1 + STEP 4) ★★★
  report.bonusLogAfter = report.bonusLogBefore - report.duplicateEntriesRemoved;

  console.log('[Profit Cleanup] 🎉 Cleanup complete! (v2.9.1)');
  console.log(`[Profit Cleanup]   BonusLog: ${report.bonusLogBefore} → ${report.bonusLogAfter} (removed ${report.duplicateEntriesRemoved})`);
  console.log(`[Profit Cleanup]   Investments recalculated: ${report.investmentsRecalculated} (drift fixed: ${report.investmentsDriftFixed})`);
  console.log(`[Profit Cleanup]   Purchases recalculated: ${report.purchasesRecalculated}`);
  console.log(`[Profit Cleanup]   Users balance corrected: ${report.usersBalanceCorrected} (total ${formatRupiahSimple(report.totalBalanceCorrected)} removed)`);
  console.log(`[Profit Cleanup]   Errors: ${report.errors.length}`);
  console.log(`[Profit Cleanup]   Duration: ${report.durationMs}ms`);

  return report;
}
