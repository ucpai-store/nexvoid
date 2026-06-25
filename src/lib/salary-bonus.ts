import { db } from '@/lib/db';

/**
 * NEXVO Bonus Salary System
 *
 * Rules:
 * - User MUST have an active deposit (investment) themselves
 * - ALL Level 1/direct referrals MUST have active deposits
 * - At least 10 direct referrals required (minDirectRefs)
 * - Salary = 1% of group omzet (own + all downline active investments)
 * - maxWeeks = 0 means PERMANENT (selamanya, tanpa batas)
 * - Auto-credited at 00:00 WIB every Monday via cron service
 */

/**
 * ★ SELF-HEAL: Force-correct SalaryConfig on every read.
 * If any config row has salaryRate !== 1 OR maxWeeks !== 0, delete ALL rows
 * and create ONE clean config (1% / maxWeeks=0 / min 10 refs).
 *
 * This guarantees the UI NEVER shows stale "2.5%" or "12 minggu" values,
 * even if the seed didn't run or an admin accidentally set wrong values.
 * Called lazily from getUserSalaryEligibility and checkAndCreditSalaryBonus.
 */
let _selfHealChecked = false; // per-process cache: only run once per server restart
async function selfHealSalaryConfig(): Promise<void> {
  if (_selfHealChecked) return;
  _selfHealChecked = true;
  try {
    const all = await db.salaryConfig.findMany();
    const hasStale = all.some(c => c.salaryRate !== 1 || c.maxWeeks !== 0);
    if (hasStale || all.length === 0) {
      if (all.length > 0) {
        await db.salaryConfig.deleteMany({});
      }
      await db.salaryConfig.create({
        data: {
          minDirectRefs: 10,
          salaryRate: 1,
          maxWeeks: 0,
          requireActiveDeposit: true,
          fixedSalaryAmount: 25000,
          isActive: true,
        },
      });
      console.log('[salary] Self-heal: reset SalaryConfig to 1% / maxWeeks=0 (killed stale rows)');
    }
  } catch (e) {
    // Non-fatal — don't break the API if self-heal fails (e.g. table not migrated yet)
    console.error('[salary] Self-heal skipped:', (e as Error).message);
  }
}

/**
 * Get the current ISO week number and year using WIB (UTC+7) timezone
 * This must match the cron route's WIB time calculation
 */
function getCurrentWeekInfo(): { weekNumber: number; year: number } {
  // Convert to WIB (UTC+7) for consistent week calculation
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const wibNow = new Date(utcMs + 7 * 3600000);

  const startOfYear = new Date(wibNow.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((wibNow.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const weekNumber = Math.ceil(dayOfYear / 7);
  return { weekNumber, year: wibNow.getFullYear() };
}

/**
 * Get direct referrals count for a user (level 1 only)
 */
async function getDirectRefCount(internalId: string): Promise<number> {
  const count = await db.referral.count({
    where: { referrerId: internalId, level: 1 },
  });
  return count;
}

/**
 * Check if a user has at least one active investment (deposit)
 */
async function userHasActiveDeposit(internalId: string): Promise<boolean> {
  const count = await db.investment.count({
    where: { userId: internalId, status: 'active' },
  });
  return count > 0;
}

/**
 * Get direct referrals who have active deposits
 * A referral is considered "active deposit" if they have at least one active investment
 */
async function getActiveDepositRefCount(internalId: string): Promise<number> {
  // Get all level-1 referrals
  const directRefs = await db.referral.findMany({
    where: { referrerId: internalId, level: 1 },
    select: { referredId: true },
  });

  if (directRefs.length === 0) return 0;

  const refIds = directRefs.map(r => r.referredId);

  // Count how many of them have at least one active investment
  const usersWithActiveInvestments = await db.investment.groupBy({
    by: ['userId'],
    where: {
      userId: { in: refIds },
      status: 'active',
    },
    _count: true,
  });

  return usersWithActiveInvestments.length;
}

/**
 * Check if ALL direct referrals have active deposits
 * Returns { total, active, allActive }
 */
async function checkAllDirectRefsActive(internalId: string): Promise<{
  total: number;
  active: number;
  allActive: boolean;
}> {
  // Get all level-1 referrals
  const directRefs = await db.referral.findMany({
    where: { referrerId: internalId, level: 1 },
    select: { referredId: true },
  });

  const total = directRefs.length;
  if (total === 0) {
    return { total: 0, active: 0, allActive: false };
  }

  const refIds = directRefs.map(r => r.referredId);

  // Count how many of them have at least one active investment
  const usersWithActiveInvestments = await db.investment.groupBy({
    by: ['userId'],
    where: {
      userId: { in: refIds },
      status: 'active',
    },
    _count: true,
  });

  const active = usersWithActiveInvestments.length;
  return { total, active, allActive: active === total };
}

/**
 * Get all downline user IDs recursively up to maxDepth levels
 */
async function getAllDownlineIds(internalId: string, maxDepth: number = 5): Promise<string[]> {
  const allIds: string[] = [];
  const visited = new Set<string>();
  let currentLevelIds: string[] = [internalId];

  for (let depth = 0; depth < maxDepth; depth++) {
    const nextLevelIds: string[] = [];

    const referrals = await db.referral.findMany({
      where: {
        referrerId: { in: currentLevelIds },
        level: 1,
      },
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

/**
 * Calculate group omzet for a user (sum of all active investments from user + all downline)
 */
async function calculateGroupOmzet(internalId: string): Promise<number> {
  // Include the user's own investments
  const ownInvestment = await db.investment.aggregate({
    where: { userId: internalId, status: 'active' },
    _sum: { amount: true },
  });

  // Get all downline IDs
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

/**
 * Get how many weeks of salary a user has already received
 */
async function getSalaryWeeksReceived(userId: string): Promise<number> {
  const count = await db.salaryBonus.count({
    where: { userId, status: 'paid' },
  });
  return count;
}

/**
 * Simple Rupiah formatting (avoid circular deps)
 */
function formatRupiahSimple(amount: number): string {
  return 'Rp' + Math.floor(amount).toLocaleString('id-ID');
}

/**
 * Check and credit salary bonus for a user.
 * 
 * Logic:
 * - User MUST have an active deposit (investment) themselves
 * - ALL Level 1/direct referrals MUST have active deposits
 * - At least 10 direct referrals required (minDirectRefs)
 * - Salary = salaryRate% (1%) of group omzet (auto-detected)
 * - maxWeeks = 0 means PERMANENT (selamanya, tanpa batas)
 * - Unique per userId+weekNumber+year
 */
export async function checkAndCreditSalaryBonus(userId: string): Promise<{
  success: boolean;
  message: string;
  amount?: number;
  alreadyClaimed?: boolean;
  weekOfTotal?: number;
  maxWeeks?: number;
  weeksRemaining?: number;
}> {
  const { weekNumber, year } = getCurrentWeekInfo();

  // ★ SELF-HEAL: ensure config is always 1% / maxWeeks=0 (kills stale 2.5%/12)
  await selfHealSalaryConfig();

  return await db.$transaction(async (tx) => {
    // Get active salary config
    const config = await tx.salaryConfig.findFirst({
      where: { isActive: true },
    });

    if (!config) {
      return {
        success: false,
        message: 'Konfigurasi gaji mingguan tidak ditemukan atau tidak aktif',
      };
    }

    const salaryRate = config.salaryRate;
    const maxWeeks = config.maxWeeks;
    const requireActiveDeposit = config.requireActiveDeposit;

    // ★ SYARAT 1 (CEK PERTAMA): Wajib invite minimal 10 referral (Level 1)
    const minDirectRefs = config.minDirectRefs || 10;
    const refCheck = await checkAllDirectRefsActive(userId);

    if (refCheck.total === 0) {
      return {
        success: false,
        message: `Anda belum memiliki referral langsung (Level 1). Minimal ${minDirectRefs} undangan aktif diperlukan.`,
      };
    }

    if (refCheck.total < minDirectRefs) {
      return {
        success: false,
        message: `Syarat 1 belum terpenuhi: minimal ${minDirectRefs} undangan langsung. Saat ini Anda baru ${refCheck.total} referral.`,
      };
    }

    // ★ SYARAT 2 (CEK SETELAH SYARAT 1): Wajib aktif investasi (user sendiri)
    if (requireActiveDeposit) {
      const hasActiveDeposit = await userHasActiveDeposit(userId);
      if (!hasActiveDeposit) {
        return {
          success: false,
          message: 'Syarat 2 belum terpenuhi: Anda wajib memiliki investasi aktif untuk mengklaim bonus gaji.',
        };
      }
    }

    // Check if already claimed for this week
    const existingBonus = await tx.salaryBonus.findUnique({
      where: { userId_weekNumber_year: { userId, weekNumber, year } },
    });

    if (existingBonus) {
      return {
        success: false,
        message: 'Gaji mingguan sudah diklaim untuk minggu ini',
        alreadyClaimed: true,
      };
    }

    // Check how many weeks of salary already received
    const weeksReceived = await getSalaryWeeksReceived(userId);
    // ★ maxWeeks <= 0 = UNLIMITED (selamanya) — skip the cap check ★
    const unlimited = !maxWeeks || maxWeeks <= 0;
    if (!unlimited && weeksReceived >= maxWeeks) {
      return {
        success: false,
        message: `Anda sudah menerima gaji mingguan selama ${maxWeeks} minggu. Program gaji telah selesai.`,
        maxWeeks,
      };
    }

    // Check active deposit referrals (semua referral L1 wajib aktif investasi)
    const effectiveActiveRefs = requireActiveDeposit ? refCheck.active : refCheck.total;
    if (effectiveActiveRefs < minDirectRefs) {
      return {
        success: false,
        message: `Minimal ${minDirectRefs} referral dengan investasi aktif diperlukan. Saat ini ${refCheck.active} dari ${refCheck.total} referral yang aktif investasi.`,
      };
    }

    // Calculate group omzet
    const groupOmzet = await calculateGroupOmzet(userId);

    // Calculate salary: salaryRate% of group omzet
    const salaryAmount = Math.floor(groupOmzet * (salaryRate / 100));

    // Minimum salary amount (at least 1 if eligible)
    if (salaryAmount <= 0) {
      return {
        success: false,
        message: `Omzet grup Anda saat ini ${formatRupiahSimple(groupOmzet)}, gaji ${salaryRate}% = ${formatRupiahSimple(0)}. Tidak dapat dikreditkan.`,
      };
    }

    const currentWeekOfTotal = weeksReceived + 1;
    const weekLabel = unlimited ? `Minggu ke-${currentWeekOfTotal} (selamanya)` : `${currentWeekOfTotal}/${maxWeeks}`;

    // Update user's mainBalance
    await tx.user.update({
      where: { id: userId },
      data: {
        mainBalance: { increment: salaryAmount },
        totalProfit: { increment: salaryAmount },
      },
    });

    // Create SalaryBonus entry
    await tx.salaryBonus.create({
      data: {
        userId,
        weekNumber,
        year,
        weekOfTotal: currentWeekOfTotal,
        amount: salaryAmount,
        baseOmzet: groupOmzet,
        salaryRate,
        activeRefDeposits: refCheck.active,
        directRefs: refCheck.total,
        groupOmzet,
        status: 'paid',
      },
    });

    // Create BonusLog entry
    await tx.bonusLog.create({
      data: {
        userId,
        fromUserId: userId,
        type: 'salary',
        level: 0,
        amount: salaryAmount,
        description: `Gaji mingguan Minggu ${weekNumber}/${year} (${weekLabel}) - ${refCheck.active}/${refCheck.total} referral aktif, omzet ${formatRupiahSimple(groupOmzet)}, rate ${salaryRate}%`,
      },
    });

    return {
      success: true,
      message: `Gaji mingguan ${formatRupiahSimple(salaryAmount)} berhasil dikreditkan (${weekLabel})`,
      amount: salaryAmount,
      weekOfTotal: currentWeekOfTotal,
      maxWeeks,
      weeksRemaining: unlimited ? -1 : Math.max(0, maxWeeks - currentWeekOfTotal),
    };
  });
}

/**
 * Process all eligible users for weekly salary (used by cron service)
 * Returns stats about processed users
 */
export async function processAllSalaryBonuses(): Promise<{
  processed: number;
  eligible: number;
  skipped: number;
  completed: number;
  errors: number;
  totalAmount: number;
  details: Array<{ userId: string; amount: number; weekOfTotal: number; message: string }>;
}> {
  const result = {
    processed: 0,
    eligible: 0,
    skipped: 0,
    completed: 0,
    errors: 0,
    totalAmount: 0,
    details: [] as Array<{ userId: string; amount: number; weekOfTotal: number; message: string }>,
  };

  // ★ SELF-HEAL: ensure config is always 1% / maxWeeks=0 (kills stale 2.5%/12)
  await selfHealSalaryConfig();

  // Get active salary config
  const config = await db.salaryConfig.findFirst({ where: { isActive: true } });
  if (!config) {
    console.log('[Salary Cron] No active salary config found. Skipping.');
    return result;
  }

  // Get all users who are not suspended and are verified
  const users = await db.user.findMany({
    where: {
      isSuspended: false,
      isVerified: true,
    },
    select: { id: true, userId: true, name: true },
  });

  console.log(`[Salary Cron] Checking ${users.length} users for salary eligibility...`);

  for (const user of users) {
    try {
      // Quick filter: check if user has any referrals first
      const refCount = await getDirectRefCount(user.id);
      if (refCount === 0) {
        result.skipped++;
        continue;
      }

      // Check weeks received
      const weeksReceived = await getSalaryWeeksReceived(user.id);
      // maxWeeks = 0 means PERMANENT (no limit). Only check limit if maxWeeks > 0.
      if (config.maxWeeks > 0 && weeksReceived >= config.maxWeeks) {
        result.completed++;
        continue;
      }

      // Try to credit salary
      const creditResult = await checkAndCreditSalaryBonus(user.id);
      result.processed++;

      if (creditResult.success) {
        result.eligible++;
        result.totalAmount += creditResult.amount || 0;
        result.details.push({
          userId: user.userId,
          amount: creditResult.amount || 0,
          weekOfTotal: creditResult.weekOfTotal || 0,
          message: creditResult.message,
        });
        console.log(`[Salary Cron] ✅ ${user.userId}: ${creditResult.message}`);
      } else {
        result.skipped++;
        console.log(`[Salary Cron] ⏭️ ${user.userId}: ${creditResult.message}`);
      }
    } catch (error: any) {
      result.errors++;
      console.error(`[Salary Cron] ❌ ${user.userId}: ${error.message}`);
    }
  }

  console.log(`[Salary Cron] Done. Processed: ${result.processed}, Eligible: ${result.eligible}, Skipped: ${result.skipped}, Completed: ${result.completed}, Errors: ${result.errors}, Total: Rp${result.totalAmount.toLocaleString('id-ID')}`);
  return result;
}

/**
 * Get user's salary bonus eligibility information
 */
export async function getUserSalaryEligibility(userId: string): Promise<{
  directRefs: number;
  activeRefDeposits: number;
  minDirectRefs: number;
  groupOmzet: number;
  salaryRate: number;
  maxWeeks: number;
  weeksReceived: number;
  weeksRemaining: number;
  estimatedSalary: number;
  isEligible: boolean;
  isActive: boolean;
  refProgress: number;
  isCompleted: boolean;
  requireActiveDeposit: boolean;
  userHasActiveDeposit: boolean;
  allRefsActive: boolean;
  meetsMinDirectRefs: boolean;
}> {
  // ★ SELF-HEAL: ensure config is always 1% / maxWeeks=0 (kills stale 2.5%/12)
  await selfHealSalaryConfig();

  // Get active salary config
  const config = await db.salaryConfig.findFirst({
    where: { isActive: true },
  });

  const isActive = !!config;
  const salaryRate = config?.salaryRate ?? 1;
  const maxWeeks = config?.maxWeeks ?? 0;
  const requireActiveDeposit = config?.requireActiveDeposit ?? true;
  const minDirectRefs = config?.minDirectRefs ?? 10;
  // ★ maxWeeks <= 0 = UNLIMITED (selamanya) ★
  const unlimited = !maxWeeks || maxWeeks <= 0;

  // Check if user themselves has an active deposit
  const userOwnActiveDeposit = requireActiveDeposit
    ? await userHasActiveDeposit(userId)
    : true;

  // Check all direct referrals - must ALL have active deposits
  const refCheck = await checkAllDirectRefsActive(userId);

  // Calculate group omzet
  const groupOmzet = await calculateGroupOmzet(userId);

  // Weeks received
  const weeksReceived = await getSalaryWeeksReceived(userId);
  const weeksRemaining = unlimited ? -1 : Math.max(0, maxWeeks - weeksReceived);

  // Estimated salary (salaryRate% of group omzet)
  const estimatedSalary = Math.floor(groupOmzet * (salaryRate / 100));

  // Check minimum direct referrals requirement
  const meetsMinDirectRefs = refCheck.total >= minDirectRefs &&
    (requireActiveDeposit ? refCheck.active >= minDirectRefs : refCheck.total >= minDirectRefs);

  // Check eligibility - MUST meet minDirectRefs requirement
  const isEligible = isActive && userOwnActiveDeposit && meetsMinDirectRefs && refCheck.total >= minDirectRefs && (unlimited || weeksReceived < maxWeeks) && estimatedSalary > 0;
  const isCompleted = !unlimited && weeksReceived >= maxWeeks;

  const refProgress = refCheck.total > 0 ? Math.min((refCheck.active / refCheck.total) * 100, 100) : 0;

  return {
    directRefs: refCheck.total,
    activeRefDeposits: refCheck.active,
    minDirectRefs,
    groupOmzet,
    salaryRate,
    maxWeeks,
    weeksReceived,
    weeksRemaining,
    estimatedSalary,
    isEligible,
    isActive,
    refProgress,
    isCompleted,
    requireActiveDeposit,
    userHasActiveDeposit: userOwnActiveDeposit,
    allRefsActive: refCheck.allActive,
    meetsMinDirectRefs,
  };
}

