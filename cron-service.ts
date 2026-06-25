/**
 * NEXVO Cron Service v2.0
 *
 * Runs scheduled tasks automatically:
 * - Daily Investment Profit: Every day at 00:00 WIB
 * - Weekly Salary Bonus: Every Monday at 00:00 WIB
 * - Quota Simulation: Every 1-3 hours - incremental quota fills (nav.live style)
 * - Live Activity Generation: Every 15-30 minutes - fake activity for live feed
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
const MAX_MATCHING_LEVEL = 5;
const HARD_MIN_DIRECT_REFS = 10;

// ──────────── Quota Simulation Constants (nav.live) ────────────

const FAKE_NAMES = [
  'Ahmad R.', 'Siti N.', 'Budi S.', 'Dewi L.', 'Fajar P.',
  'Rina W.', 'Hendra K.', 'Maya T.', 'Andi M.', 'Putri D.',
  'Rudi H.', 'Lina S.', 'Doni A.', 'Yuli B.', 'Wawan G.',
  'Nita J.', 'Eko F.', 'Sari V.', 'Agus Z.', 'Wati C.',
  'Bambang Q.', 'Indah E.', 'Joko U.', 'Amel X.', 'Tono Y.',
  'Ratna I.', 'Dimas O.', 'Citra P.', 'Galang R.', 'Fitriani L.',
  'Bayu N.', 'Kartika M.', 'Surya D.', 'Nurul H.', 'Rizky A.',
  'Dian S.', 'Prasetyo B.', 'Lestari K.', 'Santoso G.', 'Hartono F.',
  'Suryani T.', 'Purnomo W.', 'Wulandari J.', 'Setiawan V.', 'Rahayu Z.',
  'Supriadi X.', 'Handayani C.', 'Wibowo Q.', 'Maharani E.', 'Saputra U.',
  'Yusuf M.', 'Aisyah K.', 'Ilham R.', 'Nadia F.', 'Teguh B.',
  'Lestari H.', 'Wijaya D.', 'Permata S.', 'Hakim A.', 'Safitri N.',
  'Kurniawan J.', 'Utami P.', 'Pratama G.', 'Anggraini T.', 'Wicaksono F.',
  'Harahap L.', 'Nasution R.', 'Siregar B.', 'Panggabean V.', 'Simanjuntak C.',
  'Manurung E.', 'Hutapea Q.', 'Tampubolon X.', 'Simatupang U.', 'Lubis I.',
  'Pardede O.', 'Sihombing Y.', 'Ginting W.', 'Tarigan Z.', 'Karo H.',
  'Sinaga N.', 'Rajagukguk M.', 'Simbolon R.', 'Panjaitan D.', 'Siahaan G.',
  'Muhammad A.', 'Fatimah Z.', 'Abdullah R.', 'Khadijah S.', 'Umar H.',
  'Aisyah B.', 'Ibrahim K.', 'Zainab L.', 'Bilal F.', 'Sumayyah P.',
  'Susanto P.', 'Wibisono E.', 'Harjono K.', 'Mulyono G.', 'Sutanto L.',
  'Gunawan S.', 'Santika R.', 'Rahardjo T.', 'Suharto B.', 'Prabowo I.',
  'Suryadi O.', 'Moertini Z.', 'Kusumo F.', 'Respati D.', 'Wignyo R.',
  'Triyono V.', 'Suryo N.', 'Yudistira C.', 'Arjuna M.', 'Bima U.',
  'Haryanto J.', 'Sulistiowati E.', 'Purnama A.', 'Setiabudi W.', 'Hidayat N.',
  'Mulyadi H.', 'Wahyuni S.', 'Kurniawan T.', 'Astuti D.', 'Budiman G.',
  'Hartono L.', 'Supriyanto F.', 'Suryawati R.', 'Widodo P.', 'Rahmawati K.',
  'Zulfikar A.', 'Nurlaela S.', 'Rachmat H.', 'Widyawati B.', 'Pranoto D.',
  'Suryanto G.', 'Kusumawati E.', 'Sulaiman R.', 'Haryanti N.', 'Wijayanto F.',
  'Purwanto L.', 'Suryaningsih T.', 'Hartawan K.', 'Puspitasari M.', 'Budiono V.',
  'Yulianti C.', 'Sudrajat U.', 'Prihatini J.', 'Sutrisno I.', 'Mardiani O.',
];

const DEPOSIT_AMOUNTS = [
  100000, 200000, 500000, 1000000, 1000000, 2500000, 2500000, 5000000,
  5000000, 10000000, 10000000, 15000000, 20000000, 25000000, 50000000,
];

const WITHDRAW_AMOUNTS = [
  50000, 100000, 200000, 300000, 500000, 750000, 1000000,
  1500000, 2000000, 3000000, 5000000, 10000000,
];

// Per-product daily quota increment ranges (min, max) based on product price
// Lower-priced products sell more frequently
const QUOTA_DAILY_RANGE: Record<string, [number, number]> = {
  '100000':  [25, 70],    // vip 1: Rp100K - many buyers
  '500000':  [12, 35],    // vip 2: Rp500K
  '1000000': [6, 20],     // vip 3: Rp1M
  '2500000': [4, 12],     // vip 4: Rp2.5M
  '5000000': [2, 8],      // vip 5: Rp5M
  '10000000':[1, 4],      // vip 6: Rp10M - fewer buyers
};

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

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

function getWibDateString(date: Date): string {
  const wibDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000 + WIB_OFFSET * 3600000);
  return `${wibDate.getFullYear()}-${String(wibDate.getMonth() + 1).padStart(2, '0')}-${String(wibDate.getDate()).padStart(2, '0')}`;
}

function getTodayWibDateString(): string {
  return getWibDateString(new Date());
}

/**
 * Get day of week (0=Sunday, 6=Saturday) for a given Date in WIB timezone.
 * Uses getWibDateString to avoid local timezone interpretation issues.
 */
function getWibDayOfWeekFromDate(date: Date): number {
  const wibStr = getWibDateString(date); // "YYYY-MM-DD" in WIB
  const [y, m, d] = wibStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Count weekdays (Mon-Fri) MISSED between lastCreditDateStr+1 and todayStr (exclusive today).
 * Used for backfill: e.g., if last credit was Thursday and today is Monday,
 * missed days = Friday (1 day, since Sat/Sun are skipped).
 *
 * @param lastCreditDateStr  WIB date string "YYYY-MM-DD" of last successful credit
 * @param todayStr           WIB date string "YYYY-MM-DD" of today
 * @returns number of weekdays missed (0 if none or if lastCredit >= today-1)
 */
function countWeekdaysMissed(lastCreditDateStr: string, todayStr: string): number {
  const [ly, lm, ld] = lastCreditDateStr.split('-').map(Number);
  const [ty, tm, td] = todayStr.split('-').map(Number);
  // Start from day AFTER last credit (the first potentially-missed day)
  const start = new Date(Date.UTC(ly, lm - 1, ld + 1));
  // End at today (exclusive — today is handled separately by the normal cron logic)
  const end = new Date(Date.UTC(ty, tm - 1, td));

  let count = 0;
  const cursor = new Date(start);
  // Safety cap: never count more than 60 missed days (prevents runaway loop on bad data)
  let safety = 60;
  while (cursor < end && safety-- > 0) {
    const dow = cursor.getUTCDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
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
      const minRequired = Math.max(config.minDirectRefs, HARD_MIN_DIRECT_REFS);
      const refCount = await getDirectRefCount(user.id);
      if (refCount < minRequired) {
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

      if (effectiveRefs < minRequired) {
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
  backfilledDays: number;
  backfilledInvestments: number;
}> {
  const emptyResult = { processed: 0, totalProfit: 0, totalMatching: 0, errors: 0, backfilledDays: 0, backfilledInvestments: 0 };

  // ─── WEEKEND LIBUR: No profit distribution on Saturday & Sunday ───
  const wibNowCheck = getWibNow();
  const dayOfWeekCheck = wibNowCheck.getDay(); // 0=Sunday, 6=Saturday
  if (dayOfWeekCheck === 0 || dayOfWeekCheck === 6) {
    const dayName = dayOfWeekCheck === 0 ? 'Minggu' : 'Sabtu';
    console.log(`[Profit Cron] ⏸️ SKIPPED — today is ${dayName} (weekend libur, semua aktivitas mati).`);
    return emptyResult;
  }

  return processDailyInvestmentProfitsCore();
}

/**
 * Force version — bypasses weekend guard. Used by manual trigger with ?force=true
 * (admin catch-up). The per-investment lastProfitDate check still prevents double-credit.
 * Even on weekend, this will credit missed weekdays (but not the weekend itself).
 */
async function processDailyInvestmentProfitsForce(): Promise<{
  processed: number;
  totalProfit: number;
  totalMatching: number;
  errors: number;
  backfilledDays: number;
  backfilledInvestments: number;
}> {
  console.log('[Profit Cron] ⚠️ FORCE MODE — bypassing weekend guard (manual trigger). Backfill will credit missed weekdays only.');
  return processDailyInvestmentProfitsCore();
}

async function processDailyInvestmentProfitsCore(): Promise<{
  processed: number;
  totalProfit: number;
  totalMatching: number;
  errors: number;
  backfilledDays: number;
  backfilledInvestments: number;
}> {
  const result = { processed: 0, totalProfit: 0, totalMatching: 0, errors: 0, backfilledDays: 0, backfilledInvestments: 0 };

  const todayWIB = getTodayWibDateString();
  const wibNow = getWibNow();
  // FIX: wibNow is ALREADY WIB-shifted, so .getDay() returns the correct WIB day-of-week.
  // Do NOT pass wibNow into getWibDayOfWeekFromDate() — that double-shifts (+7h again)
  // and on UTC servers causes Friday 17:00-23:59 WIB to be misread as Saturday (weekend).
  const todayDow = wibNow.getDay(); // 0=Sun, 6=Sat
  const isTodayWeekday = todayDow !== 0 && todayDow !== 6;

  const investments = await db.investment.findMany({
    where: { status: 'active' },
    include: { package: true },
  });

  console.log(`[Profit Cron] Processing ${investments.length} active investments (today=${todayWIB}, dow=${todayDow}, weekday=${isTodayWeekday})...`);

  for (const inv of investments) {
    try {
      // ─── Skip if already credited today ───
      if (inv.lastProfitDate) {
        const lastProfitWIB = getWibDateString(new Date(inv.lastProfitDate));
        if (lastProfitWIB === todayWIB) {
          continue;
        }
      }

      // ─── Skip if bought today (profit starts tomorrow) ───
      const createdDate = inv.startDate ? new Date(inv.startDate) : new Date(inv.createdAt);
      const createdWIB = getWibDateString(createdDate);
      if (createdWIB === todayWIB) {
        continue;
      }

      // ─── Skip if contract ended ───
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

      // ★ BUG FIX: Use stored inv.dailyProfit — do NOT recompute from inv.package.profitRate.
      //   For Product (VIP) purchases, packageId is linked to `_internal_default` (profitRate=0)
      //   which made dailyProfit=0 → profit never credited.
      //   The stored `inv.dailyProfit` is the TRUE daily profit (set at purchase time).
      const dailyProfit = inv.dailyProfit && inv.dailyProfit > 0
        ? inv.dailyProfit
        : Math.floor(inv.amount * ((inv.package?.profitRate || 0) / 100));
      if (dailyProfit <= 0) {
        console.log(`[Profit Cron] ⚠️ Investment ${inv.id} has dailyProfit=0 — skipping`);
        continue;
      }

      // ─── BACKFILL LOGIC: Calculate missed weekdays ───
      // lastCreditDate = lastProfitDate (WIB) or startDate (WIB) if null
      let lastCreditDateStr: string;
      if (inv.lastProfitDate) {
        lastCreditDateStr = getWibDateString(new Date(inv.lastProfitDate));
      } else {
        lastCreditDateStr = createdWIB; // first profit cycle starts day after purchase
      }

      const missedDays = countWeekdaysMissed(lastCreditDateStr, todayWIB);
      // Total days to credit = missed weekdays + today (if today is weekday)
      // Cap at 30 days total for safety (prevents runaway credit on bad data)
      const totalDays = Math.min(missedDays + (isTodayWeekday ? 1 : 0), 30);

      if (totalDays <= 0) {
        // Weekend with no missed days — nothing to credit
        continue;
      }

      const totalCredit = dailyProfit * totalDays;
      const isBackfill = missedDays > 0;

      await db.$transaction(async (tx) => {
        // Re-check inside transaction to prevent race condition
        const currentInv = await tx.investment.findUnique({ where: { id: inv.id } });
        if (currentInv?.lastProfitDate) {
          const lastProfitWIB = getWibDateString(new Date(currentInv.lastProfitDate));
          if (lastProfitWIB === todayWIB) {
            return; // already credited by another process
          }
        }

        await tx.user.update({
          where: { id: inv.userId },
          data: {
            mainBalance: { increment: totalCredit },
            totalProfit: { increment: totalCredit },
          },
        });

        await tx.investment.update({
          where: { id: inv.id },
          data: {
            totalProfitEarned: { increment: totalCredit },
            dailyProfit: dailyProfit,
            lastProfitDate: new Date(),
          },
        });

        const pkgName = inv.package?.name || 'Investment';
        const pkgRate = inv.package?.profitRate || (inv.amount > 0 ? (dailyProfit / inv.amount) * 100 : 0);
        const desc = totalDays === 1
          ? `Profit harian ${pkgName} — ${formatRupiahSimple(inv.amount)} x ${pkgRate.toFixed(2)}% = ${formatRupiahSimple(dailyProfit)}`
          : `Profit ${totalDays} hari (${isBackfill ? `${missedDays} tertinggal + ${isTodayWeekday ? 'hari ini' : '0'}` : 'semua hari ini'}) — ${pkgName}: ${formatRupiahSimple(dailyProfit)} x ${totalDays} = ${formatRupiahSimple(totalCredit)}`;

        await tx.bonusLog.create({
          data: {
            userId: inv.userId,
            fromUserId: inv.userId,
            type: 'profit',
            level: 0,
            amount: totalCredit,
            description: desc,
          },
        });

        const matchResult = await creditMatchingOnProfit(tx, inv.userId, totalCredit);
        if (matchResult.totalMatchCredited > 0) {
          result.totalMatching += matchResult.totalMatchCredited;
        }
      });

      result.processed++;
      result.totalProfit += totalCredit;
      if (isBackfill) {
        result.backfilledInvestments++;
        result.backfilledDays += missedDays;
        console.log(`[Profit Cron] 📦 BACKFILL: Investment ${inv.id} (user ${inv.userId}) — ${missedDays} missed weekday(s) + ${isTodayWeekday ? 'today' : 'weekend(no today)'} = ${totalDays} days × ${formatRupiahSimple(dailyProfit)} = ${formatRupiahSimple(totalCredit)}`);
      }
    } catch (error: any) {
      result.errors++;
      console.error(`[Profit Cron] ❌ Investment ${inv.id}: ${error.message}`);
    }
  }

  // ─── Purchase tracking (product purchases, no balance change — just stats) ───

  // Purchase tracking
  const purchases = await db.purchase.findMany({
    where: { status: 'active' },
    include: { product: true },
  });

  console.log(`[Profit Cron] Updating ${purchases.length} active product purchases...`);

  for (const purchase of purchases) {
    try {
      if (purchase.lastProfitDate) {
        const lastProfitWIB = getWibDateString(new Date(purchase.lastProfitDate));
        if (lastProfitWIB === todayWIB) {
          continue;
        }
      }

      const purchaseCreatedDate = purchase.createdAt ? new Date(purchase.createdAt) : null;
      if (purchaseCreatedDate) {
        const createdWIB = getWibDateString(purchaseCreatedDate);
        if (createdWIB === todayWIB) {
          continue;
        }
      }

      const productProfitRate = purchase.product?.profitRate || 0;
      const dailyProfit = Math.floor(purchase.totalPrice * (productProfitRate / 100));

      if (dailyProfit <= 0) continue;

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

  console.log(`[Profit Cron] Done. Processed: ${result.processed}, Total Profit: ${formatRupiahSimple(result.totalProfit)}, Backfill: ${result.backfilledInvestments} inv / ${result.backfilledDays} days, Total Matching: ${formatRupiahSimple(result.totalMatching)}, Errors: ${result.errors}`);
  return result;
}

// ═══════════════════════════════════════════════════════════
//  QUOTA SIMULATION (nav.live style)
//  - Runs periodically throughout the day
//  - Incrementally increases quotaUsed for each product
//  - Creates fake LiveActivity entries
//  - When quota is nearly full (≥95%), resets with new batch
// ═══════════════════════════════════════════════════════════

let lastQuotaSimDate = '';
let lastQuotaSimHour = -1;

async function simulateQuotaAndActivity(): Promise<{
  productsUpdated: number;
  activitiesCreated: number;
  quotaResets: number;
}> {
  const result = { productsUpdated: 0, activitiesCreated: 0, quotaResets: 0 };

  try {
    const wibNow = getWibNow();
    const currentHour = wibNow.getHours();

    // Get time-of-day multiplier for realistic activity patterns
    // Peak hours: 09:00-12:00, 14:00-17:00 WIB
    // Low hours: 00:00-06:00 WIB
    let timeMultiplier = 1.0;
    if (currentHour >= 9 && currentHour <= 12) timeMultiplier = 1.5;      // Morning peak
    else if (currentHour >= 14 && currentHour <= 17) timeMultiplier = 1.3; // Afternoon peak
    else if (currentHour >= 19 && currentHour <= 22) timeMultiplier = 1.1; // Evening
    else if (currentHour >= 0 && currentHour <= 6) timeMultiplier = 0.3;   // Night - very low
    else timeMultiplier = 0.8;                                              // Other hours

    // Weekend slightly less active
    const dayOfWeek = wibNow.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) timeMultiplier *= 0.7;

    const products = await db.product.findMany({
      where: { isActive: true, isStopped: false },
      orderBy: { price: 'asc' },
    });

    const activitiesToCreate: Array<{
      type: string;
      userName: string;
      amount: number;
      productName: string | null;
      isFake: boolean;
    }> = [];

    for (const product of products) {
      // Check if quota needs reset (≥95% filled)
      if (product.quotaUsed >= Math.floor(product.quota * 0.95)) {
        // Reset to a new batch with some initial activity (3-10% already filled)
        const minUsed = Math.floor(product.quota * 0.03);
        const maxUsed = Math.floor(product.quota * 0.10);
        const newQuotaUsed = randomBetween(minUsed, maxUsed);

        await db.product.update({
          where: { id: product.id },
          data: { quotaUsed: newQuotaUsed },
        });

        // Create "new batch" activity
        activitiesToCreate.push({
          type: 'purchase',
          userName: '🎉 Batch Baru',
          amount: product.price,
          productName: product.name,
          isFake: true,
        });

        result.quotaResets++;
        console.log(`[Quota Sim] 🔄 ${product.name} quota reset: ${product.quotaUsed}/${product.quota} → ${newQuotaUsed}/${product.quota}`);
        continue;
      }

      // Calculate how much quota to add this cycle
      const priceKey = String(Math.floor(product.price));
      const dailyRange = QUOTA_DAILY_RANGE[priceKey] || [1, 5];
      
      // Each cycle adds a fraction of the daily range (we run ~4-6 cycles per day)
      const cycleMin = Math.max(1, Math.floor(dailyRange[0] * timeMultiplier / 4));
      const cycleMax = Math.max(cycleMin + 1, Math.ceil(dailyRange[1] * timeMultiplier / 4));
      const increment = randomBetween(cycleMin, cycleMax);

      // Don't exceed quota
      const maxIncrement = product.quota - product.quotaUsed;
      const actualIncrement = Math.min(increment, maxIncrement);

      if (actualIncrement <= 0) continue;

      await db.product.update({
        where: { id: product.id },
        data: { quotaUsed: { increment: actualIncrement } },
      });

      result.productsUpdated++;

      // Create LiveActivity entries for each "purchase"
      for (let i = 0; i < actualIncrement; i++) {
        const rand = Math.random();
        let type: string;
        let amount: number;
        let productName: string | null = null;

        // 60% purchase for this product, 25% deposit, 10% withdraw, 5% register
        if (rand < 0.60) {
          type = 'purchase';
          amount = product.price;
          productName = product.name;
        } else if (rand < 0.85) {
          type = 'deposit';
          amount = randomItem(DEPOSIT_AMOUNTS);
        } else if (rand < 0.95) {
          type = 'withdraw';
          amount = randomItem(WITHDRAW_AMOUNTS);
        } else {
          type = 'register';
          amount = 0;
        }

        activitiesToCreate.push({
          type,
          userName: randomItem(FAKE_NAMES),
          amount,
          productName,
          isFake: true,
        });
      }

      console.log(`[Quota Sim] 📈 ${product.name}: +${actualIncrement} quota (total: ${product.quotaUsed + actualIncrement}/${product.quota}, ${(Math.round((product.quotaUsed + actualIncrement) / product.quota * 100))}%)`);
    }

    // Batch create LiveActivity entries (max 200 per cycle to keep DB clean)
    if (activitiesToCreate.length > 0) {
      const toInsert = activitiesToCreate.slice(0, 200);
      
      for (const activity of toInsert) {
        await db.liveActivity.create({
          data: {
            type: activity.type,
            userName: activity.userName,
            amount: activity.amount,
            productName: activity.productName,
            isFake: activity.isFake,
          },
        });
      }

      result.activitiesCreated = toInsert.length;
    }

    // Clean up old fake activities (keep only last 500)
    const fakeCount = await db.liveActivity.count({ where: { isFake: true } });
    if (fakeCount > 500) {
      const oldFakes = await db.liveActivity.findMany({
        where: { isFake: true },
        orderBy: { createdAt: 'asc' },
        take: fakeCount - 500,
        select: { id: true },
      });
      if (oldFakes.length > 0) {
        await db.liveActivity.deleteMany({
          where: { id: { in: oldFakes.map(f => f.id) } },
        });
        console.log(`[Quota Sim] 🗑️ Cleaned ${oldFakes.length} old fake activities`);
      }
    }

  } catch (error: any) {
    console.error(`[Quota Sim] ❌ Error: ${error.message}`);
  }

  return result;
}

// ──────────── Cron Scheduler ────────────

let lastSalaryRunDate = '';
let lastProfitRunDate = '';
let startupCatchupDone = false;

/**
 * Check if today's profit has already been credited by querying the DB.
 * Returns true if ANY active investment already has lastProfitDate = today (WIB).
 * This is the source of truth — the in-memory `lastProfitRunDate` flag can reset on PM2 restart.
 */
async function hasProfitBeenCreditedToday(): Promise<{ credited: boolean; sampleCount: number }> {
  const todayWIB = getTodayWibDateString();
  const startOfDayWIB = new Date(todayWIB + 'T00:00:00+07:00');
  const activeCount = await db.investment.count({ where: { status: 'active' } });
  if (activeCount === 0) return { credited: false, sampleCount: 0 };
  const creditedToday = await db.investment.count({
    where: {
      status: 'active',
      lastProfitDate: { gte: startOfDayWIB },
    },
  });
  return { credited: creditedToday > 0, sampleCount: creditedToday };
}

async function runProfitCronIfDue(reason: string): Promise<void> {
  const wibNow = getWibNow();
  const dayOfWeek = wibNow.getDay();
  const dateStr = `${wibNow.getFullYear()}-${wibNow.getMonth()}-${wibNow.getDate()}`;

  // Already ran this date (in-memory guard)
  if (lastProfitRunDate === dateStr) return;

  // Weekend libur — no profit on Sat (6) & Sun (0)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    const dayName = dayOfWeek === 0 ? 'Minggu' : 'Sabtu';
    lastProfitRunDate = dateStr; // mark so we don't keep logging this every 10s
    console.log(`\n[CRON] ⏸️ Profit cron SKIPPED (${reason}) — today is ${dayName} (weekend libur, semua aktivitas mati).`);
    return;
  }

  // DB-based dedup: if profit already credited today, skip
  const { credited, sampleCount } = await hasProfitBeenCreditedToday();
  if (credited) {
    lastProfitRunDate = dateStr;
    console.log(`\n[CRON] ✅ Profit already credited today (${sampleCount} investments have lastProfitDate >= today 00:00 WIB). Skipping (${reason}).`);
    return;
  }

  lastProfitRunDate = dateStr;
  console.log(`\n[CRON] 🌅 Running daily investment profit + matching bonus (${reason}) at ${wibNow.toISOString()} (WIB: ${wibNow.toLocaleString('id-ID', { timeZone: 'UTC' })})...`);
  try {
    const result = await processDailyInvestmentProfits();
    console.log(`[CRON] 🌅 Profit done: ${result.processed} investments, ${formatRupiahSimple(result.totalProfit)} profit, Backfill: ${result.backfilledInvestments} inv/${result.backfilledDays} days, ${formatRupiahSimple(result.totalMatching)} matching, ${result.errors} errors`);
  } catch (err) {
    console.error(`[CRON] 🌅 Profit cron ERROR:`, err);
    // Reset flag so it retries on next tick
    lastProfitRunDate = '';
  }
}

function checkAndRunCrons() {
  const wibNow = getWibNow();
  const dayOfWeek = wibNow.getDay();
  const hour = wibNow.getHours();
  const minute = wibNow.getMinutes();
  const dateStr = `${wibNow.getFullYear()}-${wibNow.getMonth()}-${wibNow.getDate()}`;

  // ★ STARTUP CATCH-UP: On first run, if it's past 00:05 WIB and profit hasn't run today, run it now.
  //    This handles the case where PM2 restarted after midnight and the 00:00 window was missed.
  if (!startupCatchupDone) {
    startupCatchupDone = true;
    if (hour >= 0 && (hour > 0 || minute >= 5) && lastProfitRunDate !== dateStr) {
      console.log(`\n[CRON] 🔔 Startup catch-up check: WIB=${wibNow.toISOString()}, checking if today's profit needs to run...`);
      runProfitCronIfDue('startup-catchup').catch(console.error);
    }
  }

  // Daily profit + matching bonus: trigger window is the FULL HOUR 00:00-00:59 WIB
  // (widened from 00:00-00:02 to survive PM2 restarts/delays; DB dedup prevents double-credit)
  // ★ WEEKEND LIBUR: No profit distribution on Saturday (6) & Sunday (0) ★
  if (hour === 0 && lastProfitRunDate !== dateStr) {
    runProfitCronIfDue('midnight-schedule').catch(console.error);
  }

  // Weekly salary: Every Monday at 00:00 WIB (trigger window: full hour)
  if (dayOfWeek === 1 && hour === 0 && lastSalaryRunDate !== dateStr) {
    lastSalaryRunDate = dateStr;
    console.log(`\n[CRON] 💰 Running weekly salary bonus distribution at ${wibNow.toISOString()}...`);
    processAllSalaryBonuses().then((result) => {
      console.log(`[CRON] 💰 Salary done: ${result.eligible} eligible, ${formatRupiahSimple(result.totalAmount)} total, ${result.skipped} skipped, ${result.errors} errors`);
    }).catch(console.error);
  }

  // Quota simulation: Run every 2 hours (at :30 minutes)
  // 00:30, 02:30, 04:30, 06:30, 08:30, 10:30, 12:30, 14:30, 16:30, 18:30, 20:30, 22:30
  if (minute >= 28 && minute <= 32 && hour !== lastQuotaSimHour) {
    lastQuotaSimHour = hour;
    console.log(`\n[CRON] 📊 Running quota simulation (nav.live) at ${wibNow.toISOString()}...`);
    simulateQuotaAndActivity().then((result) => {
      console.log(`[CRON] 📊 Quota sim done: ${result.productsUpdated} products updated, ${result.activitiesCreated} activities created, ${result.quotaResets} resets`);
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

    if (url.pathname === '/') {
      return Response.json({
        service: 'NEXVO Cron Service v2.0',
        status: 'running',
        wibTime: getWibNow().toISOString(),
        lastSalaryRun: lastSalaryRunDate || 'never',
        lastProfitRun: lastProfitRunDate || 'never',
        lastQuotaSimHour: lastQuotaSimHour >= 0 ? `hour ${lastQuotaSimHour}` : 'never',
        matchingMode: 'event-driven (credited with daily profit)',
        referralMode: 'per-investment (credited when downline invests)',
      }, { headers: corsHeaders });
    }

    if (url.pathname === '/api/trigger/salary' && req.method === 'POST') {
      console.log('\n[CRON] 📌 Manual trigger: Salary bonus');
      const result = await processAllSalaryBonuses();
      return Response.json({ success: true, data: result }, { headers: corsHeaders });
    }

    if (url.pathname === '/api/trigger/profit' && req.method === 'POST') {
      const force = url.searchParams.get('force') === 'true';
      console.log(`\n[CRON] 📌 Manual trigger: Daily profit + matching (force=${force})`);
      if (force) {
        // Bypass weekend guard — admin/manual catch-up
        const result = await processDailyInvestmentProfitsForce();
        return Response.json({ success: true, data: result, force: true }, { headers: corsHeaders });
      }
      const result = await processDailyInvestmentProfits();
      return Response.json({ success: true, data: result }, { headers: corsHeaders });
    }

    if (url.pathname === '/api/trigger/matching' && req.method === 'POST') {
      console.log('\n[CRON] 📌 Manual trigger: Matching bonus');
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

    // Manual trigger: Quota simulation
    if (url.pathname === '/api/trigger/quota-sim' && req.method === 'POST') {
      console.log('\n[CRON] 📌 Manual trigger: Quota simulation (nav.live)');
      const result = await simulateQuotaAndActivity();
      return Response.json({ success: true, data: result }, { headers: corsHeaders });
    }

    if (url.pathname === '/api/status') {
      const { credited, sampleCount } = await hasProfitBeenCreditedToday();
      const wibNow = getWibNow();
      const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      return Response.json({
        wibTime: wibNow.toISOString(),
        wibWallTime: `${wibNow.getFullYear()}-${String(wibNow.getMonth()+1).padStart(2,'0')}-${String(wibNow.getDate()).padStart(2,'0')} ${String(wibNow.getHours()).padStart(2,'0')}:${String(wibNow.getMinutes()).padStart(2,'0')}:${String(wibNow.getSeconds()).padStart(2,'0')}`,
        dayOfWeek: wibNow.getDay(),
        dayName: dayNames[wibNow.getDay()],
        isWeekend: wibNow.getDay() === 0 || wibNow.getDay() === 6,
        profitCreditedToday: credited,
        profitCreditedCount: sampleCount,
        lastSalaryRun: lastSalaryRunDate || 'never',
        lastProfitRun: lastProfitRunDate || 'never',
        lastQuotaSimHour: lastQuotaSimHour >= 0 ? `hour ${lastQuotaSimHour}` : 'never',
        matchingMode: 'event-driven',
        referralMode: 'per-investment (credited when downline invests)',
      }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });
  },
});

// ──────────── Start ────────────

console.log(`[Cron Service v2.0] 🚀 Running on port ${PORT}`);
console.log(`[Cron Service] WIB Time: ${getWibNow().toISOString()}`);
console.log(`[Cron Service] Schedules:`);
console.log(`  - Daily Profit + Matching: 00:00 WIB every weekday (window: full hour 00:00-00:59)`);
console.log(`  - Weekend Libur: Sabtu & Minggu (no profit distribution)`);
console.log(`  - Startup Catch-up: If past 00:05 WIB and profit not credited, run immediately`);
console.log(`  - AUTO BACKFILL: Missed weekdays auto-credited (skip Sat/Sun, cap 30 days)`);
console.log(`  - Weekly Salary: 00:00 WIB every Monday`);
console.log(`  - Quota Simulation: Every 2 hours at :30 (nav.live style)`);
console.log(`  - Matching: Event-driven (credited with daily profit, based on PROFIT amount)`);
console.log(`  - Referral: Per-investment (credited when downline invests)`);
console.log(`  - Level 6+ matching: AUTO DISCONNECT (no bonus)`);

// Initial quota simulation on startup
simulateQuotaAndActivity().then((result) => {
  console.log(`[Cron Service] 📊 Initial quota sim: ${result.productsUpdated} products, ${result.activitiesCreated} activities, ${result.quotaResets} resets`);
}).catch(console.error);

// Check every 10 seconds for precise triggers
setInterval(checkAndRunCrons, 10000);
checkAndRunCrons();
