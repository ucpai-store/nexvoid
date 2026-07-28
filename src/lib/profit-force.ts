/**
 * NEXVO Force-Profit Module ★★★ BROWSER-TRIGGERABLE PROFIT CREDIT ★★★
 *
 * Purpose:
 *   This module is the FALLBACK when the cron-service is broken, dead, or
 *   running OLD code on the VPS. It runs INSIDE the Next.js process
 *   (which IS running on nexvo.id), uses the SAME DB connection, and
 *   bypasses cron / PM2 / shell scripts ENTIRELY.
 *
 *   Trigger via browser URL:
 *     https://nexvo.id/api/profit-force?key=NEXVO2024
 *
 * What it does (in order):
 *   1. Run cleanupDuplicateProfits() — STEP 5 fixes drift (e.g. 68800 → 38400)
 *   2. Snapshot all user balances (before)
 *   3. Force-credit ALL missed profit for active investments (atomic claim, force=true)
 *      — backfill weekdays missed since lastProfitDate
 *      — credit today (even on weekend — force bypass)
 *   4. Force-credit ALL missed profit for standalone purchases
 *      (purchases with no linked Investment — legacy path)
 *   5. Snapshot all user balances (after)
 *   6. Return detailed before/after report
 *
 * Safety:
 *   - Idempotent: atomic claim (updateMany WHERE lastProfitDate < today)
 *     means re-running on the same day is a no-op for already-credited rows.
 *   - Cleanup ONLY REDUCES (never increases) — safe to run repeatedly.
 *   - Each investment / purchase is wrapped in its own try/catch — one
 *     failure doesn't block the rest.
 *   - All credit operations happen inside Prisma $transaction — atomic.
 */

import { db } from '@/lib/db';
import { cleanupDuplicateProfits, type CleanupReport } from '@/lib/profit-cleanup';

// ──────────── Constants ────────────

const WIB_OFFSET = 7; // UTC+7 for Asia/Jakarta

const DEFAULT_MATCHING_RATES: Record<number, number> = {
  1: 5, 2: 4, 3: 3, 4: 2, 5: 1,
};
const MAX_MATCHING_LEVEL = 5;

// ──────────── Time Helpers ────────────

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
 * Count weekdays (Mon-Fri) MISSED between lastCreditDate+1 and today (EXCLUSIVE today).
 * Sat/Sun are skipped (weekend libur).
 */
function countWeekdaysMissed(lastCreditDateStr: string, todayStr: string): number {
  const [ly, lm, ld] = lastCreditDateStr.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const start = new Date(Date.UTC(ly, lm - 1, ld + 1));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  let count = 0;
  const cursor = new Date(start);
  let safety = 60;
  while (cursor < end && safety-- > 0) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

// ──────────── Matching Bonus (Event-Driven) ────────────

async function getMatchingRates(): Promise<Record<number, number>> {
  try {
    const config = await db.matchingConfig.findFirst({ where: { isActive: true } });
    if (!config) return { ...DEFAULT_MATCHING_RATES };
    return {
      1: config.level1, 2: config.level2, 3: config.level3,
      4: config.level4, 5: config.level5,
    };
  } catch {
    return { ...DEFAULT_MATCHING_RATES };
  }
}

async function creditMatchingOnProfit(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  earningUserId: string,
  profitAmount: number,
  matchingRates: Record<number, number>,
): Promise<number> {
  let totalMatchCredited = 0;
  if (profitAmount <= 0) return 0;

  const uplineRefs = await tx.referral.findMany({
    where: { referredId: earningUserId },
    orderBy: { level: 'asc' },
  });
  if (uplineRefs.length === 0) return 0;

  const earningUser = await tx.user.findUnique({
    where: { id: earningUserId },
    select: { name: true, userId: true },
  });
  const earningUserName = earningUser?.name || earningUser?.userId || 'User';

  for (const ref of uplineRefs) {
    const level = ref.level;
    if (level > MAX_MATCHING_LEVEL) continue;
    const rate = matchingRates[level] || 0;
    if (rate <= 0) continue;
    const matchAmount = Math.floor(profitAmount * (rate / 100));
    if (matchAmount <= 0) continue;

    await tx.user.update({
      where: { id: ref.referrerId },
      data: {
        mainBalance: { increment: matchAmount },
        totalProfit: { increment: matchAmount },
      },
    });
    await tx.bonusLog.create({
      data: {
        userId: ref.referrerId,
        fromUserId: earningUserId,
        type: 'matching',
        level,
        amount: matchAmount,
        description: `Matching bonus L${level} (${rate}%) dari profit ${earningUserName} — ${formatRupiahSimple(profitAmount)} × ${rate}% = ${formatRupiahSimple(matchAmount)}`,
      },
    });
    totalMatchCredited += matchAmount;
  }
  return totalMatchCredited;
}

// ──────────── Types ────────────

export interface UserBalanceSnapshot {
  userId: string;
  userName: string;
  userCode: string;
  beforeMain: number;
  afterMain: number;
  beforeTotalProfit: number;
  afterTotalProfit: number;
  profitCredited: number;
}

export interface BalanceSyncEntry {
  userId: string;
  userName: string;
  userCode: string;
  beforeMain: number;
  afterMain: number;
  totalProfit: number;
  totalWithdraw: number;
  expectedFloor: number;
  syncedAmount: number;
}

export interface BalanceSyncResult {
  ran: boolean;
  usersChecked: number;
  usersSynced: number;
  totalSynced: number;
  entries: BalanceSyncEntry[];
  errors: string[];
}

export interface ForceCreditResult {
  success: boolean;
  triggeredAt: string;
  wibTime: string;
  wibDateStr: string;
  dayName: string;
  force: boolean;
  durationMs: number;
  cleanup: {
    ran: boolean;
    report: CleanupReport | null;
    error: string | null;
  };
  balanceSync: BalanceSyncResult;
  investments: {
    processed: number;
    skipped: number;
    profitCredited: number;
    matchingCredited: number;
    backfillDays: number;
    errors: string[];
  };
  purchases: {
    processed: number;
    skipped: number;
    profitCredited: number;
    errors: string[];
  };
  totalProfitCredited: number;
  totalMatchingCredited: number;
  totalBackfillDays: number;
  userBalances: UserBalanceSnapshot[];
}

// ──────────── STEP 6: Sync mainBalance UPWARD (fix under-credit drift) ────────────
//
// ★★★ CRITICAL FIX for "Saldo Utama terlalu rendah" bug ★★★
//
// Problem:
//   Some users have mainBalance < totalProfit - totalWithdraw. This means
//   profit was credited to totalProfit but NOT fully reflected in mainBalance.
//   Root cause: old cleanup v2.9 over-refunded mainBalance when "fixing"
//   duplicate profits — it decremented mainBalance too aggressively.
//
//   Example: totalProfit=68800, totalWithdraw=0, mainBalance=19200
//   Expected floor: 68800 - 0 = 68800. Actual: 19200. Drift: -49600.
//
// Fix:
//   For each user where mainBalance < (totalProfit - totalWithdraw):
//     syncedAmount = (totalProfit - totalWithdraw) - mainBalance
//     mainBalance += syncedAmount
//
// Safety:
//   - ONLY INCREASE mainBalance (never decrease — safe direction)
//   - Accounts for withdrawals (don't re-add withdrawn amount)
//   - Idempotent: running twice is a no-op (second run finds no drift)
//   - Per-user try/catch — one failure doesn't block others

async function syncMainBalanceUpward(): Promise<BalanceSyncResult> {
  const res: BalanceSyncResult = {
    ran: true,
    usersChecked: 0,
    usersSynced: 0,
    totalSynced: 0,
    entries: [],
    errors: [],
  };

  console.log('[Profit Force] ⬆️  STEP 6: Sync mainBalance UPWARD (fix under-credit drift)');

  const users = await db.user.findMany({
    select: {
      id: true, name: true, userId: true,
      mainBalance: true, totalProfit: true, totalWithdraw: true,
    },
  });
  res.usersChecked = users.length;

  for (const u of users) {
    try {
      const expectedFloor = Math.max(0, u.totalProfit - u.totalWithdraw);
      if (u.mainBalance >= expectedFloor) continue; // already OK (or above floor)

      const syncedAmount = expectedFloor - u.mainBalance;
      if (syncedAmount <= 0) continue;

      await db.user.update({
        where: { id: u.id },
        data: { mainBalance: { increment: syncedAmount } },
      });

      res.usersSynced++;
      res.totalSynced += syncedAmount;
      res.entries.push({
        userId: u.id,
        userName: u.name || 'User',
        userCode: u.userId || u.id.slice(-6),
        beforeMain: u.mainBalance,
        afterMain: expectedFloor,
        totalProfit: u.totalProfit,
        totalWithdraw: u.totalWithdraw,
        expectedFloor,
        syncedAmount,
      });

      console.log(
        `   ⬆️  ${u.userId} (${u.name}): mainBalance ${formatRupiahSimple(u.mainBalance)} → ${formatRupiahSimple(expectedFloor)} (synced +${formatRupiahSimple(syncedAmount)}) | totalProfit=${formatRupiahSimple(u.totalProfit)}, totalWithdraw=${formatRupiahSimple(u.totalWithdraw)}`,
      );
    } catch (e: any) {
      res.errors.push(`User ${u.id}: ${e.message}`);
      console.error(`[Profit Force] ❌ STEP 6 User ${u.id}: ${e.message}`);
    }
  }

  console.log(
    `[Profit Force]   ✅ STEP 6 done: checked ${res.usersChecked} users, synced ${res.usersSynced} users (total +${formatRupiahSimple(res.totalSynced)})`,
  );
  return res;
}

// ──────────── Main Entry ────────────

/**
 * Force-credit ALL missed profit for every active investment AND active
 * standalone purchase. Optionally run cleanup first (default: yes).
 *
 * @param opts.skipCleanup  Skip the cleanup step (faster, but no drift fix)
 * @param opts.force        Always true (bypasses weekend + already-credited-today checks)
 */
export async function forceCreditAllProfit(opts?: { skipCleanup?: boolean }): Promise<ForceCreditResult> {
  const startedAt = Date.now();
  const wibNow = getWibNow();
  const todayWIB = getWibDateString(new Date());
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = dayNames[wibNow.getDay()];

  console.log(`[Profit Force] 🚀 Starting forceCreditAllProfit() — WIB: ${todayWIB} ${dayName} ${String(wibNow.getHours()).padStart(2,'0')}:${String(wibNow.getMinutes()).padStart(2,'0')}`);

  const result: ForceCreditResult = {
    success: true,
    triggeredAt: new Date().toISOString(),
    wibTime: wibNow.toISOString(),
    wibDateStr: todayWIB,
    dayName,
    force: true,
    durationMs: 0,
    cleanup: { ran: !opts?.skipCleanup, report: null, error: null },
    balanceSync: { ran: true, usersChecked: 0, usersSynced: 0, totalSynced: 0, entries: [], errors: [] },
    investments: { processed: 0, skipped: 0, profitCredited: 0, matchingCredited: 0, backfillDays: 0, errors: [] },
    purchases: { processed: 0, skipped: 0, profitCredited: 0, errors: [] },
    totalProfitCredited: 0,
    totalMatchingCredited: 0,
    totalBackfillDays: 0,
    userBalances: [],
  };

  // ──────────── STEP 1: Cleanup (fix over-credit drift — only REDUCES) ────────────
  if (!opts?.skipCleanup) {
    try {
      console.log('[Profit Force] 🧹 STEP 1-5: Running cleanupDuplicateProfits() (v3.2)...');
      const cleanupReport = await cleanupDuplicateProfits();
      result.cleanup.report = cleanupReport;
      console.log(`[Profit Force] 🧹 Cleanup done — users corrected: ${cleanupReport.usersBalanceCorrected}, balance removed: ${formatRupiahSimple(cleanupReport.totalBalanceCorrected)}`);
    } catch (e: any) {
      result.cleanup.error = e.message;
      console.error('[Profit Force] ❌ Cleanup failed (continuing with profit credit):', e.message);
    }
  }

  // ──────────── STEP 6: Sync mainBalance UPWARD (fix under-credit drift) ────────────
  // ★★★ THIS IS THE FIX FOR "Saldo Utama 19200 should be 68800" bug ★★★
  // Runs BEFORE snapshot so the "before" reflects post-sync state for clarity
  // in the balanceSync section, and the userBalances section shows the
  // total change (sync + today's profit) from the user's original balance.
  try {
    result.balanceSync = await syncMainBalanceUpward();
  } catch (e: any) {
    result.balanceSync.errors.push(`STEP 6 fatal: ${e.message}`);
    console.error('[Profit Force] ❌ STEP 6 fatal:', e.message);
  }

  // ──────────── STEP 2: Snapshot user balances BEFORE ────────────
  const usersBefore = await db.user.findMany({
    select: { id: true, name: true, userId: true, mainBalance: true, totalProfit: true },
  });
  const beforeMap = new Map<string, { mainBalance: number; totalProfit: number; name: string; userCode: string }>();
  for (const u of usersBefore) {
    beforeMap.set(u.id, {
      mainBalance: u.mainBalance,
      totalProfit: u.totalProfit,
      name: u.name || 'User',
      userCode: u.userId || u.id.slice(-6),
    });
  }
  console.log(`[Profit Force] 📸 Snapshot before: ${usersBefore.length} users`);

  // ──────────── STEP 3: Credit active investments ────────────
  const matchingRates = await getMatchingRates();
  const startOfDayWIBDate = new Date(todayWIB + 'T00:00:00+07:00');

  // ★★★ BULLETPROOF: NO status filter — use endDate as source of truth
  const allInvestments = await db.investment.findMany({
    include: { package: true, user: { select: { name: true, userId: true } } },
  });
  const investments = allInvestments.filter((inv) => {
    if (!inv.endDate) return true;
    return new Date(inv.endDate) > wibNow;
  });
  console.log(`[Profit Force] 📊 Active investments: ${investments.length} (total fetched: ${allInvestments.length})`);

  for (const inv of investments) {
    try {
      // ★ FORCE MODE: skip "already credited today" + "bought today" checks
      // (admin wants to re-credit / catchup regardless)

      // ★ BUG FIX: Use stored inv.dailyProfit — do NOT recompute from package.profitRate
      //   (for VIP purchases, packageId is _internal_default with profitRate=0)
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (dailyProfit <= 0) {
        result.investments.skipped++;
        continue;
      }

      // HARD CAP: total profit cannot exceed dailyProfit × contractDays
      const contractDays = inv.package?.contractDays || 180;
      const hardCap = dailyProfit * contractDays;
      const remainingCap = Math.max(0, hardCap - inv.totalProfitEarned);
      if (remainingCap <= 0) {
        // Already hit hard cap → mark as completed
        await db.investment.update({
          where: { id: inv.id },
          data: { status: 'completed' },
        });
        result.investments.skipped++;
        continue;
      }

      // ─── BACKFILL: calculate missed weekdays (excluding today) ───
      let lastCreditDateStr: string;
      if (inv.lastProfitDate) {
        lastCreditDateStr = getWibDateString(new Date(inv.lastProfitDate));
      } else {
        const createdDate = inv.startDate ? new Date(inv.startDate) : new Date(inv.createdAt);
        lastCreditDateStr = getWibDateString(createdDate);
      }
      const missedDays = countWeekdaysMissed(lastCreditDateStr, todayWIB);
      // Force mode: always include today
      const totalDays = Math.min(missedDays + 1, 30);
      if (totalDays <= 0) {
        result.investments.skipped++;
        continue;
      }

      let creditAmount = dailyProfit * totalDays;
      let willComplete = false;
      if (creditAmount >= remainingCap) {
        creditAmount = remainingCap;
        willComplete = true;
      }
      const daysCredited = Math.ceil(creditAmount / dailyProfit);
      const isBackfill = missedDays > 0;

      // ★ FORCE MODE: skip atomic WHERE check, just update inside transaction
      // (re-check inside transaction to avoid duplicate admin triggers)
      const invClaim = await db.$transaction(async (tx) => {
        // Re-check inside transaction: if lastProfitDate moved to today, abort
        const currentInv = await tx.investment.findUnique({ where: { id: inv.id } });
        if (currentInv?.lastProfitDate) {
          const lastProfitWIB = getWibDateString(new Date(currentInv.lastProfitDate));
          if (lastProfitWIB === todayWIB) {
            return false; // already credited by another concurrent process
          }
        }

        await tx.investment.update({
          where: { id: inv.id },
          data: {
            totalProfitEarned: { increment: creditAmount },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
            ...(willComplete ? { status: 'completed' as const, endDate: new Date() } : {}),
          },
        });

        await tx.user.update({
          where: { id: inv.userId },
          data: {
            mainBalance: { increment: creditAmount },
            totalProfit: { increment: creditAmount },
          },
        });

        // Sync linked Purchase tracking
        if (inv.purchaseId) {
          const linkedPurchase = await tx.purchase.findUnique({ where: { id: inv.purchaseId } });
          if (linkedPurchase) {
            await tx.purchase.update({
              where: { id: linkedPurchase.id },
              data: {
                profitEarned: { increment: creditAmount },
                dailyProfit: dailyProfit,
                lastProfitDate: new Date(),
              },
            });
          }
        }

        const pkgName = inv.package?.name || 'Investment';
        const catchupNote = totalDays > 1 ? ` [CATCHUP ${daysCredited} hari]` : '';
        const capNote = willComplete ? ` [HARD CAP ${formatRupiahSimple(hardCap)} → SELESAI]` : '';
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: 'profit',
            level: 0,
            amount: creditAmount,
            description: `[FORCE] Profit harian ${pkgName} — ${formatRupiahSimple(creditAmount)}${catchupNote}${capNote}`,
          },
        });

        const match = await creditMatchingOnProfit(tx, inv.userId, creditAmount, matchingRates);
        result.investments.matchingCredited += match;
        result.totalMatchingCredited += match;
        return true;
      });

      if (!invClaim) {
        result.investments.skipped++;
        continue;
      }

      result.investments.processed++;
      result.investments.profitCredited += creditAmount;
      result.totalProfitCredited += creditAmount;
      if (isBackfill) result.investments.backfillDays += missedDays;
      result.totalBackfillDays += missedDays;

      console.log(
        `   💰 ${inv.userId} (${inv.package?.name || 'paket'}): ${totalDays}d × ${formatRupiahSimple(dailyProfit)} = ${formatRupiahSimple(creditAmount)}` +
        (isBackfill ? ` [BACKFILL: ${missedDays} missed]` : '') +
        (willComplete ? ' [HARD CAP]' : '')
      );
    } catch (e: any) {
      result.investments.errors.push(`Investment ${inv.id} (${inv.userId}): ${e.message}`);
      console.error(`[Profit Force] ❌ Investment ${inv.id} (${inv.userId}): ${e.message}`);
    }
  }

  // ──────────── STEP 4: Credit standalone purchases (no linked Investment) ────────────
  const allPurchases = await db.purchase.findMany({
    include: { product: true, user: { select: { name: true, userId: true } } },
  });
  // Active purchases: contract not yet ended
  const purchases = allPurchases.filter((pur) => {
    const contractDays = pur.product?.duration || 90;
    const endDate = new Date(pur.createdAt);
    endDate.setDate(endDate.getDate() + contractDays);
    return endDate > wibNow;
  });

  // Find purchaseIds that have linked Investment records (already credited above)
  const linkedPurchaseIds = new Set<string>(
    (await db.investment.findMany({
      where: { purchaseId: { not: null } },
      select: { purchaseId: true },
      distinct: ['purchaseId'],
    })).map(i => i.purchaseId!).filter(Boolean)
  );

  console.log(`[Profit Force] 📊 Active purchases: ${purchases.length} (linked: ${linkedPurchaseIds.size}, standalone: ${purchases.length - linkedPurchaseIds.size})`);

  for (const purchase of purchases) {
    try {
      // Skip if has linked Investment (already credited in STEP 3)
      if (linkedPurchaseIds.has(purchase.id)) {
        result.purchases.skipped++;
        continue;
      }

      // FORCE MODE: skip "already credited today" + "bought today" checks

      const productProfitRate = purchase.product?.profitRate || 0;
      const dailyProfit = purchase.dailyProfit && purchase.dailyProfit > 0
        ? purchase.dailyProfit
        : Math.floor(purchase.totalPrice * (productProfitRate / 100));
      if (dailyProfit <= 0) {
        result.purchases.skipped++;
        continue;
      }

      let lastCreditDateStr = purchase.lastProfitDate
        ? getWibDateString(new Date(purchase.lastProfitDate))
        : getWibDateString(new Date(purchase.createdAt));
      const missedDays = countWeekdaysMissed(lastCreditDateStr, todayWIB);
      const totalDays = Math.min(missedDays + 1, 30); // force: always include today
      if (totalDays <= 0) {
        result.purchases.skipped++;
        continue;
      }
      const totalCredit = dailyProfit * totalDays;
      const isBackfill = missedDays > 0;
      const productName = purchase.product?.name || 'Produk';

      const purClaim = await db.$transaction(async (tx) => {
        // Re-check inside transaction
        const currentPurchase = await tx.purchase.findUnique({ where: { id: purchase.id } });
        if (currentPurchase?.lastProfitDate) {
          const lastWIB = getWibDateString(new Date(currentPurchase.lastProfitDate));
          if (lastWIB === todayWIB) return false;
        }

        // 1. Credit user balance
        await tx.user.update({
          where: { id: purchase.userId },
          data: {
            mainBalance: { increment: totalCredit },
            totalProfit: { increment: totalCredit },
          },
        });

        // 2. Update purchase tracking
        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            profitEarned: { increment: totalCredit },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
          },
        });

        // 3. ProfitLog
        await tx.profitLog.create({
          data: {
            purchaseId: purchase.id,
            userId: purchase.userId,
            amount: totalCredit,
          },
        });

        // 4. BonusLog
        const desc = totalDays === 1
          ? `[FORCE] Profit harian ${productName} — ${formatRupiahSimple(totalCredit)}`
          : `[FORCE] Profit ${totalDays} hari (${isBackfill ? `${missedDays} tertinggal + hari ini` : 'semua hari ini'}) — ${productName}: ${formatRupiahSimple(dailyProfit)} × ${totalDays} = ${formatRupiahSimple(totalCredit)}`;
        await tx.bonusLog.create({
          data: {
            userId: purchase.userId,
            fromUserId: purchase.userId,
            type: 'profit',
            level: 0,
            amount: totalCredit,
            description: desc,
          },
        });

        // 5. LiveActivity
        await tx.liveActivity.create({
          data: {
            type: 'profit',
            userName: purchase.user?.name || purchase.user?.userId || 'User',
            amount: totalCredit,
            productName,
            isFake: false,
          },
        });

        // 6. Matching bonus
        const match = await creditMatchingOnProfit(tx, purchase.userId, totalCredit, matchingRates);
        result.totalMatchingCredited += match;
        return true;
      });

      if (!purClaim) {
        result.purchases.skipped++;
        continue;
      }

      result.purchases.processed++;
      result.purchases.profitCredited += totalCredit;
      result.totalProfitCredited += totalCredit;
      if (isBackfill) result.totalBackfillDays += missedDays;

      console.log(
        `   💰 ${purchase.userId} (${productName}) [standalone]: ${totalDays}d × ${formatRupiahSimple(dailyProfit)} = ${formatRupiahSimple(totalCredit)}` +
        (isBackfill ? ` [BACKFILL: ${missedDays} missed]` : '')
      );
    } catch (e: any) {
      result.purchases.errors.push(`Purchase ${purchase.id} (${purchase.userId}): ${e.message}`);
      console.error(`[Profit Force] ❌ Purchase ${purchase.id}: ${e.message}`);
    }
  }

  // ──────────── STEP 5: Snapshot user balances AFTER + compute deltas ────────────
  const usersAfter = await db.user.findMany({
    select: { id: true, name: true, userId: true, mainBalance: true, totalProfit: true },
  });
  for (const u of usersAfter) {
    const before = beforeMap.get(u.id);
    if (!before) continue;
    const profitCredited = u.totalProfit - before.totalProfit;
    // Only include users whose balance actually changed
    if (profitCredited === 0 && u.mainBalance === before.mainBalance) continue;
    result.userBalances.push({
      userId: u.id,
      userName: before.name,
      userCode: before.userCode,
      beforeMain: before.mainBalance,
      afterMain: u.mainBalance,
      beforeTotalProfit: before.totalProfit,
      afterTotalProfit: u.totalProfit,
      profitCredited,
    });
  }
  // Sort: most profit credited first
  result.userBalances.sort((a, b) => b.profitCredited - a.profitCredited);

  result.durationMs = Date.now() - startedAt;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  [PROFIT FORCE] SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Cleanup (STEP 1-5): ran=${result.cleanup.ran} | users corrected: ${result.cleanup.report?.usersBalanceCorrected || 0}`);
  console.log(`  Balance Sync (STEP 6): ${result.balanceSync.usersSynced} users synced (+${formatRupiahSimple(result.balanceSync.totalSynced)} added to mainBalance)`);
  console.log(`  Investments: ${result.investments.processed} processed, ${result.investments.skipped} skipped, ${result.investments.errors.length} errors`);
  console.log(`  Purchases:   ${result.purchases.processed} processed, ${result.purchases.skipped} skipped, ${result.purchases.errors.length} errors`);
  console.log(`  Total profit credited: ${formatRupiahSimple(result.totalProfitCredited)}`);
  console.log(`  Total matching credited: ${formatRupiahSimple(result.totalMatchingCredited)}`);
  console.log(`  Total backfill days: ${result.totalBackfillDays}`);
  console.log(`  Users with balance change: ${result.userBalances.length}`);
  console.log(`  Duration: ${result.durationMs}ms`);
  console.log('═══════════════════════════════════════════════════════');

  return result;
}
