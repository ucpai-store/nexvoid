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

// ──────────── STEP 1: Count BonusLog(type='profit') — NO LONGER DEDUP ────────────
//
// ★★★ v3.1 CRITICAL FIX: REMOVE STEP 1 DEDUP LOGIC ★★★
//
// v3.0 BUG: STEP 1 grouped by (userId, WIB day) and kept only the LARGEST entry,
// deleting the rest. This WRONGLY DELETED LEGITIMATE entries for users with
// MULTIPLE PACKAGES (e.g., VIP1 + VIP2 both credit on the same day with
// different amounts). It also didn't refund User balance — only deleted logs.
//
// v3.1 FIX: STEP 1 now ONLY counts bonusLogBefore for the report.
//   - All excess detection + deletion + balance correction is done by STEP 4.
//   - STEP 4 uses Investment.totalProfitEarned as ground truth (sum per user).
//   - STEP 4 correctly handles multi-paket users (sums all investments).
//   - STEP 4 correctly handles 2x same package (sums both investments).
//   - STEP 4 correctly handles race-condition duplicates (excess → trim smallest).
//   - STEP 4 correctly refunds User balance (actualExcess = deleted amount).
//
// Why STEP 4 is sufficient (no need for STEP 1 dedup):
//   - Race-condition duplicate (same investment, 2 entries same day):
//     STEP 2 reduces Investment.totalProfitEarned to expected (1 day).
//     STEP 4 sees BonusLog sum (2 entries) > expected (1 entry) → trim 1. ✓
//   - Cross-day excess (bug entry on different day):
//     STEP 2 uses lastProfitDate as end → expected = actual credited days.
//     STEP 4 sees BonusLog sum > expected → trim excess. ✓
//   - Multi-paket (VIP1 + VIP2, 2 entries same day, different amounts):
//     STEP 2 sums both investments. STEP 4 expected = VIP1 + VIP2.
//     BonusLog sum = VIP1 + VIP2. No excess. No trim. ✓ Correct!

async function countProfitBonusLogs(report: CleanupReport): Promise<void> {
  console.log('[Profit Cleanup] 🧹 STEP 1 (v3.1): Count BonusLog(type=profit) — no dedup (STEP 4 handles all excess)');

  const count = await db.bonusLog.count({ where: { type: 'profit' } });
  report.bonusLogBefore = count;
  console.log(`[Profit Cleanup]   Found ${count} profit BonusLog entries (will be checked by STEP 4)`);
}

// ──────────── STEP 2: Recalculate Investment.totalProfitEarned (ONLY REDUCE) ────────────
//
// ★★★ v3.0 CRITICAL FIX: Use lastProfitDate as end date, NOT today ★★★
//
// v2.9.1 bug: STEP 2 used `today` as end date → expected = countCreditedDays(start, today).
// If lastProfitDate = YESTERDAY (today not yet credited), expected INCLUDED today.
// So if there was an excess entry from a bug (e.g. purchase-day credit), the cleanup
// couldn't detect it because expected was inflated by today's (uncredited) day.
//
// v3.0 fix: Use `lastProfitDate` as end date instead of today.
//   - lastProfitDate = the LAST day ACTUALLY credited by the cron
//   - expected = countCreditedDays(start, lastProfitDate) × dailyProfit
//   - This is the EXACT amount that should have been credited up to the last credit
//   - If BonusLog has MORE than this → excess → trim
//   - If lastProfitDate = null → never credited → expected = 0 (trim all excess)
//
// This fix handles the scenario:
//   - Bought Monday. Today = Wednesday.
//   - BUG: entry on Monday (purchase day) + entry on Tuesday = 38400. lastProfitDate = Tuesday.
//   - v2.9.1: expected = countCreditedDays(Mon, Wed) × dp = 2 × 19200 = 38400 → NO excess detected!
//   - v3.0:   expected = countCreditedDays(Mon, Tue) × dp = 1 × 19200 = 19200 → excess = 19200 → TRIM! ✓
//
// ★★★ Previous fixes (kept from v2.9.1) ★★★
//
// Bug #1: countCreditedDays starts from day AFTER purchase (profit starts H+1).
// Bug #2: DON'T touch lastProfitDate (cron's atomic claim manages it).
// Bug #3: ONLY REDUCE — use MIN(current, expected). Never increase.
// Bug #4: dailyProfit fallback for VIP purchases (inv.dailyProfit || amount × rate).

async function recalculateInvestments(report: CleanupReport): Promise<void> {
  console.log('[Profit Cleanup] 🧹 STEP 2 (v3.2): Recalculate Investment.totalProfitEarned — process ALL statuses, ONLY REDUCE');

  // ★★★ v3.2 FIX: HAPUS status filter — process SEMUA investments.
  //   Old v3.0 filter: status in ['active','Active','ACTIVE','completed','Completed'].
  //   BUG: kalau investment status = 'ongoing' / 'stopped' / 'pending' / capitalization drift,
  //   STEP 2 SKIP → Investment.totalProfitEarned tidak di-trim → Asset page (Math.max) display inflated.
  //   Fix: process SEMUA statuses. Cleanup ONLY REDUCE (Math.min), jadi aman untuk status apapun.
  const investments = await db.investment.findMany({
    include: { package: true },
  });
  console.log(`[Profit Cleanup]   Processing ${investments.length} investments (all statuses)`);

  for (const inv of investments) {
    try {
      // ── Bug #4 fix: dailyProfit fallback (same as cron) ──
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (dailyProfit <= 0) {
        // ★★★ v3.2: dailyProfit=0 TAPI totalProfitEarned > 0 = BUG (cron nggak credit kalau dp=0).
        //   Trim ke 0 (it's definitely a bug from old code path).
        if (inv.totalProfitEarned > 0) {
          console.log(`[Profit Cleanup]   ⚠️ Investment ${inv.id} (user ${inv.userId}): dailyProfit=0 TAPI totalProfitEarned=${formatRupiahSimple(inv.totalProfitEarned)} → trim to 0 (bug)`);
          await db.investment.update({
            where: { id: inv.id },
            data: { totalProfitEarned: 0 },
          });
          report.investmentsRecalculated++;
          report.investmentsDriftFixed++;
          report.details.investmentDrift.push({
            investmentId: inv.id,
            userId: inv.userId,
            before: inv.totalProfitEarned,
            after: 0,
            diff: -inv.totalProfitEarned,
          });
        }
        continue;
      }

      const startWIB = getWibDateString(new Date(inv.startDate));

      // ── v3.0 FIX: Use lastProfitDate as end date (NOT today) ──
      // lastProfitDate = the last day ACTUALLY credited by the cron.
      // This is the accurate "up to" date for expected profit calculation.
      let endWIB: string;
      if (inv.lastProfitDate) {
        endWIB = getWibDateString(new Date(inv.lastProfitDate));
        // Cap at endDate if investment has ended
        if (inv.endDate) {
          const endStr = getWibDateString(new Date(inv.endDate));
          if (endStr < endWIB) endWIB = endStr;
        }
      } else {
        // Never credited — expected = 0 (any totalProfitEarned > 0 is a bug)
        // Set endWIB = startWIB so countCreditedDays returns 0
        endWIB = startWIB;
      }

      // ── Bug #1 fix: countCreditedDays starts from day AFTER purchase ──
      const contractDays = inv.package?.contractDays ?? 90;
      const creditedDaysRaw = countCreditedDays(startWIB, endWIB);
      const creditedDays = Math.min(creditedDaysRaw, contractDays);

      const expectedTotalProfit = Math.floor(creditedDays * dailyProfit);

      const before = inv.totalProfitEarned;

      // ── Bug #3 fix: ONLY REDUCE — use MIN(current, expected) ──
      // Never increase totalProfitEarned (let cron credit normally).
      const newTotalProfitEarned = Math.min(before, expectedTotalProfit);
      const diff = newTotalProfitEarned - before; // always <= 0

      if (Math.abs(diff) < 1) {
        // Already correct (or current is already <= expected — don't top up)
        continue;
      }

      // ── Bug #2 fix: DON'T set lastProfitDate ──
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
        `[Profit Cleanup]   👉 Investment ${inv.id} (user ${inv.userId}): ${formatRupiahSimple(before)} → ${formatRupiahSimple(newTotalProfitEarned)} (diff ${diff >= 0 ? '+' : ''}${formatRupiahSimple(diff)}, ${creditedDays} credited days × ${formatRupiahSimple(dailyProfit)}, end=${endWIB})`,
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
  console.log('[Profit Cleanup] 🧹 STEP 3 (v3.0): Recalculate Purchase.profitEarned — ONLY REDUCE');

  const purchases = await db.purchase.findMany({
    where: { status: 'active' },
    include: { investments: { select: { id: true, totalProfitEarned: true, lastProfitDate: true } }, product: true },
  });
  console.log(`[Profit Cleanup]   Processing ${purchases.length} active purchases`);

  for (const p of purchases) {
    try {
      let expected = 0;
      if (p.investments.length > 0) {
        // = sum(linked Investment.totalProfitEarned) — already reduced by STEP 2 if over-credited
        expected = p.investments.reduce((s, i) => s + (i.totalProfitEarned || 0), 0);
      } else {
        // Standalone — compute from progress (v3.0: use lastProfitDate, not today)
        const startWIB = getWibDateString(new Date(p.createdAt));
        const productRate = p.product?.profitRate || 0;
        const dailyProfit = Math.floor(p.totalPrice * (productRate / 100));
        if (dailyProfit <= 0) continue; // skip broken data

        // v3.0: use lastProfitDate as end date (same fix as STEP 2)
        let endWIB: string;
        if (p.lastProfitDate) {
          endWIB = getWibDateString(new Date(p.lastProfitDate));
        } else {
          endWIB = startWIB; // never credited → expected = 0
        }
        const creditedDays = countCreditedDays(startWIB, endWIB);
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
// ★★★ v3.0: Safeguard updated — skip only if user has NO investments at all.
//   Old v2.9 safeguard skipped when expected=0. But v3.0 STEP 2 can produce
//   expected=0 when investments exist but lastProfitDate=null (never credited).
//   In that case, profit logs ARE bugs and SHOULD be trimmed.
//   New safeguard: skip only if user has NO investments (logs might be from
//   deleted investments — admin should review manually).
//
// ★★★ v2.9 FIX: Use Investment.totalProfitEarned (after STEP 2 recalculation)
//   as the source of truth, NOT BonusLog sum. ★★★

async function recalculateUserBalances(report: CleanupReport): Promise<void> {
  console.log('[Profit Cleanup] 🧹 STEP 4 (v3.1): Trim excess BonusLog + correct User balance from Investment + Purchase ground truth');

  // ── 4a. Compute expected profit per user from Investment.totalProfitEarned ──
  //   (STEP 2 already recalculated totalProfitEarned using lastProfitDate as end date)
  const investmentAgg = await db.investment.groupBy({
    by: ['userId'],
    _sum: { totalProfitEarned: true },
  });
  const expectedByUser = new Map<string, number>();
  const usersWithInvestments = new Set<string>();
  for (const a of investmentAgg) {
    expectedByUser.set(a.userId, a._sum.totalProfitEarned || 0);
    usersWithInvestments.add(a.userId);
  }
  console.log(`[Profit Cleanup]   Found ${expectedByUser.size} users with investment records`);

  // ── 4a.2 ★★★ v3.1 FIX: Also add standalone Purchase.profitEarned to expected ★★★
  //   Standalone Purchases (no linked Investment) get BonusLog(type='profit') from cron.
  //   Without this, STEP 4 would wrongly trim their profit logs.
  //   We need to find Purchases WITHOUT a linked Investment and add their profitEarned.
  const allPurchases = await db.purchase.findMany({
    where: { status: 'active' },
    select: { id: true, userId: true, profitEarned: true },
  });
  const linkedPurchaseIds = new Set<string>(
    (await db.investment.findMany({
      where: { purchaseId: { not: null } },
      select: { purchaseId: true },
      distinct: ['purchaseId'],
    }))
      .map((i) => i.purchaseId!)
      .filter(Boolean)
  );
  let standaloneCount = 0;
  for (const p of allPurchases) {
    if (linkedPurchaseIds.has(p.id)) continue; // has linked Investment — already counted
    standaloneCount++;
    const current = expectedByUser.get(p.userId) || 0;
    expectedByUser.set(p.userId, current + (p.profitEarned || 0));
  }
  if (standaloneCount > 0) {
    console.log(`[Profit Cleanup]   Added standalone Purchase profit for ${standaloneCount} purchase(s) to expected`);
  }
  const usersWithProfitSource = new Set<string>([...usersWithInvestments]);
  for (const p of allPurchases) {
    if (!linkedPurchaseIds.has(p.id) && (p.profitEarned || 0) > 0) {
      usersWithProfitSource.add(p.userId);
    }
  }

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
      const hasProfitSource = usersWithProfitSource.has(u.id);
      const logs = logsByUser.get(u.id) || [];
      const currentLogSum = logSumByUser.get(u.id) || 0;

      // Skip if no excess (within 1 rupiah tolerance)
      const excess = currentLogSum - expected;
      if (excess <= 1) continue;

      // ★★★ v3.1 SAFEGUARD: Skip only if user has NO investments AND NO standalone purchases ★★★
      //   (If user HAS profit source but expected=0 because lastProfitDate=null,
      //    the profit logs are bugs — trim them.)
      //   (If user has NO profit source, logs might be from deleted records —
      //    admin should review manually.)
      if (!hasProfitSource && logs.length > 0) {
        console.log(
          `[Profit Cleanup]   ⚠️ User ${u.userId} has ${logs.length} profit logs (sum ${formatRupiahSimple(currentLogSum)}) but NO investments — skipping (manual review needed)`,
        );
        report.errors.push(`User ${u.userId}: ${logs.length} profit logs but no investments — skipped for safety`);
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

// ──────────── STEP 5: Direct User balance correction from BonusLog ground truth (v3.2) ────────────
//
// ★★★ v3.2 CRITICAL FIX: Catch User.mainBalance drift that STEP 4 misses ★★★
//
// PROBLEM:
//   STEP 4 compares BonusLog sum vs Investment.totalProfitEarned. If they match → skip.
//   BUT User.mainBalance / User.totalProfit can STILL be inflated if:
//   - Old cleanup (v2.9) deleted BonusLog entries but didn't refund User balance
//   - Cron bug credited User.mainBalance without creating BonusLog
//   - Manual DB edit added balance without log
//   Result: Investment.totalProfitEarned = 38400, BonusLog sum = 38400 (match ✓),
//   but User.mainBalance = 68800 (drift +30400 from old bug).
//
// FIX:
//   For each user: expected_totalProfit = sum(BonusLog.amount WHERE type='profit')
//   If User.totalProfit > expected_totalProfit → drift → reduce BOTH:
//     - User.totalProfit -= diff
//     - User.mainBalance -= diff (because the inflated profit was added to mainBalance too)
//   ONLY REDUCE — never increase.

async function correctUserBalanceDrift(report: CleanupReport): Promise<void> {
  console.log('[Profit Cleanup] 🧹 STEP 5 (v3.2): Direct User balance correction from BonusLog ground truth — catch drift STEP 4 misses');

  // ── 5a. Sum all profit BonusLog per user (ground truth) ──
  // ★★★ FIX v6 (CRITICAL): Sum ALL bonus types (profit + referral + matching + salary).
  // OLD buggy code only summed type='profit' → users with referral/matching/salary
  // bonuses were flagged as "drift" → mainBalance & totalProfit got STRIPPED of all
  // non-profit bonuses on every cron run → saldo user jadi 0. This was the root cause
  // of "saldo tiba-tiba berkurang jadi 0" after deploy.
  const profitLogAgg = await db.bonusLog.groupBy({
    by: ['userId'],
    where: { type: { in: ['profit', 'referral', 'matching', 'salary'] } },
    _sum: { amount: true },
  });
  const expectedProfitByUser = new Map<string, number>();
  for (const a of profitLogAgg) {
    expectedProfitByUser.set(a.userId, a._sum.amount || 0);
  }
  console.log(`[Profit Cleanup]   Found ${expectedProfitByUser.size} users with profit BonusLog entries`);

  // ── 5b. Check each user's totalProfit vs expected ──
  const users = await db.user.findMany({
    select: { id: true, userId: true, name: true, mainBalance: true, totalProfit: true },
  });
  console.log(`[Profit Cleanup]   Checking ${users.length} users for balance drift`);

  for (const u of users) {
    try {
      const expectedProfit = expectedProfitByUser.get(u.id) || 0;
      const drift = u.totalProfit - expectedProfit;

      // Skip if no drift (within 1 rupiah tolerance)
      if (drift <= 1) continue;

      // Drift detected: User.totalProfit > sum(BonusLog profit)
      // Reduce BOTH totalProfit and mainBalance by drift amount
      const newTotalProfit = Math.max(0, u.totalProfit - drift);
      const newMain = Math.max(0, u.mainBalance - drift);

      await db.user.update({
        where: { id: u.id },
        data: {
          mainBalance: newMain,
          totalProfit: newTotalProfit,
        },
      });

      report.usersBalanceCorrected++;
      report.totalBalanceCorrected += drift;
      report.details.userBalance.push({
        userId: u.id,
        beforeMain: u.mainBalance,
        afterMain: newMain,
        beforeTotalProfit: u.totalProfit,
        afterTotalProfit: newTotalProfit,
        corrected: drift,
      });

      console.log(
        `[Profit Cleanup]   👉 User ${u.userId} (${u.name}): DRIFT detected — totalProfit ${formatRupiahSimple(u.totalProfit)} > expected ${formatRupiahSimple(expectedProfit)} (drift ${formatRupiahSimple(drift)})`,
      );
      console.log(
        `[Profit Cleanup]     ✅ Corrected: mainBalance ${formatRupiahSimple(u.mainBalance)} → ${formatRupiahSimple(newMain)} | totalProfit ${formatRupiahSimple(u.totalProfit)} → ${formatRupiahSimple(newTotalProfit)}`,
      );
    } catch (e: any) {
      const msg = `User ${u.id} (STEP 5): ${e.message}`;
      report.errors.push(msg);
      console.error(`[Profit Cleanup]   ❌ ${msg}`);
    }
  }
  console.log(
    `[Profit Cleanup]   ✅ STEP 5 done: corrected ${report.usersBalanceCorrected} users (cumulative), drift removed ${formatRupiahSimple(report.totalBalanceCorrected)}`,
  );
}

// ──────────── Main Entry ────────────

export async function cleanupDuplicateProfits(): Promise<CleanupReport> {
  console.log('[Profit Cleanup] 🚀 Starting cleanupDuplicateProfits() (v3.2)');
  const report = newReport();

  try {
    await countProfitBonusLogs(report);
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

  // ★★★ v3.2: STEP 5 — Direct User balance correction (catch drift STEP 4 misses) ★★★
  try {
    await correctUserBalanceDrift(report);
  } catch (e: any) {
    report.errors.push(`STEP 5 failed: ${e.message}`);
    console.error('[Profit Cleanup] ❌ STEP 5 failed:', e.message);
  }

  report.finishedAt = new Date();
  report.durationMs = report.finishedAt.getTime() - report.startedAt.getTime();

  // ★★★ v2.9.1: Recalculate bonusLogAfter = before - total removed (STEP 1 + STEP 4) ★★★
  report.bonusLogAfter = report.bonusLogBefore - report.duplicateEntriesRemoved;

  console.log('[Profit Cleanup] 🎉 Cleanup complete! (v3.2 — STEP 5 direct User balance correction added)');
  console.log(`[Profit Cleanup]   BonusLog: ${report.bonusLogBefore} → ${report.bonusLogAfter} (removed ${report.duplicateEntriesRemoved})`);
  console.log(`[Profit Cleanup]   Investments recalculated: ${report.investmentsRecalculated} (drift fixed: ${report.investmentsDriftFixed})`);
  console.log(`[Profit Cleanup]   Purchases recalculated: ${report.purchasesRecalculated}`);
  console.log(`[Profit Cleanup]   Users balance corrected: ${report.usersBalanceCorrected} (total ${formatRupiahSimple(report.totalBalanceCorrected)} removed)`);
  console.log(`[Profit Cleanup]   Errors: ${report.errors.length}`);
  console.log(`[Profit Cleanup]   Duration: ${report.durationMs}ms`);

  return report;
}
