/**
 * NEXVO Cron Service
 *
 * Runs scheduled tasks automatically:
 * - Daily Investment Profit: Every day at 00:00 WIB
 *   + Immediately credits matching profit to upline (event-driven)
 * - Weekly Salary Bonus: Every Monday at 00:00 WIB
 *
 * Uses Prisma directly to access the database.
 * Port: 3032
 */

import { PrismaClient } from '@prisma/client';

const PORT = 3032;
const WIB_OFFSET = 7; // UTC+7 for Asia/Jakarta

// Prisma client with absolute path
const db = new PrismaClient({
  datasources: {
    db: {
      url: `file:${process.cwd()}/../../db/custom.db`,
    },
  },
});

// ──────────── Constants ────────────

const DEFAULT_MATCHING_RATES: Record<number, number> = {
  1: 5,
  2: 4,
  3: 3,
  4: 2,
  5: 1,
};
const MAX_MATCHING_LEVEL = 5; // Level 6+ = auto disconnect

// ──────────── Time Helpers ────────────

function getWibNow(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + WIB_OFFSET * 3600000);
}

function getWeekInfo(date: Date): { weekNumber: number; year: number } {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return { weekNumber: Math.ceil(dayOfYear / 7), year: date.getFullYear() };
}

function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

/**
 * Count WEEKDAYS (Mon-Fri) between two dates (exclusive start, inclusive end).
 * Used for auto-catchup: if cron was down across a weekend, we only credit
 * the missed weekdays (Sat/Sun are LIBUR — no profit, no catchup for them).
 */
function countWeekdaysBetween(startWib: Date, endWib: Date): number {
  let count = 0;
  const current = new Date(startWib.getFullYear(), startWib.getMonth(), startWib.getDate());
  current.setDate(current.getDate() + 1); // start from day AFTER last profit
  const end = new Date(endWib.getFullYear(), endWib.getMonth(), endWib.getDate());
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++; // not Sunday(0) or Saturday(6)
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// ──────────── Matching Config Helper ────────────

async function getMatchingRates(): Promise<Record<number, number>> {
  const config = await db.matchingConfig.findFirst({ where: { isActive: true } });
  if (!config) return { ...DEFAULT_MATCHING_RATES };
  return {
    1: config.level1,
    2: config.level2,
    3: config.level3,
    4: config.level4,
    5: config.level5,
  };
}

// ──────────── Matching Bonus (Event-Driven) ────────────

/**
 * Credit matching bonus to upline when a downline earns profit.
 * This is called immediately after crediting daily investment profit.
 * Level 6+ = AUTO DISCONNECT (no matching bonus).
 */
async function creditMatchingOnProfit(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  earningUserId: string,
  profitAmount: number,
): Promise<{
  totalMatchCredited: number;
  details: Array<{ level: number; uplineId: string; rate: number; amount: number; disconnected: boolean }>;
}> {
  const result = {
    totalMatchCredited: 0,
    details: [] as Array<{ level: number; uplineId: string; rate: number; amount: number; disconnected: boolean }>,
  };

  if (profitAmount <= 0) return result;

  // Find all upline members for this user
  const uplineRefs = await tx.referral.findMany({
    where: { referredId: earningUserId },
    orderBy: { level: 'asc' },
  });

  if (uplineRefs.length === 0) return result;

  // Get the earning user's info
  const earningUser = await tx.user.findUnique({
    where: { id: earningUserId },
    select: { name: true, userId: true },
  });
  const earningUserName = earningUser?.name || earningUser?.userId || 'User';

  // Get matching rates
  const rates = await getMatchingRates();

  // Process each upline level
  for (const ref of uplineRefs) {
    const level = ref.level;

    // AUTO DISCONNECT: Level 6+ gets NO matching bonus
    if (level > MAX_MATCHING_LEVEL) {
      result.details.push({
        level,
        uplineId: ref.referrerId,
        rate: 0,
        amount: 0,
        disconnected: true,
      });
      continue;
    }

    const rate = rates[level] || 0;
    if (rate <= 0) continue;

    const matchAmount = Math.floor(profitAmount * (rate / 100));
    if (matchAmount <= 0) continue;

    // Credit matching bonus to upline's mainBalance
    await tx.user.update({
      where: { id: ref.referrerId },
      data: {
        mainBalance: { increment: matchAmount },
        totalProfit: { increment: matchAmount },
      },
    });

    // Create MatchingBonus record
    await tx.matchingBonus.create({
      data: {
        userId: ref.referrerId,
        leftOmzet: 0,
        rightOmzet: 0,
        matchedOmzet: profitAmount,
        level,
        rate,
        amount: matchAmount,
        status: 'paid',
      },
    });

    // Create BonusLog entry
    await tx.bonusLog.create({
      data: {
        userId: ref.referrerId,
        fromUserId: earningUserId,
        type: 'matching',
        level,
        amount: matchAmount,
        description: `Matching Profit Level ${level} (${rate}%) dari profit ${earningUserName} — ${formatRupiahSimple(profitAmount)} × ${rate}% = ${formatRupiahSimple(matchAmount)}`,
      },
    });

    result.totalMatchCredited += matchAmount;
    result.details.push({
      level,
      uplineId: ref.referrerId,
      rate,
      amount: matchAmount,
      disconnected: false,
    });
  }

  return result;
}

// ──────────── Salary Bonus Logic ────────────

async function getDirectRefCount(internalId: string): Promise<number> {
  return db.referral.count({ where: { referrerId: internalId, level: 1 } });
}

async function getActiveDepositRefCount(internalId: string): Promise<number> {
  const directRefs = await db.referral.findMany({
    where: { referrerId: internalId, level: 1 },
    select: { referredId: true },
  });
  if (directRefs.length === 0) return 0;
  const refIds = directRefs.map(r => r.referredId);
  const usersWithActiveInvestments = await db.investment.groupBy({
    by: ['userId'],
    where: { userId: { in: refIds }, status: 'active' },
    _count: true,
  });
  return usersWithActiveInvestments.length;
}

async function getAllDownlineIds(internalId: string, maxDepth: number = 5): Promise<string[]> {
  const allIds: string[] = [];
  const visited = new Set<string>();
  let currentLevelIds: string[] = [internalId];
  for (let depth = 0; depth < maxDepth; depth++) {
    const nextLevelIds: string[] = [];
    const referrals = await db.referral.findMany({
      where: { referrerId: { in: currentLevelIds }, level: 1 },
      select: { referredId: true },
    });
    for (const ref of referrals) {
      if (!visited.has(ref.referredId)) {
        visited.add(ref.referredId);
        allIds.push(ref.referredId);
        nextLevelIds.push(ref.referredId);
      }
    }
    if (nextLevelIds.length === 0) break;
    currentLevelIds = nextLevelIds;
  }
  return allIds;
}

async function calculateGroupOmzet(internalId: string): Promise<number> {
  const ownInvestment = await db.investment.aggregate({
    where: { userId: internalId, status: 'active' },
    _sum: { amount: true },
  });
  const downlineIds = await getAllDownlineIds(internalId, 5);
  let downlineOmzet = 0;
  if (downlineIds.length > 0) {
    const downlineInvestment = await db.investment.aggregate({
      where: { userId: { in: downlineIds }, status: 'active' },
      _sum: { amount: true },
    });
    downlineOmzet = downlineInvestment._sum.amount || 0;
  }
  return (ownInvestment._sum.amount || 0) + downlineOmzet;
}

async function processAllSalaryBonuses(): Promise<{
  processed: number;
  eligible: number;
  skipped: number;
  completed: number;
  errors: number;
  totalAmount: number;
}> {
  const result = { processed: 0, eligible: 0, skipped: 0, completed: 0, errors: 0, totalAmount: 0 };

  const config = await db.salaryConfig.findFirst({ where: { isActive: true } });
  if (!config) {
    console.log('[Salary Cron] No active salary config. Skipping.');
    return result;
  }

  const { weekNumber, year } = getWeekInfo(getWibNow());

  const users = await db.user.findMany({
    where: { isSuspended: false, isVerified: true },
    select: { id: true, userId: true },
  });

  console.log(`[Salary Cron] Week ${weekNumber}/${year} — Checking ${users.length} users...`);

  for (const user of users) {
    try {
      const refCount = await getDirectRefCount(user.id);
      if (refCount < config.minDirectRefs) {
        result.skipped++;
        continue;
      }

      // maxWeeks = 0 means PERMANENT (no limit). Only check limit if maxWeeks > 0.
      const weeksReceived = await db.salaryBonus.count({ where: { userId: user.id, status: 'paid' } });
      if (config.maxWeeks > 0 && weeksReceived >= config.maxWeeks) {
        result.completed++;
        continue;
      }

      const existing = await db.salaryBonus.findUnique({
        where: { userId_weekNumber_year: { userId: user.id, weekNumber, year } },
      });
      if (existing) {
        result.skipped++;
        continue;
      }

      const effectiveRefs = config.requireActiveDeposit
        ? await getActiveDepositRefCount(user.id)
        : refCount;

      if (effectiveRefs < config.minDirectRefs) {
        result.skipped++;
        continue;
      }

      const groupOmzet = await calculateGroupOmzet(user.id);
      const salaryAmount = Math.floor(groupOmzet * (config.salaryRate / 100));

      if (salaryAmount <= 0) {
        result.skipped++;
        continue;
      }

      // If permanent (maxWeeks=0), show 0/∞ style; otherwise show running total
      const currentWeekOfTotal = config.maxWeeks > 0 ? weeksReceived + 1 : 0;

      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            mainBalance: { increment: salaryAmount },
            totalProfit: { increment: salaryAmount },
          },
        });

        await tx.salaryBonus.create({
          data: {
            userId: user.id,
            weekNumber,
            year,
            weekOfTotal: currentWeekOfTotal,
            amount: salaryAmount,
            baseOmzet: groupOmzet,
            salaryRate: config.salaryRate,
            activeRefDeposits: effectiveRefs,
            directRefs: refCount,
            groupOmzet,
            status: 'paid',
          },
        });

        await tx.bonusLog.create({
          data: {
            userId: user.id,
            fromUserId: user.id,
            type: 'salary',
            level: 0,
            amount: salaryAmount,
            description: `Gaji mingguan otomatis Minggu ${weekNumber}/${year} ${config.maxWeeks > 0 ? `(${currentWeekOfTotal}/${config.maxWeeks})` : '(permanen)'} - ${effectiveRefs} referral aktif, omzet ${formatRupiahSimple(groupOmzet)}, rate ${config.salaryRate}%`,
          },
        });
      });

      result.eligible++;
      result.totalAmount += salaryAmount;
      result.processed++;
      console.log(`[Salary Cron] ✅ ${user.userId}: ${formatRupiahSimple(salaryAmount)} ${config.maxWeeks > 0 ? `(Week ${currentWeekOfTotal}/${config.maxWeeks})` : '(permanen)'}`);
    } catch (error: any) {
      result.errors++;
      console.error(`[Salary Cron] ❌ ${user.userId}: ${error.message}`);
    }
  }

  console.log(`[Salary Cron] Done. Eligible: ${result.eligible}, Total: ${formatRupiahSimple(result.totalAmount)}, Skipped: ${result.skipped}, Completed: ${result.completed}, Errors: ${result.errors}`);
  return result;
}

// ──────────── Daily Investment Profit Logic ────────────

async function processDailyInvestmentProfits(): Promise<{
  processed: number;
  totalProfit: number;
  totalMatching: number;
  errors: number;
}> {
  const result = { processed: 0, totalProfit: 0, totalMatching: 0, errors: 0 };

  // ★ WEEKEND LIBUR: No profit on Saturday (6) & Sunday (0) — semua aktivitas mati ★
  const wibNow = getWibNow();
  const dayOfWeek = wibNow.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    const dayName = dayOfWeek === 0 ? 'Minggu' : 'Sabtu';
    console.log(`[Profit Cron] ⏸️ SKIPPED — today is ${dayName} (weekend libur, semua aktivitas mati).`);
    return result;
  }

  const now = wibNow;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get all active investments
  const investments = await db.investment.findMany({
    where: { status: 'active' },
    include: { package: true },
  });

  console.log(`[Profit Cron] Processing ${investments.length} active investments...`);

  for (const inv of investments) {
    try {
      // Check if already credited today
      if (inv.lastProfitDate) {
        const lastDate = new Date(inv.lastProfitDate);
        if (lastDate.getFullYear() === today.getFullYear() &&
            lastDate.getMonth() === today.getMonth() &&
            lastDate.getDate() === today.getDate()) {
          continue; // Already credited today
        }
      }

      // Check if investment has ended
      if (inv.endDate) {
        const endDate = new Date(inv.endDate);
        if (now >= endDate) {
          await db.investment.update({
            where: { id: inv.id },
            data: { status: 'completed' },
          });
          continue;
        }
      }

      // ★ HARD CAP: total profit cannot exceed dailyProfit × contractDays
      // e.g. 3,200/day × 180 days = 576,000 (for 160k investment @ 2%/day)
      const dailyProfit = Math.floor(inv.amount * (inv.package.profitRate / 100));
      const contractDays = inv.package.contractDays || 180;
      const hardCap = dailyProfit * contractDays;
      const remainingCap = Math.max(0, hardCap - inv.totalProfitEarned);

      if (remainingCap <= 0) {
        // Already hit hard cap → mark as completed
        await db.investment.update({
          where: { id: inv.id },
          data: { status: 'completed' },
        });
        console.log(`[Profit Cron] ✅ Investment ${inv.id} hit hard cap ${formatRupiahSimple(hardCap)} → marked completed`);
        continue;
      }

      // ★ AUTO-CATCHUP: if cron was down for N WEEKDAYS, credit all missed weekdays at once ★
      // Weekend (Sat/Sun) = LIBUR, tidak dihitung dalam catchup
      let missedDays = 1; // default today (already a weekday since we skipped weekend above)
      if (inv.lastProfitDate) {
        const lastDate = new Date(inv.lastProfitDate);
        const lastWib = new Date(lastDate.getTime() + lastDate.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
        missedDays = countWeekdaysBetween(lastWib, now);
        if (missedDays <= 0) continue; // already credited all weekdays up to today
      }

      // Total profit to credit = dailyProfit × missedDays, but capped by remainingCap
      let creditAmount = dailyProfit * missedDays;
      let willComplete = false;
      if (creditAmount >= remainingCap) {
        creditAmount = remainingCap;
        willComplete = true;
      }
      const daysCredited = Math.ceil(creditAmount / dailyProfit);

      await db.$transaction(async (tx) => {
        // ★ RE-CHECK inside transaction to prevent double credit (race condition) ★
        const currentInv = await tx.investment.findUnique({ where: { id: inv.id } });
        if (currentInv?.lastProfitDate) {
          const lastDate = new Date(currentInv.lastProfitDate);
          const lastWib = new Date(lastDate.getTime() + lastDate.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
          const recheckMissed = countWeekdaysBetween(lastWib, now);
          if (recheckMissed <= 0) return; // Already credited all weekdays — skip
        }

        // Re-check hard cap inside transaction
        const currentEarned = currentInv?.totalProfitEarned || 0;
        const currentRemaining = Math.max(0, hardCap - currentEarned);
        if (currentRemaining <= 0) {
          await tx.investment.update({
            where: { id: inv.id },
            data: { status: 'completed' },
          });
          return;
        }
        let finalCredit = creditAmount;
        if (finalCredit > currentRemaining) {
          finalCredit = currentRemaining;
          willComplete = true;
        }

        // 1. Credit profit to user's mainBalance
        await tx.user.update({
          where: { id: inv.userId },
          data: {
            mainBalance: { increment: finalCredit },
            totalProfit: { increment: finalCredit },
          },
        });

        // 2. Update investment record
        await tx.investment.update({
          where: { id: inv.id },
          data: {
            totalProfitEarned: { increment: finalCredit },
            dailyProfit: dailyProfit,
            lastProfitDate: now,
            ...(willComplete ? { status: 'completed' as const, endDate: now } : {}),
          },
        });

        // 3. Create profit log
        const purchase = await tx.purchase.findFirst({
          where: { userId: inv.userId, status: 'active' },
          orderBy: { createdAt: 'desc' },
        });

        if (purchase) {
          await tx.profitLog.create({
            data: {
              purchaseId: purchase.id,
              userId: inv.userId,
              amount: finalCredit,
            },
          });
        }

        // 4. Create bonus log for daily profit
        const catchupNote = missedDays > 1 ? ` [CATCHUP ${daysCredited} hari]` : '';
        const capNote = willComplete ? ` [HARD CAP ${formatRupiahSimple(hardCap)} → SELESAI]` : '';
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: 'reward',
            level: 0,
            amount: finalCredit,
            description: `Profit harian investasi ${formatRupiahSimple(inv.amount)} — ${formatRupiahSimple(finalCredit)}${catchupNote}${capNote}`,
          },
        });

        // 5. ★ EVENT-DRIVEN MATCHING BONUS (on total creditAmount) ★
        const matchResult = await creditMatchingOnProfit(tx, inv.userId, finalCredit);

        if (matchResult.totalMatchCredited > 0) {
          result.totalMatching += matchResult.totalMatchCredited;
        }
      });

      result.processed++;
      result.totalProfit += creditAmount;
    } catch (error: any) {
      result.errors++;
      console.error(`[Profit Cron] ❌ Investment ${inv.id}: ${error.message}`);
    }
  }

  console.log(`[Profit Cron] Done. Processed: ${result.processed}, Total Profit: ${formatRupiahSimple(result.totalProfit)}, Total Matching: ${formatRupiahSimple(result.totalMatching)}, Errors: ${result.errors}`);
  return result;
}

// ──────────── Product Quota Bump (Fake "Kuota Terisi" Activity) ────────────

/**
 * Auto-bump product quotaUsed so the "Kuota Terisi" counter keeps climbing
 * and looks busy/real (like nav.live). Runs every ~15 minutes.
 *
 * Behavior per product:
 *  - If quotaUsed >= quota (full): reset to random 5-12% of quota (new batch)
 *  - Otherwise: increment by random 2-9 (simulate new buyers)
 *  - Clamp so it never exceeds quota
 *
 * Returns summary of changes.
 */
async function bumpProductQuotas(): Promise<{
  processed: number;
  incremented: number;
  reset: number;
  totalBumped: number;
  details: Array<{ name: string; before: number; after: number; quota: number; action: 'increment' | 'reset' }>;
}> {
  const result = {
    processed: 0,
    incremented: 0,
    reset: 0,
    totalBumped: 0,
    details: [] as Array<{ name: string; before: number; after: number; quota: number; action: 'increment' | 'reset' }>,
  };

  let products;
  try {
    products = await db.product.findMany({
      where: { isActive: true, isStopped: false },
    });
  } catch (e: any) {
    console.error('[Quota Bump] ❌ Gagal query products:', e.message);
    return result;
  }

  for (const p of products) {
    try {
      result.processed++;
      const before = p.quotaUsed;
      let after = before;
      let action: 'increment' | 'reset' = 'increment';

      if (before >= p.quota) {
        // Full → reset ke 5-12% of quota (batch baru)
        const minUsed = Math.floor(p.quota * 0.05);
        const maxUsed = Math.floor(p.quota * 0.12);
        after = Math.floor(Math.random() * (maxUsed - minUsed + 1)) + minUsed;
        action = 'reset';
        result.reset++;
      } else {
        // Increment random 2-9 (simulate pembeli baru)
        const inc = Math.floor(Math.random() * 8) + 2; // 2..9
        after = Math.min(before + inc, p.quota);
        result.incremented++;
        result.totalBumped += (after - before);
      }

      if (after !== before) {
        await db.product.update({
          where: { id: p.id },
          data: { quotaUsed: after },
        });
      }

      result.details.push({ name: p.name, before, after, quota: p.quota, action });
      console.log(`[Quota Bump] ${p.name}: ${before}/${p.quota} → ${after}/${p.quota} (${action})`);
    } catch (e: any) {
      console.error(`[Quota Bump] ❌ ${p.name}: ${e.message}`);
    }
  }

  console.log(`[Quota Bump] Done. Processed: ${result.processed}, Incremented: ${result.incremented}, Reset: ${result.reset}, Total bumped: ${result.totalBumped}`);
  return result;
}

// ──────────── Cron Scheduler ────────────

let lastSalaryRunDate = '';
let lastProfitRunDate = '';
let lastQuotaBumpDateStr = '';

function checkAndRunCrons() {
  const wibNow = getWibNow();
  const dayOfWeek = wibNow.getDay(); // 0=Sun, 1=Mon
  const hour = wibNow.getHours();
  const minute = wibNow.getMinutes();
  const dateStr = `${wibNow.getFullYear()}-${wibNow.getMonth()}-${wibNow.getDate()}`;

  // ★ Daily profit + matching bonus: Every day at 00:00 WIB ★
  // ★ WEEKEND LIBUR: Skip on Saturday (6) & Sunday (0) — semua aktivitas mati ★
  if (hour === 0 && minute <= 2 && lastProfitRunDate !== dateStr) {
    lastProfitRunDate = dateStr;
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      const dayName = dayOfWeek === 0 ? 'Minggu' : 'Sabtu';
      console.log(`\n[CRON] ⏸️ Profit cron SKIPPED — today is ${dayName} (weekend libur, semua aktivitas mati).`);
    } else {
      console.log(`\n[CRON] 🌅 Running daily investment profit + matching bonus distribution at ${wibNow.toISOString()} (weekday only, with auto-catchup + hard cap)...`);
      processDailyInvestmentProfits().then((result) => {
        console.log(`[CRON] 🌅 Profit done: ${result.processed} investments, ${formatRupiahSimple(result.totalProfit)} profit, ${formatRupiahSimple(result.totalMatching)} matching, ${result.errors} errors`);
      }).catch(console.error);
    }
  }

  // Weekly salary: Every Monday at 00:00 WIB (check minute 0 with 2-min window)
  if (dayOfWeek === 1 && hour === 0 && minute <= 2 && lastSalaryRunDate !== dateStr) {
    lastSalaryRunDate = dateStr;
    console.log(`\n[CRON] 💰 Running weekly salary bonus distribution at ${wibNow.toISOString()}...`);
    processAllSalaryBonuses().then((result) => {
      console.log(`[CRON] 💰 Salary done: ${result.eligible} eligible, ${formatRupiahSimple(result.totalAmount)} total, ${result.skipped} skipped, ${result.errors} errors`);
    }).catch(console.error);
  }

  // Quota bump: every 15 minutes (minute 0, 15, 30, 45) — fake "Kuota Terisi" activity
  // Trigger sekali per slot 15-menit (window 2 menit)
  const slot15 = Math.floor(minute / 15); // 0,1,2,3
  const slotKey = `${dateStr}-q${slot15}`;
  if (minute % 15 <= 1 && lastQuotaBumpDateStr !== slotKey) {
    lastQuotaBumpDateStr = slotKey;
    console.log(`\n[CRON] 📈 Running product quota bump at ${wibNow.toISOString()}...`);
    bumpProductQuotas().then((r) => {
      console.log(`[CRON] 📈 Quota bump done: ${r.incremented} incremented, ${r.reset} reset, +${r.totalBumped} total`);
    }).catch(console.error);
  }
}

// ──────────── HTTP API (for manual triggers & status) ────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (url.pathname === '/') {
      return Response.json({
        service: 'NEXVO Cron Service',
        status: 'running',
        wibTime: getWibNow().toISOString(),
        lastSalaryRun: lastSalaryRunDate || 'never',
        lastProfitRun: lastProfitRunDate || 'never',
        lastQuotaBump: lastQuotaBumpDateStr || 'never',
        matchingMode: 'event-driven (credited with daily profit)',
      }, { headers: corsHeaders });
    }

    // Manual trigger: Salary bonus
    if (url.pathname === '/api/trigger/salary' && req.method === 'POST') {
      console.log('\n[CRON] 📌 Manual trigger: Salary bonus');
      const result = await processAllSalaryBonuses();
      return Response.json({ success: true, data: result }, { headers: corsHeaders });
    }

    // Manual trigger: Daily profit + matching
    if (url.pathname === '/api/trigger/profit' && req.method === 'POST') {
      console.log('\n[CRON] 📌 Manual trigger: Daily profit + matching');
      const result = await processDailyInvestmentProfits();
      return Response.json({ success: true, data: result }, { headers: corsHeaders });
    }

    // Manual trigger: Matching bonus only (standalone)
    if (url.pathname === '/api/trigger/matching' && req.method === 'POST') {
      console.log('\n[CRON] 📌 Manual trigger: Matching bonus (runs full profit cycle to trigger matching)');
      const result = await processDailyInvestmentProfits();
      return Response.json({
        success: true,
        data: {
          matchingCredited: result.totalMatching,
          profitProcessed: result.processed,
          errors: result.errors,
        },
      }, { headers: corsHeaders });
    }

    // Manual trigger: Quota bump (fake "Kuota Terisi" activity)
    if (url.pathname === '/api/trigger/quota-bump' && req.method === 'POST') {
      console.log('\n[CRON] 📌 Manual trigger: Quota bump');
      const result = await bumpProductQuotas();
      return Response.json({ success: true, data: result }, { headers: corsHeaders });
    }

    // Status endpoint
    if (url.pathname === '/api/status') {
      return Response.json({
        wibTime: getWibNow().toISOString(),
        dayOfWeek: getWibNow().getDay(),
        lastSalaryRun: lastSalaryRunDate || 'never',
        lastProfitRun: lastProfitRunDate || 'never',
        lastQuotaBump: lastQuotaBumpDateStr || 'never',
        matchingMode: 'event-driven',
      }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  },
});

// ──────────── Start ────────────

console.log(`[Cron Service] 🚀 Running on port ${PORT}`);
console.log(`[Cron Service] WIB Time: ${getWibNow().toISOString()}`);
console.log(`[Cron Service] Schedules:`);
console.log(`  - Daily Profit + Matching: 00:00 WIB WEEKDAYS ONLY (Sat/Sun = LIBUR, with auto-catchup + hard cap)`);
console.log(`  - Weekly Salary: 00:00 WIB every Monday`);
console.log(`  - Quota Bump: every 15 minutes (auto-increment Kuota Terisi, reset when full)`);
console.log(`  - Matching: Event-driven (credited automatically with daily profit)`);
console.log(`  - Level 6+ matching: AUTO DISCONNECT (no bonus)`);

// Check every 10 seconds for precise 00:00 WIB triggers + 15-min quota bump
setInterval(checkAndRunCrons, 10000);
checkAndRunCrons(); // Initial check

// Initial quota bump on startup (so counter moves immediately)
setTimeout(() => {
  console.log('\n[CRON] 📈 Initial quota bump on startup...');
  bumpProductQuotas().catch(console.error);
}, 5000);

