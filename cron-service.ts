/**
 * NEXVO Cron Service
 *
 * Runs scheduled tasks automatically:
 * - Daily Investment Profit: Every day at 00:00 WIB
 *   + Immediately credits matching profit to upline (event-driven)
 *   + Immediately credits daily referral bonus to upline (based on investment amount)
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
      url: `file:/home/nexvo/prisma/custom.db`,
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
const MAX_MATCHING_LEVEL = 5; // Level 6+ = auto Disconnect



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
 * Get the WIB date string (YYYY-MM-DD) from a Date object.
 * Handles timezone conversion properly.
 */
function getWibDateString(date: Date): string {
  const wibDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
  return `${wibDate.getFullYear()}-${String(wibDate.getMonth() + 1).padStart(2, '0')}-${String(wibDate.getDate()).padStart(2, '0')}`;
}

function getTodayWibDateString(): string {
  return getWibDateString(new Date());
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

  const uplineRefs = await tx.referral.findMany({
    where: { referredId: earningUserId },
    orderBy: { level: 'asc' },
  });

  if (uplineRefs.length === 0) return result;

  const earningUser = await tx.user.findUnique({
    where: { id: earningUserId },
    select: { name: true, userId: true },
  });
  const earningUserName = earningUser?.name || earningUser?.userId || 'User';

  const rates = await getMatchingRates();

  for (const ref of uplineRefs) {
    const level = ref.level;

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

    await tx.user.update({
      where: { id: ref.referrerId },
      data: {
        mainBalance: { increment: matchAmount },
        totalProfit: { increment: matchAmount },
      },
    });

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

    await tx.bonusLog.create({
      data: {
        userId: ref.referrerId,
        fromUserId: earningUserId,
        type: 'matching',
        level,
        amount: matchAmount,
        description: `M.Profit Level ${level} (${rate}%) dari profit ${earningUserName} — ${formatRupiahSimple(profitAmount)} x ${rate}% = ${formatRupiahSimple(matchAmount)}`,
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

      const weeksReceived = await db.salaryBonus.count({ where: { userId: user.id, status: 'paid' } });
      if (weeksReceived >= config.maxWeeks) {
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

      const currentWeekOfTotal = weeksReceived + 1;

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
            description: `Gaji mingguan Minggu ${weekNumber}/${year} (${currentWeekOfTotal}/${config.maxWeeks}) - ${effectiveRefs} referral aktif, omzet ${formatRupiahSimple(groupOmzet)}, rate ${config.salaryRate}%`,
          },
        });
      });

      result.eligible++;
      result.totalAmount += salaryAmount;
      result.processed++;
      console.log(`[Salary Cron] ✅ ${user.userId}: ${formatRupiahSimple(salaryAmount)} (Week ${currentWeekOfTotal}/${config.maxWeeks})`);
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

  const todayWIB = getTodayWibDateString();

  // Get all active investments
  const investments = await db.investment.findMany({
    where: { status: 'active' },
    include: { package: true },
  });

  console.log(`[Profit Cron] Processing ${investments.length} active investments... (WIB today: ${todayWIB})`);

  for (const inv of investments) {
    try {
      // Check if already credited today using WIB date string comparison
      if (inv.lastProfitDate) {
        const lastProfitWIB = getWibDateString(new Date(inv.lastProfitDate));
        if (lastProfitWIB === todayWIB) {
          continue; // Already credited today
        }
      }

      // ★ Same-day investment check: Skip if investment was created today (WIB)
      // Profit should ONLY start the day AFTER the investment was made.
      // If a user buys at 23:55 WIB, they should NOT get profit at 00:00 — wait until next 00:00.
      const investmentCreatedDate = inv.startDate ? new Date(inv.startDate) : new Date(inv.createdAt);
      const createdWIB = getWibDateString(investmentCreatedDate);
      if (createdWIB === todayWIB) {
        continue; // Investment made today — skip, profit starts tomorrow
      }

      // Check if investment has ended
      const wibNow = getWibNow();
      if (inv.endDate) {
        const endDate = new Date(inv.endDate);
        if (wibNow >= endDate) {
          await db.investment.update({
            where: { id: inv.id },
            data: { status: 'completed' },
          });
          continue;
        }
      }

      // Credit daily profit
      const dailyProfit = Math.floor(inv.amount * (inv.package.profitRate / 100));

      if (dailyProfit <= 0) continue;

      await db.$transaction(async (tx) => {
        // RE-CHECK inside transaction to prevent double credit
        const currentInv = await tx.investment.findUnique({ where: { id: inv.id } });
        if (currentInv?.lastProfitDate) {
          const lastProfitWIB = getWibDateString(new Date(currentInv.lastProfitDate));
          if (lastProfitWIB === todayWIB) {
            return; // Already credited today — skip
          }
        }

        // 1. Credit daily profit to user's mainBalance
        await tx.user.update({
          where: { id: inv.userId },
          data: {
            mainBalance: { increment: dailyProfit },
            totalProfit: { increment: dailyProfit },
          },
        });

        // 2. Update investment record
        await tx.investment.update({
          where: { id: inv.id },
          data: {
            totalProfitEarned: { increment: dailyProfit },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
          },
        });

        // 3. Create bonus log for daily profit (ONLY BonusLog, NOT ProfitLog)
        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: 'profit',
            level: 0,
            amount: dailyProfit,
            description: `Profit harian ${inv.package.name} — ${formatRupiahSimple(inv.amount)} x ${inv.package.profitRate}% = ${formatRupiahSimple(dailyProfit)}`,
          },
        });

        // 4. Event-driven matching bonus (based on PROFIT)
        const matchResult = await creditMatchingOnProfit(tx, inv.userId, dailyProfit);
        if (matchResult.totalMatchCredited > 0) {
          result.totalMatching += matchResult.totalMatchCredited;
        }

        // Referral bonus is now per-investment (credited when downline invests), NOT daily
      });

      result.processed++;
      result.totalProfit += dailyProfit;
    } catch (error: any) {
      result.errors++;
      console.error(`[Profit Cron] ❌ Investment ${inv.id}: ${error.message}`);
    }
  }

  // ═══════ Purchase (Product) Profit Processing ═══════
  // Products also generate daily profit via their Investment records.
  // Since purchases now create Investment records, we process them through investments above.
  // We only need to update the Purchase record's profitEarned and lastProfitDate for tracking.

  const purchases = await db.purchase.findMany({
    where: { status: 'active' },
    include: { product: true },
  });

  console.log(`[Profit Cron] Updating ${purchases.length} active product purchases...`);

  for (const purchase of purchases) {
    try {
      // Check if already updated today
      if (purchase.lastProfitDate) {
        const lastProfitWIB = getWibDateString(new Date(purchase.lastProfitDate));
        if (lastProfitWIB === todayWIB) {
          continue;
        }
      }

      // ★ Same-day purchase check: Skip if purchase was created today (WIB)
      // This MUST match the Investment same-day check to keep Purchase tracking in sync.
      const purchaseCreatedDate = purchase.createdAt ? new Date(purchase.createdAt) : null;
      if (purchaseCreatedDate) {
        const createdWIB = getWibDateString(purchaseCreatedDate);
        if (createdWIB === todayWIB) {
          continue; // Purchase made today — skip, profit starts tomorrow
        }
      }

      // Calculate daily profit for this purchase
      const productProfitRate = purchase.product?.profitRate || 0;
      const dailyProfit = Math.floor(purchase.totalPrice * (productProfitRate / 100));

      if (dailyProfit <= 0) continue;

      // Update purchase tracking (profit was already credited via Investment records)
      await db.purchase.update({
        where: { id: purchase.id },
        data: {
          profitEarned: { increment: dailyProfit },
          dailyProfit: dailyProfit,
          lastProfitDate: new Date(),
        },
      });
    } catch (error: any) {
      console.error(`[Profit Cron] ❌ Purchase ${purchase.id} update: ${error.message}`);
    }
  }

  console.log(`[Profit Cron] Done. Processed: ${result.processed}, Total Profit: ${formatRupiahSimple(result.totalProfit)}, Total Matching: ${formatRupiahSimple(result.totalMatching)}, Errors: ${result.errors}`);
  return result;
}

// ──────────── Cron Scheduler ────────────

let lastSalaryRunDate = '';
let lastProfitRunDate = '';

function checkAndRunCrons() {
  const wibNow = getWibNow();
  const dayOfWeek = wibNow.getDay(); // 0=Sun, 1=Mon
  const hour = wibNow.getHours();
  const minute = wibNow.getMinutes();
  const dateStr = `${wibNow.getFullYear()}-${wibNow.getMonth()}-${wibNow.getDate()}`;

  // Daily profit + matching bonus: Every day at 00:00 WIB (check minute 0 with 2-min window)
  if (hour === 0 && minute <= 2 && lastProfitRunDate !== dateStr) {
    lastProfitRunDate = dateStr;
    console.log(`\n[CRON] 🌅 Running daily investment profit + matching bonus distribution at ${wibNow.toISOString()}...`);
    processDailyInvestmentProfits().then((result) => {
      console.log(`[CRON] 🌅 Profit done: ${result.processed} investments, ${formatRupiahSimple(result.totalProfit)} profit, ${formatRupiahSimple(result.totalMatching)} matching, ${result.errors} errors`);
    }).catch(console.error);
  }

  // Weekly salary: Every Monday at 00:00 WIB (check minute 0 with 2-min window)
  if (dayOfWeek === 1 && hour === 0 && minute <= 2 && lastSalaryRunDate !== dateStr) {
    lastSalaryRunDate = dateStr;
    console.log(`\n[CRON] 💰 Running weekly salary bonus distribution at ${wibNow.toISOString()}...`);
    processAllSalaryBonuses().then((result) => {
      console.log(`[CRON] 💰 Salary done: ${result.eligible} eligible, ${formatRupiahSimple(result.totalAmount)} total, ${result.skipped} skipped, ${result.errors} errors`);
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
        matchingMode: 'event-driven (credited with daily profit)',
        referralMode: 'per-investment (credited when downline invests)',
      }, { headers: corsHeaders });
    }

    // Manual trigger: Salary bonus
    if (url.pathname === '/api/trigger/salary' && req.method === 'POST') {
      console.log('\n[CRON] 📌 Manual trigger: Salary bonus');
      const result = await processAllSalaryBonuses();
      return Response.json({ success: true, data: result }, { headers: corsHeaders });
    }

    // Manual trigger: Daily profit + matching (⚠️ Only use for testing — profit should ONLY enter at 00:00 WIB)
    if (url.pathname === '/api/trigger/profit' && req.method === 'POST') {
      const wibHour = getWibNow().getHours();
      if (wibHour !== 0) {
        console.log(`\n[CRON] ⚠️ Manual profit trigger called at ${getWibNow().toISOString()} — NOT 00:00 WIB! Proceeding anyway...`);
      }
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

    // Status endpoint
    if (url.pathname === '/api/status') {
      return Response.json({
        wibTime: getWibNow().toISOString(),
        dayOfWeek: getWibNow().getDay(),
        lastSalaryRun: lastSalaryRunDate || 'never',
        lastProfitRun: lastProfitRunDate || 'never',
        matchingMode: 'event-driven',
        referralMode: 'per-investment (credited when downline invests)',
      }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  },
});

// ──────────── Start ────────────

console.log(`[Cron Service] 🚀 Running on port ${PORT}`);
console.log(`[Cron Service] WIB Time: ${getWibNow().toISOString()}`);
console.log(`[Cron Service] Schedules:`);
console.log(`  - Daily Profit + Matching: 00:00 WIB every day`);
console.log(`  - Weekly Salary: 00:00 WIB every Monday`);
console.log(`  - Matching: Event-driven (credited with daily profit, based on PROFIT amount)`);
console.log(`  - Referral: Per-investment (credited when downline invests)`);
console.log(`  - Level 6+ matching: AUTO DISCONNECT (no bonus)`);

// Check every 10 seconds for precise 00:00 WIB triggers
setInterval(checkAndRunCrons, 10000);
checkAndRunCrons(); // Initial check
